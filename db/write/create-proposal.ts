import "server-only";

import { courseProposal, courseProposalReview } from "@/db/classes/schema";
import { machine as reviewMachine } from "@/lib/machines/course-proposal-review.machine";
import { MATRICES, NOBODY } from "@/lib/permissions";

import { initialSnapshot } from "./apply-transition";
import { refuse, WriteRefused } from "./refusal";
import { notYours, permitted, readActorFacts } from "./rules";
import { moment, type Id, type Netid, type OpenTransaction } from "./transaction";

/**
 * Three columns and a set of programs (issues/10, issues/43).
 *
 * **`programs` is not a field beside the form — it *is* the rows the form mints.**
 * There is no requested-programs table: a review row *is* the request.
 *
 * No `course_number` (each approving program mints its own at the approve, per
 * issues/7) and no area or head (assigned by each program's director during
 * review, per issues/32).
 */
export type CreateProposalInput = {
  title: string;
  description: string | null;
  credits: number;
  /** Non-empty — see below. */
  programs: readonly string[];
};

/**
 * **The proposal create path** (issues/40, issues/43).
 *
 * One transaction writes a `course_proposal` plus one `course_proposal_review`
 * per requested program. That is the `approve` mint's shape at the other end of
 * the lifecycle, and creation being an act rather than a transition (issues/13),
 * it writes no log row.
 *
 * All three permission arms are **flat, because the act is flat by construction**
 * (issues/8, issues/65): at create time there is no proposal, no review and no
 * course, so nothing exists for any relationship to scope to.
 */
export async function createProposal(
  open: OpenTransaction,
  input: CreateProposalInput,
  actor: Netid,
): Promise<{ proposalId: Id; reviewIds: readonly Id[] }> {
  const { tx, at } = open;


  // **The set may not be empty**, ruled rather than assumed (issues/43): a
  // proposal with no reviews is a body nobody will ever see, since the proposals
  // list groups by proposal and its rows *are* reviews, and issues/7 gave the
  // proposal no state of its own and no detail page to reach it by. One
  // validation rule closes the only way in the skeleton to create an unreachable
  // record.
  if (input.programs.length === 0) {
    refuse("A proposal has to ask at least one program to review it.");
  }

  const facts = await readActorFacts(tx, actor);
  const routes =
    MATRICES.course_proposal_review.find((row) => (row.acts as readonly string[]).includes("create"))
      ?.routes ?? NOBODY;
  if (!permitted(routes, facts, {})) {
    throw new WriteRefused([notYours("propose", "a course", routes, {})]);
  }

  const [proposal] = await tx
    .insert(courseProposal)
    .values({
      title: input.title,
      description: input.description,
      credits: input.credits,
      createdBy: actor,
      createdAt: moment(at),
    })
    .returning({ courseProposalId: courseProposal.courseProposalId });
  if (!proposal) throw new Error("The create path wrote no proposal.");

  const reviews = await tx
    .insert(courseProposalReview)
    .values(
      input.programs.map((programCode) => ({
        courseProposalId: proposal.courseProposalId,
        programCode,
        snapshot: initialSnapshot(reviewMachine),
        createdBy: actor,
        createdAt: moment(at),
      })),
    )
    .returning({ courseProposalReviewId: courseProposalReview.courseProposalReviewId });

  return {
    proposalId: proposal.courseProposalId,
    reviewIds: reviews.map((review) => review.courseProposalReviewId),
  };
}
