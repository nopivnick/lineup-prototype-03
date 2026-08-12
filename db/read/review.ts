import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  course,
  courseProposal,
  courseProposalReview,
  courseProposalReviewTransition,
} from "@/db/classes/schema";
import { classesDb } from "@/db/handles";
import type { ActorFacts } from "@/db/write/rules";
import type { Netid } from "@/db/write/transaction";
import type { Actor } from "@/lib/auth/actor";
import type { CourseProposalReviewState as ReviewState } from "@/lib/machines/course-proposal-review.machine";

import { getActorFacts } from "./actor-facts";
import { notOfferableYet, type NotOfferableYet } from "./course-rows";
import {
  armsReach,
  asReviewRow,
  bodyHasDrifted,
  reviewActionsFor,
  reviewSubject,
  REVIEW_AREAS,
  type ProposalGroup,
  type ProposalSource,
  type ReviewEventName,
  type ReviewRowSource,
} from "./review-rows";
import {
  editAffordanceFor,
  type EditAffordance,
  type History,
  type HistoryLine,
  type LastChanged,
  type OwnTag,
  type PermittedAction,
  type Visible,
} from "./shape";
import { stitchPeople, type StitchedName, type StitchedPerson } from "./stitch";

/**
 * **The review page — the first read in the whole map that returns the same
 * record at two fidelities** (issues/42, issues/86).
 *
 * It is the **last of the seven view-shaped read modules** `READ_MODULES` names
 * — the map's data-access seam is complete with it — and it takes the Course page's
 * conventions unchanged: the record on the left, what you may do about it on the
 * right in a sticky rail, the history in sentences at the foot of the main
 * column. Four things about it are this page's own.
 *
 * **The two fidelities are Tier 3's may-read predicate against its may-act
 * predicate.** issues/42 widened may-read past the arms deliberately: a proposal
 * reached by any one arm opens **every** one of its sibling reviews, because the
 * reviews being independent and able to disagree is issues/7's reason for
 * splitting the machine, and a screen hiding the disagreement hides the point.
 * What the arms then decide is the **fidelity** — a review inside them carries a
 * permitted-action set and an edit affordance, and one outside them opens
 * **read-only**, with controls and refusals absent together (issues/38). That is
 * not new machinery: it is what `student` and `advisor` already get elsewhere.
 *
 * **Refusing the page would be incoherent, which is the argument the read-only
 * fidelity was bought with.** The proposals list has already shown that review's
 * verdict on a chip, and the chip is the control that opens it. A refusal phrased
 * to leak nothing, arriving after the leak, is a worse answer than the page. What
 * the read-only fidelity keeps is **the history with its reasons**, which was the
 * whole justification: the reason another program gave is the most useful thing
 * on this page to a director still deciding.
 *
 * **The history is never absent here, and that is the tier speaking rather than
 * this module being generous.** On the Course and Offering pages the history is
 * Tier 2's — `course_transition` and `offering_transition` rows — so a `student`
 * and an `advisor` lose it. `course_proposal_review_transition` rows are **Tier
 * 3's own subject**, and Tier 3's may-read is what put the reader on this page at
 * all, so there is no reader here with the record and without its log. The
 * *last changed* stamp goes with it, being the same class of fact.
 *
 * **Two `classes` statements and one `people` statement.** The proposal with
 * *every* one of its reviews in one statement — the group header this page
 * restates is the same group the list renders, so it is read the same way — then
 * this review's transition log, then every netid the page will display batched
 * into one query against `people`. `db/read/review.test.ts` counts them.
 */
