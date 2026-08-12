import "server-only";

import { asc, desc, eq, sql } from "drizzle-orm";
import type { EventFromLogic } from "xstate";

import {
  area,
  course,
  courseProposal,
  courseProposalReview,
  courseProposalReviewArea,
} from "@/db/classes/schema";
import { classesDb } from "@/db/handles";
import {
  notYours,
  permitted,
  routesFor,
  type ActorFacts,
  type Subject,
} from "@/db/write/rules";
import type { Netid } from "@/db/write/transaction";
import type { Actor } from "@/lib/auth/actor";
import {
  machine as reviewMachine,
  REVIEW_STATES,
  type CourseProposalReviewState as ReviewState,
} from "@/lib/machines/course-proposal-review.machine";

import { getActorFacts } from "./actor-facts";
import { qualified } from "./qualified";
import {
  mayActOnReview,
  mayOpenProposals,
  type OwnTag,
  type PermittedAction,
  type Visible,
} from "./shape";
import { stitchNames, type Directory, type StitchedName } from "./stitch";

/**
 * **The proposals list: one group per proposal, one row per review** (issues/42,
 * issues/85).
 *
 * The sixth view-shaped read module, and **Tier 3's first reader** — three
 * tickets after the tier was written. Four things about it are this view's own
 * rather than inherited from the two lists before it.
 *
 * **The proposal is the group and its per-program reviews are the rows**, which
 * is issues/37's grouping device reused so that the skeleton has one grouping
 * idea rather than two. The two flat alternatives lost for opposite reasons: one
 * row per review repeats the title once per program, and one row per proposal has
 * to fill a status column with no honest value — issues/7 left the proposal
 * **stateless** deliberately, so a derived status is not merely absent but
 * *viewer-dependent*, the proposer seeing `Split` where a single-program director
 * sees `Approved`, same proposal, same day, neither wrong.
 *
 * **The verdict chips on the group header are what dissolve that**, rather than
 * solve it. They are per-program, so nothing derives anything and the question
 * stops existing.
 *
 * **may-read is wider than may-act here, and that is the whole point of the
 * screen.** A proposal reached by any one of Tier 3's arms opens **every** one of
 * its sibling reviews: the reviews being independent and able to disagree is
 * issues/7's reason for splitting the machine, and a screen that hides the
 * disagreement hides the point. What the arms decide is the row's **fidelity** —
 * a review inside them carries a permitted-action set, one outside them is
 * read-only, with controls and refusals absent together, which is not new
 * machinery but what `student` and `advisor` already get elsewhere (issues/38).
 *
 * **The tier narrows in this module rather than in the query**, which is a
 * departure from the Lineup and the Course page and the one thing here a build
 * agent reading issues/82 alone would do differently. See `reachable` below.
 */

/**
 * **One group per proposal.** The shared body sits here and is stated once —
 * title, credits, who proposed it and when — and a review row carries only what
 * differs between siblings.
 */
export type ProposalGroup = {
  proposalId: string;
  title: string;
  credits: number;
  proposedBy: StitchedName;
  proposedAt: string;
  /**
   * **Every program's verdict, whether or not your arms reach it** — `ITP ✓ ·
   * IMA ◐ · LOW ✗` (issues/42).
   *
   * Never narrowed by the filter either: the filter says which reviews are worth
   * a row today, and the chips say what the department has decided, which is a
   * fact about the proposal rather than about the reader's current question.
   */
  verdicts: readonly { programCode: string; state: ReviewState }[];
  /** Every review, as rows — narrowed by the filter and by nothing else. */
  reviews: readonly ProposalReviewRow[];
};

/**
 * One review: **the row *is* the request** (issues/10), which is why no
 * requested-programs table exists and why this row carries a program rather than
 * the proposal carrying a list of them.
 */
