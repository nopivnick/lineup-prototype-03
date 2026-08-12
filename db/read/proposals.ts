import "server-only";

import { asc, desc, eq } from "drizzle-orm";

import { course, courseProposal, courseProposalReview, program } from "@/db/classes/schema";
import { classesDb } from "@/db/handles";
import { notYours, permitted, routesFor, type ActorFacts } from "@/db/write/rules";
import type { Netid } from "@/db/write/transaction";
import type { Actor } from "@/lib/auth/actor";
import {
  machine as reviewMachine,
  REVIEW_STATES,
  type CourseProposalReviewState as ReviewState,
} from "@/lib/machines/course-proposal-review.machine";

import { getActorFacts } from "./actor-facts";
import {
  armsReach,
  asReviewRow,
  REVIEW_AREAS,
  type ProposalGroup,
  type ProposalReviewRow,
  type ReviewRowSource,
} from "./review-rows";
import { mayOpenProposals, type Refusal, type Visible } from "./shape";
import { stitchNames, type Directory } from "./stitch";

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
 *
 * **The group, the row and the permitted-action set are `db/read/review-rows.ts`**
 * since issues/86, which built the second view of a review. They lived here while
 * there was one, and moved on the terms `reviewActionsFor` itself stated: two
 * screens offering different moves on one record, neither of them the writer's
 * answer, is what a second intersection produces.
 */

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
  return (await proposeRefusal(actor)) === null;
}

/**
 * The propose form, or the refusal instead of one — **one value either way**
 * (issues/14): where there is no form, the reason travels with the absence.
 */
export type ProposeForm =
  | { mayPropose: true; programs: readonly ProgramChoice[] }
  | { mayPropose: false; refusal: Refusal };

/**
 * One program, as an option on the form — and **the option is the row it mints**
 * (issues/10, issues/43). There is no requested-programs table, so checking this
 * box is not recording a preference: it is a `course_proposal_review` the submit
 * will write.
 *
 * `degreeLevel` rides along because it is the one fact that distinguishes the
 * three programs on a form that is otherwise three codes, and a proposer picking
 * where a course is read should be able to tell the graduate programs from the
 * undergraduate one without leaving the page.
 */
export type ProgramChoice = { code: string; name: string; degreeLevel: string };

/**
 * **What the propose form needs, and the refusal where there is no form**
 * (issues/43, issues/88).
 *
 * **The create route adds no read module of its own**, which is issues/62's
 * arrangement for the three edit routes arriving at the one create route the
 * skeleton builds. It lives here because the affordance already does: the control
 * beside this list's heading is `mayProposeACourse`, and the page behind that
 * control asking a *different* function whether the reader may use it is how a
 * control and its destination come to disagree. Both are the same term, in two
 * shapes — a boolean where a control is being drawn, a refusal where a page has
 * to say why there is nothing on it. Recorded in `docs/data-access/README.md`.
 *
 * **The refusal is the writer's own** (issues/14), so what the page states one
 * step early and what `createProposal` throws at whoever posts the form anyway
 * are one sentence.
 *
 * **One statement, and only for a reader who may propose.** A refused reader
 * costs nothing beyond the facts that refused them — there is no form for the
 * programs to be checkboxes on. `db/read/proposals.test.ts` counts both.
 */
export async function getProposeForm(actor: Actor): Promise<ProposeForm> {
  const refusal = await proposeRefusal(actor);
  if (refusal) return { mayPropose: false, refusal };

  const programs = await classesDb()
    .select({ code: program.code, name: program.name, degreeLevel: program.degreeLevel })
    .from(program)
    // Program order, which is the order the verdict chips read in on the list the
    // submit lands on: a proposer who checked two boxes should meet them again in
    // the order they checked them in.
    .orderBy(asc(program.code));

  return { mayPropose: true, programs };
}

/**
 * **The create act's permission term, asked one step earlier** — the same move
 * the `⋯ n` menu makes for a transition, and asked through the same functions, so
 * the control, the page and `createProposal`'s own check cannot disagree.
 *
 * The subject is empty because the act is flat by construction: at create time
 * there is no proposal, no review and no course, so there is nothing for a
 * relationship to scope to. `null` is *permitted*; a `Refusal` is the sentence.
 *
 * It costs no round trip — `getActorFacts` is `cache()`d and both callers'
 * pages have already paid for it.
 */
async function proposeRefusal(actor: Actor): Promise<Refusal | null> {
  const facts = await getActorFacts(actor.netid);
  const routes = routesFor("course_proposal_review", "create");
  return permitted(routes, facts, {}) ? null : notYours("propose", "a course", routes, {});
}

// ---------------------------------------------------------------------------
// The one statement's rows
// ---------------------------------------------------------------------------

/**
 * One row of the one statement: a review, with its proposal's body repeated
 * beside it. The review's own half is `ReviewRowSource`, shared with the record
 * page that reads the same columns.
 */
type Row = ReviewRowSource & {
  proposalId: number;
  title: string;
  credits: number;
  createdBy: Netid;
  createdAt: Date;
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
    const arms = group.reviews.map((review) => armsReach(facts, review, group));
    // **Reachability is the proposal's, not the review's** — any one arm opens
    // every sibling, which is issues/42's deliberate widening.
    if (!arms.some(Boolean)) continue;

    const reviews = group.reviews.map((review, index) =>
      asReviewRow(review, group, facts, directory, arms[index] ?? false),
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
      // decided, and a filter is a question about today's work. That is also why
      // each one carries its review's id — a chip whose row the filter has
      // dropped is the only route left to that review.
      verdicts: reviews.map((review) => ({
        reviewId: review.reviewId,
        programCode: review.programCode,
        state: review.state,
      })),
      reviews: kept,
    });
  }

  return out;
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