export async function getReviewPage(
  reviewId: string,
  actor: Actor,
): Promise<Visible<ReviewPage>> {
  // A URL is a public input, so what counts as a review id is stated rather than
  // left to `Number`, which reads `" 12 "`, `"1e3"` and `"0x0c"` as reviews.
  // Leading zeros go with them: `/reviews/007` rendering the record `7` does
  // gives it countably many addresses, and `fireReviewEvent` revalidates the
  // canonical one, so a move fired from the odd address would leave the reader on
  // a page known to be stale. `db/read/course.ts` and `db/read/offering.ts` say
  // the same, in the same shape.
  if (!REVIEW_ID.test(reviewId)) return { visible: false };
  const id = Number(reviewId);
  if (!Number.isSafeInteger(id)) return { visible: false };

  const facts = await getActorFacts(actor.netid);

  // **The self-join is what makes *the group* the unit of the read.** Tier 3's
  // may-read is a question about the proposal and not about the review — *do you
  // hold an arm on **any** of these* — so a statement that fetched the addressed
  // review alone would have to go back for its siblings before it could answer
  // whether the reader may see the one it already has.
  const target = alias(courseProposalReview, "target");

  const rows = await classesDb()
    .select({
      proposalId: courseProposal.courseProposalId,
      title: courseProposal.title,
      description: courseProposal.description,
      credits: courseProposal.credits,
      createdBy: courseProposal.createdBy,
      createdAt: courseProposal.createdAt,
      proposalUpdatedBy: courseProposal.updatedBy,
      proposalUpdatedAt: courseProposal.updatedAt,

      reviewId: courseProposalReview.courseProposalReviewId,
      programCode: courseProposalReview.programCode,
      status: courseProposalReview.status,
      areaHead: courseProposalReview.areaHead,
      reviewCreatedBy: courseProposalReview.createdBy,
      reviewCreatedAt: courseProposalReview.createdAt,
      reviewUpdatedBy: courseProposalReview.updatedBy,
      reviewUpdatedAt: courseProposalReview.updatedAt,

      areas: REVIEW_AREAS,

      // **The one route from a decision to its consequence**, and a `LEFT` join
      // because most reviews have approved nothing: `minted_from_review_id` is
      // `NOT NULL` on the course side and unique, so this matches at most one
      // course and can never multiply a review's row.
      mintedCourseId: course.courseId,
      mintedCourseNumber: course.courseNumber,
      // The minted body, read so the drift line can compare it. The mint
      // **copies** (issues/7), so these three and the proposal's own three are
      // free to disagree, and nothing else in the system records that they do.
      mintedTitle: course.title,
      mintedDescription: course.description,
      mintedCredits: course.credits,
    })
    .from(courseProposalReview)
    .innerJoin(
      courseProposal,
      eq(courseProposal.courseProposalId, courseProposalReview.courseProposalId),
    )
    // Every review of the proposal the addressed review belongs to, the addressed
    // one included. A row comes back only if that id names a review at all, so
    // *an id that names nothing* needs no second check.
    .innerJoin(
      target,
      and(
        eq(target.courseProposalId, courseProposalReview.courseProposalId),
        eq(target.courseProposalReviewId, id),
      ),
    )
    .leftJoin(course, eq(course.mintedFromReviewId, courseProposalReview.courseProposalReviewId))
    // Program order, which is the order the verdict chips read in on the list.
    .orderBy(asc(courseProposalReview.programCode));

  const [first] = rows;
  if (!first) return { visible: false };

  const proposal: ProposalSource = { createdBy: first.createdBy };
  // The addressed review is **in** `rows` by construction — the join's second
  // clause is its own id and its first is the proposal they share — so this is a
  // narrowing rather than a case. It answers with the refusal rather than
  // throwing because a page has a URL and has to answer, and there is no world in
  // which a reader is better served by a stack trace than by the one sentence
  // every other not-visible world gets.
  const record = rows.find((row) => row.reviewId === id);
  if (!record) return { visible: false };

  // **Reachability is the proposal's and fidelity is the review's** — the whole
  // shape of this page in two lines (issues/42). An actor with no arm anywhere on
  // the proposal gets the record-level refusal; an actor with an arm somewhere
  // but not here gets the record, read-only.
  const arms = rows.map((row) => armsReach(facts, row, proposal));
  if (!arms.some(Boolean)) return { visible: false };

  const mayAct = armsReach(facts, record, proposal);
  const state = record.status as ReviewState;

  const moves = await classesDb()
    .select({
      event: courseProposalReviewTransition.event,
      fromState: courseProposalReviewTransition.fromState,
      toState: courseProposalReviewTransition.toState,
      actorNetid: courseProposalReviewTransition.actorNetid,
      subjectNetid: courseProposalReviewTransition.subjectNetid,
      reason: courseProposalReviewTransition.reason,
      at: courseProposalReviewTransition.at,
    })
    .from(courseProposalReviewTransition)
    .where(eq(courseProposalReviewTransition.courseProposalReviewId, id))
    // Oldest first — a history is read forwards — and the key breaks ties,
    // because two moves in one transaction share a timestamp and an arbitrary
    // order would be a different story on every render.
    .orderBy(
      asc(courseProposalReviewTransition.at),
      asc(courseProposalReviewTransition.courseProposalReviewTransitionId),
    );

  const changed = lastChangedOf(record);

  // **The stitch's one query**, over every netid this page will display: the
  // proposer, every sibling review's assigned area head, whoever last changed
  // either half of the record, and both the actor and the subject of every logged
  // move. Gathered and asked once, never one lookup per row.
  const directory = await stitchPeople([
    first.createdBy,
    record.reviewCreatedBy,
    ...rows.flatMap((row) => (row.areaHead ? [row.areaHead] : [])),
    ...(changed ? [changed.by] : []),
    ...moves.flatMap((move) =>
      move.subjectNetid ? [move.actorNetid, move.subjectNetid] : [move.actorNetid],
    ),
  ]);

  const named = (netid: Netid): StitchedName => {
    const person = directory(netid);
    return { netid: person.netid, displayName: person.displayName };
  };

  return {
    visible: true,
    page: {
      fidelity: mayAct ? "may-act" : "read-only",
      reviewId: String(record.reviewId),
      programCode: record.programCode,
      state,

      // **The group header restated above the record**, assembled by the module
      // the list assembles it with (issues/86). Every review, never narrowed:
      // this page has no filter, and the chips are what the department has
      // decided rather than an answer to today's question.
      proposal: {
        proposalId: String(first.proposalId),
        title: first.title,
        credits: first.credits,
        // **`named` and not `directory`**, here and on the rows below: a group
        // header and a review row state a person as a *fact about a record*, so
        // they carry `StitchedName` and pronouns stop at the two places issues/40
        // named. The resolver is total either way; what differs is what leaves
        // the module.
        proposedBy: named(first.createdBy),
        proposedAt: first.createdAt.toISOString(),
        verdicts: rows.map((row) => ({
          reviewId: String(row.reviewId),
          programCode: row.programCode,
          state: row.status as ReviewState,
        })),
        reviews: rows.map((row, index) =>
          asReviewRow(row, proposal, facts, named, arms[index] ?? false),
        ),
      },

      body: {
        title: first.title,
        description: first.description,
        credits: first.credits,
      },
      bodyShare: bodyShareOf(rows),

      areas: record.areas,
      /**
       * **The Catalog's *not offerable yet* marker, one step earlier than the
       * Catalog can state it** (issues/32, issues/37, issues/43) — and the
       * shared helper rather than a third derivation, because area and head
       * being separate assignments is one rule and *half missing* is a real
       * state with its own sentence on every screen that says it. Here it warns
       * about a course that does not exist yet; there it marks one that does.
       */
      notOfferableYet: notOfferableYet(record.areas.length, record.areaHead),
      // **One of the places a person is presented as a person**, so pronouns
      // show (issues/40) — the review's area head is who a director is deciding
      // whether to hand a course to, not the subject of a timestamp.
      areaHead: record.areaHead ? directory(record.areaHead) : null,
      /**
       * **The coincidence, stated because forbidding it was ruled out of scope**
       * (issues/42). The obvious rule — a proposer may not approve their own
       * proposal — has an unchecked failure mode: a small program may have
       * exactly one area head, and the rule could leave certain proposals with no
       * legal approver at all. Making it visible costs nothing and it is the one
       * place in the system where a reader can see it.
       */
      authorIsAreaHead: record.areaHead !== null && record.areaHead === first.createdBy,

      mintedCourse:
        record.mintedCourseId !== null && record.mintedCourseNumber !== null
          ? { courseId: String(record.mintedCourseId), courseNumber: record.mintedCourseNumber }
          : null,

      // **Both absent together at the read-only fidelity**, which is issues/38's
      // rule: read-only means controls *and* refusals absent rather than greyed,
      // because a refusal under a control the reader was never eligible for is
      // dead text explaining a button that was never there.
      actions: mayAct
        ? reviewActionsFor(state, reviewSubject(record, proposal), facts)
        : null,
      edit: mayAct ? editOf(record, rows, proposal, facts) : null,

      lastChanged: changed ? { by: named(changed.by), at: changed.at.toISOString() } : null,
      history: {
        /**
         * **The creation line names the proposer and the program that was
         * asked** — *"Rui Chen proposed this and asked ITP to review it"* — which
         * is the absence of a requested-programs table made legible on the one
         * screen where it matters (issues/10, issues/42). The row **is** the
         * request, so the request has no record of its own to read; the sentence
         * is the page's and the two facts under it are this row's own
         * `created_by` and `program_code`.
         */
        creation: {
          by: named(record.reviewCreatedBy),
          at: record.reviewCreatedAt.toISOString(),
        },
        moves: moves.map(
          (move): HistoryLine => ({
            event: move.event,
            fromState: move.fromState,
            toState: move.toState,
            actor: named(move.actorNetid),
            // **Never set on this machine**, and read anyway: `subject_netid` is
            // on all three logs and what a review move is *about* is the review,
            // so the column stays null here. Reading it costs nothing and a
            // fourth event that carried one would arrive rendered.
            subject: move.subjectNetid ? named(move.subjectNetid) : null,
            reason: move.reason,
            at: move.at.toISOString(),
          }),
        ),
      },
    },
  };
}