export type ProposalReviewRow = {
  reviewId: string;
  programCode: string;
  state: ReviewState;
  areaHead: StitchedName | null;
  areas: readonly OwnTag[];
  /**
   * The course this review's `approve` minted, where it has one (issues/42,
   * issues/49). `course.minted_from_review_id` is the column issues/42 added and
   * issues/49 tightened to `NOT NULL`, so this join is the one route from a
   * decision to its consequence.
   */
  mintedCourse: { courseId: string; courseNumber: string } | null;
  /**
   * **`null` is read-only, not *can never act*** — which is this module's one
   * departure from the Catalog's and the Lineup's reading of the same field.
   *
   * There, a `null` action set means the reader holds no acting role at all and
   * the column is absent from the table. Here the whole screen is already refused
   * to those readers, and what `null` marks is a **sibling review outside your
   * arms**: issues/38's rule that read-only means controls *and* refusals absent
   * rather than greyed. A refused control the reader was never eligible for is
   * dead text explaining a button that was never there.
   */
  actions: readonly PermittedAction<ReviewEventName>[] | null;
};

/**
 * The review machine's event names, read off the machine rather than restated
 * (issues/13's rule that a hand-maintained second list is the thing that gets
 * forgotten).
 *
 * Named `ReviewEventName` and not `ReviewEvent` because
 * `db/write/apply-transition.ts` already owns that name for the richer thing a
 * *transition* carries — here `approve` arrives with the course number its mint
 * will use. A row offers a move; the writer takes the move and what came with it.
 */
export type ReviewEventName = EventFromLogic<typeof reviewMachine>["type"];

/**
 * **Four filters, and finished reviews stay in the query and out of the
 * default** (issues/42), on issues/37's `Retired` precedent: hiding an approved
 * review in the query would make it unreachable from the only screen that lists
 * proposals, and it is the only route to the course it minted.
 *
 * `rejected` gets a filter of its own rather than being folded into `any`,
 * because unlike a retired course a rejected review leads **nowhere at all** —
 * it minted nothing, it is final, and it would otherwise sit in the catch-all
 * forever with no onward journey.
 */
export type ProposalsFilters = {
  view: "in-play" | "needs-me" | "rejected" | "any";
};

/**
 * **Tier 3's first reader**, and the second read module to refuse a whole screen
 * (issues/40, issues/42).
 *
 * `{ visible: false }` is the `student` and the `advisor`: Tier 3 has no arm that
 * reaches them, so the screen is refused and the nav item is absent rather than
 * disabled. Everyone else gets the page — including a `coordinator`, who holds
 * no Tier 3 arm and will see it empty, because *a screen you could in principle
 * fill and have not* is a different fact from *a screen that is not for you*.
 *
 * **Two round trips**, as on the Lineup and for the same reason: the proposals
 * with their reviews in one statement against `classes`, then every netid the
 * page will display — the proposers and the assigned area heads — batched into
 * one query against `people`. `db/read/proposals.test.ts` counts them.
 */
export async function getProposalsPage(
  actor: Actor,
  filters: ProposalsFilters,
): Promise<Visible<readonly ProposalGroup[]>> {
  const facts = await getActorFacts(actor.netid);
  if (!mayOpenProposals(facts.roles)) return { visible: false };

  const rows = await classesDb()
    .select({
      proposalId: courseProposal.courseProposalId,
      title: courseProposal.title,
      credits: courseProposal.credits,
      createdBy: courseProposal.createdBy,
      createdAt: courseProposal.createdAt,

      reviewId: courseProposalReview.courseProposalReviewId,
      programCode: courseProposalReview.programCode,
      status: courseProposalReview.status,
      areaHead: courseProposalReview.areaHead,

      // The review's own areas, aggregated as JSON beside it — the device the
      // Lineup's one statement uses, for the reason it uses it: the alternative
      // is a second set-based read whose cost grows with the number of reviews.
      areas: REVIEW_AREAS,

      // **The one route from a decision to its consequence**, and a `LEFT` join
      // because most reviews have not approved anything: `minted_from_review_id`
      // is `NOT NULL` on the course side and unique, so this can match at most
      // one course and can never multiply a review's row.
      mintedCourseId: course.courseId,
      mintedCourseNumber: course.courseNumber,
    })
    .from(courseProposalReview)
    .innerJoin(
      courseProposal,
      eq(courseProposal.courseProposalId, courseProposalReview.courseProposalId),
    )
    .leftJoin(course, eq(course.mintedFromReviewId, courseProposalReview.courseProposalReviewId))
    // **Newest proposal first**, which is what a queue of decisions is read in,
    // with the key breaking ties so two proposals written in one transaction do
    // not tell a different story on every render. Reviews sit in program order
    // within their group, which is the order the verdict chips read in too.
    .orderBy(
      desc(courseProposal.createdAt),
      desc(courseProposal.courseProposalId),
      asc(courseProposalReview.programCode),
    );

  const groups = gathered(rows);

  // **The stitch's one query**: every proposer and every assigned area head on
  // the page, resolved together. The netids of the *actors* who moved a review
  // are not here — a history is the review page's, not a list's.
  const directory = await stitchNames(
    groups.flatMap((group) => [
      group.createdBy,
      ...group.reviews.flatMap((review) => (review.areaHead ? [review.areaHead] : [])),
    ]),
  );

  return { visible: true, page: shown(groups, facts, directory, filters) };
}

