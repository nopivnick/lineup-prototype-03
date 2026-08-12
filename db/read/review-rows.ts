import "server-only";

import { sql } from "drizzle-orm";
import type { EventFromLogic } from "xstate";

import { area, courseProposalReview, courseProposalReviewArea } from "@/db/classes/schema";
import { notYours, permitted, routesFor, type ActorFacts, type Subject } from "@/db/write/rules";
import type { Netid } from "@/db/write/transaction";
import {
  machine as reviewMachine,
  type CourseProposalReviewState as ReviewState,
} from "@/lib/machines/course-proposal-review.machine";

import { qualified } from "./qualified";
import { mayActOnReview, type OwnTag, type PermittedAction } from "./shape";
import type { Directory, StitchedName } from "./stitch";

/**
 * **What the proposals list and the review page agree a review is** (issues/42,
 * issues/85, issues/86).
 *
 * The third row-assembly module, beside `course-rows.ts` and `offering-rows.ts`
 * and not one of the seven views: what makes something one of the seven is that
 * it is a **view**, and two views of one entity must not each intersect the rules
 * for themselves. `reviewActionsFor` said so in its own
 * comment while it still lived in `db/read/proposals.ts` — *when the review page
 * arrives it becomes the second, and this function moves out beside
 * `offeringActionsFor`* — and this is that move, made when the second view
 * arrived rather than argued about again.
 *
 * **The group type moves with the row type**, because the review page does not
 * merely render a review: it restates the group header above the record, chips
 * and all, with this review highlighted (issues/42). A second `ProposalGroup`
 * assembled by the record page would be a second answer to *what has every
 * program decided*, on the one screen whose whole justification is that the
 * answer is not the reader's to guess.
 */

/**
 * The review machine's event names, read off the machine rather than restated
 * (issues/13's rule that a hand-maintained second list is the thing that gets
 * forgotten).
 *
 * Named `ReviewEventName` and not `ReviewEvent` because
 * `db/write/apply-transition.ts` already owns that name for the richer thing a
 * *transition* carries — there `approve` arrives with the course number its mint
 * will use. A row offers a move; the writer takes the move and what came with it.
 */
export type ReviewEventName = EventFromLogic<typeof reviewMachine>["type"];

/**
 * **One group per proposal.** The shared body sits here and is stated once —
 * title, credits, who proposed it and when — and a review row carries only what
 * differs between siblings.
 *
 * The list renders it as a group header over its rows; the review page restates
 * the same header above one record, with that review highlighted.
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
   * Never narrowed by the list's filter either: the filter says which reviews
   * are worth a row today, and the chips say what the department has decided,
   * which is a fact about the proposal rather than about the reader's current
   * question.
   *
   * **`reviewId` rides on each chip, which widens the artifact's
   * `{ programCode, state }` by one field** (issues/85, amending issues/42's
   * `ProposalGroup`). The chip is not a label: in variant D it is the **control
   * that opens that review**, and `getReviewPage`'s own reasoning is written on
   * that premise — *refusing the page when they click it would be incoherent,
   * because the chip has already leaked the verdict*. Without the id the chip
   * cannot be a link, and the list's filter then hides reviews the chips
   * announce. Recorded in `docs/data-access/README.md`.
   */
  verdicts: readonly { reviewId: string; programCode: string; state: ReviewState }[];
  /** Every review, as rows — narrowed by the list's filter and by nothing else. */
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
   * **`null` is read-only, not *can never act*** — which is this row's one
   * departure from the Catalog's and the Lineup's reading of the same field.
   *
   * There, a `null` action set means the reader holds no acting role at all and
   * the column is absent from the table. On both screens that render this row
   * the reader has already been let in, and what `null` marks is a **review
   * outside your arms**: issues/38's rule that read-only means controls *and*
   * refusals absent rather than greyed. A refused control the reader was never
   * eligible for is dead text explaining a button that was never there.
   */
  actions: readonly PermittedAction<ReviewEventName>[] | null;
};

/**
 * A review's areas, as JSON beside the review row — the review-level half of the
 * assignment `approve` copies into `course_area` (issues/25, issues/32).
 *
 * The composite foreign key makes *a review's areas are its own program's* a
 * database rule, so these render unlabelled for the reason a course's own tags
 * do: the only program name a screen puts against a record other than its own is
 * a seat-sharing grant, and seat sharing attaches to a section.
 *
 * Shared because both statements that read reviews want them, and a second copy
 * is how the two come to sort their chips differently. `qualified` is not
 * decoration — see its own module: a fragment that is only correct in the query
 * it was first pasted into is a trap for the next caller, and here the next
 * caller was a later ticket's detail page.
 */