/**
 * A record's address: the digits of its id and nothing else — no sign, no space,
 * no leading zero. `0` is allowed through and simply names nothing, the id column
 * being `GENERATED ALWAYS AS IDENTITY` from 1; a pattern that special-cased it
 * would be refusing a row on arithmetic rather than on addressing.
 */
const REVIEW_ID = /^(?:0|[1-9][0-9]*)$/;

// ---------------------------------------------------------------------------
// The composed page
// ---------------------------------------------------------------------------

/**
 * One review, as its own page renders it — and **the same type at both
 * fidelities**, which is the point (issues/42).
 *
 * The read-only fidelity is not a second, thinner page type: it is this one with
 * `actions` and `edit` `null`. A separate shape would let the two drift, and the
 * thing that must not drift is precisely what a read-only reader keeps — the
 * body, the assignment, the siblings and the history with its reasons.
 */
export type ReviewPage = {
  /**
   * **Which of the two this reader got**, stated rather than left to be inferred
   * from `actions === null`.
   *
   * The inference would be sound and it would be a rule computed twice: the page
   * renders a banner saying *why* the controls are absent, and a banner is the
   * one thing that must not appear on a page whose controls are absent because
   * the lifecycle is finished. A finished review at the may-act fidelity carries
   * an **empty** action set and no banner.
   */
  fidelity: "may-act" | "read-only";
  reviewId: string;
  programCode: string;
  state: ReviewState;
  /**
   * **The group header restated above the record, chips and all, with this
   * review highlighted** (issues/42) — `ProposalGroup`, the list's own type, so
   * the header a reader arrived through and the header they land on are one
   * assembly. Which row is highlighted is `reviewId`'s to say; the group knows
   * nothing about which of its reviews is being read.
   */
  proposal: ProposalGroup;
  /** The shared body, which is the proposal's and not this review's (issues/7). */
  body: { title: string; description: string | null; credits: number };
  bodyShare: BodyShare;
  areas: readonly OwnTag[];
  /** **A person as a person**, so pronouns show (issues/40). */
  areaHead: StitchedPerson | null;
  /**
   * **Derived, not stored**, by `db/read/course-rows.ts`'s own helper — the same
   * marker the Catalog row and the Course page carry, asked of the assignment
   * `approve` would copy forward rather than of one it already has.
   */
  notOfferableYet: NotOfferableYet;
  /** Whether the proposal's author is also this review's area head (issues/42). */
  authorIsAreaHead: boolean;
  /** The course this review's `approve` minted, where it has one (issues/42, issues/49). */
  mintedCourse: { courseId: string; courseNumber: string } | null;
  /** **Absent — not empty — at the read-only fidelity** (issues/38). */
  actions: readonly PermittedAction<ReviewEventName>[] | null;
  /** Absent with `actions`, and for the same reason: a refusal with no control is dead text. */
  edit: EditAffordance | null;
  /**
   * *Last changed*, and `null` means **never changed since it was created**,
   * which the page states in words rather than as an empty box. Unlike the Course
   * and Offering pages, it carries only that one fact: there is no reader here
   * for whom the box is hidden, because the review's log is Tier 3's own subject.
   */
  lastChanged: LastChanged;
  /**
   * **Never absent** — see `getReviewPage`. `course_proposal_review_transition`
   * rows are Tier 3's, and Tier 3's may-read is what admitted this reader, so the
   * `History | null` the other two record pages carry has no second case here.
   */
  history: History;
};