/**
 * **Whether this actor may propose a course at all**, which is the affordance
 * behind the control beside the heading and inside the empty state (issues/43,
 * issues/65, issues/85).
 *
 * It is the create act's own permission term, asked one step earlier — the same
 * move the `⋯ n` menu makes for a transition, and asked through the same
 * functions, so the control and `createProposal`'s own check cannot disagree.
 * The subject is empty because the act is flat by construction: at create time
 * there is no proposal, no review and no course, so there is nothing for a
 * relationship to scope to.
 *
 * It costs no round trip — `getActorFacts` is `cache()`d and the page has
 * already paid for it.
 */
export async function mayProposeACourse(actor: Actor): Promise<boolean> {
  const facts = await getActorFacts(actor.netid);
  return permitted(routesFor("course_proposal_review", "create"), facts, {});
}

// ---------------------------------------------------------------------------
// The one statement's children
// ---------------------------------------------------------------------------

/**
 * A review's areas, as JSON beside the review row — the review-level half of the
 * assignment `approve` copies into `course_area` (issues/25, issues/32).
 *
 * The composite foreign key makes *a review's areas are its own program's* a
 * database rule, so these render unlabelled for the reason a course's own tags
 * do: the only program name a screen puts against a record other than its own is
 * a seat-sharing grant, and seat sharing attaches to a section.
 */
const REVIEW_AREAS = sql<readonly OwnTag[]>`(
  SELECT coalesce(json_agg(json_build_object('name', ${qualified(area.name)}) ORDER BY ${qualified(area.name)}), '[]'::json)
  FROM ${courseProposalReviewArea}
  JOIN ${area} ON ${qualified(area.areaId)} = ${qualified(courseProposalReviewArea.areaId)}
  WHERE ${qualified(courseProposalReviewArea.courseProposalReviewId)}
      = ${qualified(courseProposalReview.courseProposalReviewId)}
)`;

/** One row of the one statement: a review, with its proposal's body repeated beside it. */
type Row = {
  proposalId: number;
  title: string;
  credits: number;
  createdBy: Netid;
  createdAt: Date;
  reviewId: number;
  programCode: string;
  status: string | null;
  areaHead: Netid | null;
  areas: readonly OwnTag[];
  mintedCourseId: number | null;
  mintedCourseNumber: string | null;
};

/** A proposal and its reviews, before either the tier or the filter has been asked. */
type Gathered = {
  proposalId: number;
  title: string;
  credits: number;
  createdBy: Netid;
  createdAt: Date;
  reviews: Row[];
};

function gathered(rows: readonly Row[]): readonly Gathered[] {
  const groups = new Map<number, Gathered>();

  for (const row of rows) {
    const group = groups.get(row.proposalId) ?? {
      proposalId: row.proposalId,
      title: row.title,
      credits: row.credits,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      reviews: [],
    };
    groups.set(row.proposalId, group);
    group.reviews.push(row);
  }

  return [...groups.values()];
}