export const REVIEW_AREAS = sql<readonly OwnTag[]>`(
  SELECT coalesce(json_agg(json_build_object('name', ${qualified(area.name)}) ORDER BY ${qualified(area.name)}), '[]'::json)
  FROM ${courseProposalReviewArea}
  JOIN ${area} ON ${qualified(area.areaId)} = ${qualified(courseProposalReviewArea.areaId)}
  WHERE ${qualified(courseProposalReviewArea.courseProposalReviewId)}
      = ${qualified(courseProposalReview.courseProposalReviewId)}
)`;

/**
 * The three columns `approve` **copies** into the course it mints (issues/7).
 *
 * A type rather than three loose parameters because the whole point is that the
 * copy leaves two of them, free to disagree afterwards, and the comparison below
 * has to hold the same three on each side.
 */
export type SharedBody = { title: string; description: string | null; credits: number };

/**
 * **Whether the shared body still says what a course minted from it says**
 * (issues/42 amending issues/41, issues/83, issues/86).
 *
 * The mint copies rather than references, so a proposal edited after one program
 * has approved leaves the course and the proposal disagreeing with nothing
 * recording it — and this is the only thing in the system that records it. It is
 * stated on **both** pages, which is why it is computed in neither: the Course
 * page says it of its own mint and the review page says it of any mint on the
 * proposal, and a second derivation is how the two come to disagree about a fact
 * whose entire content is that two things disagree.
 *
 * **Values and never timestamps.** The prototype compared `updated_at` against
 * the mint's moment, which answers *was it edited* rather than *does it differ* —
 * an edit that put a title back is not drift, and a mint from an already-edited
 * body is.
 */
export function bodyHasDrifted(shared: SharedBody, minted: SharedBody): boolean {
  return (
    shared.title !== minted.title ||
    shared.description !== minted.description ||
    shared.credits !== minted.credits
  );
}

/** One database row of a review, as either statement that reads one selects it. */
export type ReviewRowSource = {
  reviewId: number;
  programCode: string;
  status: string | null;
  areaHead: Netid | null;
  areas: readonly OwnTag[];
  mintedCourseId: number | null;
  mintedCourseNumber: string | null;
};

/** The proposal a review hangs off, as much of it as a review row's rules read. */
export type ProposalSource = { createdBy: Netid };

/**
 * The record a permission is scoped to, assembled once and read by both
 * questions asked of it — *does an arm of the tier reach this review* and *may
 * this actor fire this move*. They are different questions over the same
 * subject, and building it twice is how the two come to disagree about which
 * review they were talking about.
 */
export function reviewSubject(review: ReviewRowSource, proposal: ProposalSource): Subject {
  return {
    review: {
      programCode: review.programCode,
      areaHead: review.areaHead,
      state: review.status ?? "",
    },
    proposal: { createdBy: proposal.createdBy },
  };
}

/**
 * **Whether Tier 3's may-act arms reach this review**, which is the row's
 * *fidelity* and never whether it is on the page (issues/42).
 *
 * A convenience over `mayActOnReview` and `reviewSubject` together, so the two
 * screens cannot build the subject one way for the arm and another way for the
 * move.
 */
export function armsReach(
  facts: ActorFacts,
  review: ReviewRowSource,
  proposal: ProposalSource,
): boolean {
  return mayActOnReview(facts, reviewSubject(review, proposal));
}

/**
 * One database row plus the stitched directory, as the row a screen renders.
 *
 * The netids it resolves must already be in the `directory` the caller built:
 * the stitch is **one** query per page over every netid the page will display,
 * and resolving one here would be the per-row cross-project lookup issues/9
 * forbids. `Directory` is total, so nothing here can decline to answer.
 *
 * `mayAct` is the caller's, because the caller has already had to compute it:
 * the list needs every arm on the group to decide whether the group is on the
 * page at all, and the record page needs this review's arm to decide the page's
 * fidelity.
 */
export function asReviewRow(
  row: ReviewRowSource,
  proposal: ProposalSource,
  facts: ActorFacts,
  directory: Directory,
  mayAct: boolean,
): ProposalReviewRow {
  const state = row.status as ReviewState;

  return {
    reviewId: String(row.reviewId),
    programCode: row.programCode,
    state,
    areaHead: row.areaHead ? directory(row.areaHead) : null,
    areas: row.areas,
    mintedCourse:
      row.mintedCourseId !== null && row.mintedCourseNumber !== null
        ? { courseId: String(row.mintedCourseId), courseNumber: row.mintedCourseNumber }
        : null,
    actions: mayAct ? reviewActionsFor(state, reviewSubject(row, proposal), facts) : null,
  };
}

/**
 * **Machine legality AND permissions, intersected here** — the same terms in the
 * same order as `applyTransition`, computed one step earlier so a screen can say
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
 * **Two treatments, one set** (issues/40, issues/41): the list renders it as
 * `⋯ n`, whose count says *nothing to do here* without opening anything, and the
 * review page renders it as buttons in the rail with the refusals stated
 * beneath.
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