/**
 * **How many programs are reading this body and which have sent it back**
 * (issues/10, issues/42, issues/86).
 *
 * The row **is** the request, so *which programs were asked* is not a column
 * anywhere — it is the set of reviews. This is that set counted, on the one
 * screen where a reader is about to change something every one of them can see.
 */
export type BodyShare = {
  /** Every review of this proposal, this one included. Never zero (issues/43). */
  programCount: number;
  /**
   * The programs whose review is `Developing`, which is what *sent it back*
   * means, and the state in which the body **can change under you**: the Proposal
   * body field class is open while **any** review of the proposal is `Developing`
   * (issues/65), so this is also the list of programs that can open it.
   */
  developingProgramCodes: readonly string[];
  /**
   * **Whether the shared body no longer says what a course minted from it says**
   * (issues/42, issues/49).
   *
   * Computed by comparing values and never timestamps, which is how
   * `getCoursePage` computes the same fact — the two pages state one drift and a
   * second derivation of it is how they come to disagree. `false` where nothing
   * has been minted yet, because there is nothing for the body to have drifted
   * from.
   */
  hasDriftedSinceAnyMint: boolean;
};

// ---------------------------------------------------------------------------
// The pieces
// ---------------------------------------------------------------------------

/** One row of the one statement: a review, with its proposal's body beside it. */
type Row = ReviewRowSource & {
  proposalId: number;
  title: string;
  description: string | null;
  credits: number;
  createdBy: Netid;
  createdAt: Date;
  proposalUpdatedBy: Netid | null;
  proposalUpdatedAt: Date | null;
  reviewCreatedBy: Netid;
  reviewCreatedAt: Date;
  reviewUpdatedBy: Netid | null;
  reviewUpdatedAt: Date | null;
  mintedTitle: string | null;
  mintedDescription: string | null;
  mintedCredits: number | null;
};