// ---------------------------------------------------------------------------
// The tier, and the filter
// ---------------------------------------------------------------------------

/**
 * **The tier is applied here rather than in the query, and it is the one place
 * this module departs from the two lists before it** (issues/28, issues/42).
 *
 * The Lineup narrows `offering.status` in the `WHERE` clause because the tier
 * there *is* a set of states — a fact about the row, expressible as one `IN`.
 * Tier 3's may-read is not a fact about a review at all: it is *do you hold a
 * may-act arm on **any** review of this proposal*, over three arms of three
 * different shapes, one of which is a comparison against a column on the parent
 * and one of which is the chair's flat clause. Written as SQL it would be a
 * second copy of the tier, phrased as a filter — and a second copy is the thing
 * issues/14 spends the whole map preventing. Written here it is one call to the
 * writer's own `satisfies`, through `mayActOnReview`, and the read side and the
 * write side cannot drift.
 *
 * What that costs is that the statement reads every proposal rather than the
 * reader's. It stops being the right shape at the scale a pager becomes
 * necessary — the same threshold as the Lineup's in-memory search, in the low
 * thousands of rows, and the same recovery: narrow in the query by the one arm
 * that *is* expressible, the directorship, and keep this predicate over what
 * comes back. Recorded in `docs/data-access/README.md`.
 */
function shown(
  groups: readonly Gathered[],
  facts: ActorFacts,
  directory: Directory,
  filters: ProposalsFilters,
): readonly ProposalGroup[] {
  const out: ProposalGroup[] = [];

  for (const group of groups) {
    const arms = group.reviews.map((review) => mayActOnReview(facts, subjectFor(group, review)));
    // **Reachability is the proposal's, not the review's** — any one arm opens
    // every sibling, which is issues/42's deliberate widening.
    if (!arms.some(Boolean)) continue;

    const reviews = group.reviews.map((review, index) =>
      asRow(group, review, facts, directory, arms[index] ?? false),
    );

    const kept = reviews.filter((review) => matches(filters.view, review));
    if (kept.length === 0) continue;

    out.push({
      proposalId: String(group.proposalId),
      title: group.title,
      credits: group.credits,
      proposedBy: directory(group.createdBy),
      proposedAt: group.createdAt.toISOString(),
      // Off the **unfiltered** reviews: the chips are what every program has
      // decided, and a filter is a question about today's work.
      verdicts: reviews.map((review) => ({
        programCode: review.programCode,
        state: review.state,
      })),
      reviews: kept,
    });
  }

  return out;
}

function asRow(
  group: Gathered,
  review: Row,
  facts: ActorFacts,
  directory: Directory,
  mayAct: boolean,
): ProposalReviewRow {
  const state = review.status as ReviewState;

  return {
    reviewId: String(review.reviewId),
    programCode: review.programCode,
    state,
    areaHead: review.areaHead ? directory(review.areaHead) : null,
    areas: review.areas,
    mintedCourse:
      review.mintedCourseId !== null && review.mintedCourseNumber !== null
        ? { courseId: String(review.mintedCourseId), courseNumber: review.mintedCourseNumber }
        : null,
    actions: mayAct ? reviewActionsFor(state, subjectFor(group, review), facts) : null,
  };
}

/**
 * The record a permission is scoped to, assembled once and read by both
 * questions this module asks of it — *does an arm of the tier reach this
 * review* and *may this actor fire this move*. They are different questions over
 * the same subject, and building it twice is how the two come to disagree about
 * which review they were talking about.
 */
function subjectFor(group: Gathered, review: Row): Subject {
  return {
    review: {
      programCode: review.programCode,
      areaHead: review.areaHead,
      state: review.status ?? "",
    },
    proposal: { createdBy: group.createdBy },
  };
}

/**
 * **Machine legality AND permissions, intersected here** — the same terms in the
 * same order as `applyTransition`, computed one step earlier so a row can say
 * what it offers before anybody clicks (issues/28, issues/37).
 *
 * The review machine carries **no invariants**, unlike the Course's
 * `noLiveOfferings` and the Offering's retired-course rule, so the intersection
 * is two terms rather than three and every refusal here is a permission
 * refusal — the writer's own sentence, `notYours`, so what the greyed control
 * says and what `applyTransition` throws cannot drift apart.
 *
 * A move the machine does not offer is **absent** rather than greyed: `Approved`
 * and `Rejected` are final, so a finished review carries no menu rather than an
 * empty one, and *finished* is a shape of the lifecycle rather than a refusal.
 *
 * It sits in this module rather than in a `review-rows.ts` because there is
 * exactly one view of a review row today. When the review page arrives it
 * becomes the second, and this function moves out beside `offeringActionsFor`
 * for the reason that one moved: two screens offering different moves on one
 * record, neither of them the writer's answer, is what a second intersection
 * produces.
 */
export function reviewActionsFor(
  state: ReviewState,
  subject: Subject,
  facts: ActorFacts,
): readonly PermittedAction<ReviewEventName>[] {
  return movesFrom(state).map((event) => {
    const routes = routesFor("course_proposal_review", event);
    return permitted(routes, facts, subject)
      ? { event, permitted: true }
      : { event, permitted: false, refusal: notYours(event, "this review", routes, subject) };
  });
}

/**
 * The edges the machine draws out of one state, read off the machine itself.
 * `.can()` is deliberately not what asks — it folds guards in, and this machine
 * has none to fold, so asking it would be asking a different question that
 * happens to agree.
 */
function movesFrom(state: ReviewState): readonly ReviewEventName[] {
  return reviewMachine.states[state].ownEvents as readonly ReviewEventName[];
}

/**
 * **What each of the four filters claims, in one place.**
 *
 * *Needs me* is the only one that is not a fact about the review: it is the `⋯ n`
 * menu's own count asked as a question, so a row is in it exactly when the menu
 * on that row would open with something clickable. It cannot be a state filter —
 * the same `Proposed` review needs one person and not another — which is why it
 * is applied after the permitted-action set has been computed rather than beside
 * the states.
 */
function matches(view: ProposalsFilters["view"], review: ProposalReviewRow): boolean {
  switch (view) {
    case "in-play":
      return IN_PLAY.includes(review.state);
    case "needs-me":
      return (review.actions ?? []).some((action) => action.permitted);
    case "rejected":
      return review.state === REJECTED;
    case "any":
      return true;
  }
}

/**
 * **In play is *not finished*, read off the machine** rather than typed out as
 * *`Proposed` or `Developing`* (issues/13's rule about hand-maintained second
 * lists). A fifth state added between the proposal and its verdict arrives in
 * this filter without anybody choosing to bring it, and a state made final
 * leaves it the same way.
 */
const IN_PLAY: readonly ReviewState[] = REVIEW_STATES.filter(
  (state) => reviewMachine.states[state].type !== "final",
);

/**
 * `Rejected` is named, because it is one state and not a set — and typed as a
 * `ReviewState`, so a rename in the machine is a compiler error here rather than
 * a filter that quietly matches nothing.
 */
const REJECTED: ReviewState = "Rejected";

/**
 * **Both halves of the default have to exist for the default to mean anything.**
 *
 * *Finished reviews stay in the query and out of the default* is a sentence
 * about two non-empty sets. A machine whose every state was final would make the
 * default show nothing at all; one with no final state would make it show
 * everything, and *In play* would silently become *Any state* — the quiet kind
 * of mistake, since the screen would still render a full list and no reader
 * would learn that a filter had stopped filtering.
 */
if (IN_PLAY.length === 0 || IN_PLAY.length === REVIEW_STATES.length) {
  throw new Error(
    "The review machine's states are either all final or none of them are, so *In play* is not a " +
      "filter (issues/42, issues/85). It is read off the machine deliberately; if the lifecycle " +
      "has changed shape, the four filters need re-deciding rather than re-deriving.",
  );
}