const DEVELOPING: ReviewState = "Developing";

function bodyShareOf(rows: readonly Row[]): BodyShare {
  return {
    programCount: rows.length,
    developingProgramCodes: rows
      .filter((row) => row.status === DEVELOPING)
      .map((row) => row.programCode),
    // **The comparator is shared with the Course page**, which states the same
    // fact about its own mint (issues/86). A fact whose entire content is that
    // two records disagree is the last one two screens should each derive.
    hasDriftedSinceAnyMint: rows.some(
      (row) =>
        row.mintedCourseId !== null &&
        bodyHasDrifted(row, {
          title: row.mintedTitle ?? "",
          description: row.mintedDescription,
          credits: row.mintedCredits ?? 0,
        }),
    ),
  };
}

/**
 * **The later of the record's two stamps**, which is the one departure this page
 * makes from the Course and Offering rails (issues/62, issues/86).
 *
 * There, the `Edit` control opens one table's worth of fields and `updated_at`
 * on that record is the whole trace. Here the edit page opens **two**: the
 * review's own assignment stamps `course_proposal_review`, and the shared body —
 * which is the proposal's row, and is on this page's rail through this page's
 * `Edit` control — stamps `course_proposal`. A stamp reading one of them would go
 * unmoved after an edit made from this very page, which is exactly the trace
 * issues/17 left this box to carry.
 *
 * Ties go to the review, and no reader can tell: a write touching both tables
 * stamps them in one transaction with one `now` and one actor.
 */
function lastChangedOf(record: Row): { by: Netid; at: Date } | null {
  const stamps = [
    record.reviewUpdatedBy && record.reviewUpdatedAt
      ? { by: record.reviewUpdatedBy, at: record.reviewUpdatedAt }
      : null,
    record.proposalUpdatedBy && record.proposalUpdatedAt
      ? { by: record.proposalUpdatedBy, at: record.proposalUpdatedAt }
      : null,
  ].filter((stamp): stamp is { by: Netid; at: Date } => stamp !== null);

  return stamps.sort((left, right) => right.at.getTime() - left.at.getTime())[0] ?? null;
}

/**
 * **The edit affordance, and the one gate on this page that is not a fact about
 * this review** (issues/62, issues/65).
 *
 * `GateStates.siblingReviews` is why: the Proposal body class is open while
 * **any** review of the proposal is `Developing`, the per-review condition riding
 * in the relationship instead. This page has every sibling in hand — it read them
 * to answer the tier — so the gate is answered without a second query, which is
 * what would have made the body section on `/reviews/:id/edit` cost a round trip
 * nobody could see the reason for.
 */
function editOf(
  record: Row,
  rows: readonly Row[],
  proposal: ProposalSource,
  facts: ActorFacts,
): EditAffordance {
  return editAffordanceFor(
    "course_proposal_review",
    facts,
    reviewSubject(record, proposal),
    {
      review: record.status,
      siblingReviews: rows.map((row) => row.status ?? ""),
    },
  );
}
