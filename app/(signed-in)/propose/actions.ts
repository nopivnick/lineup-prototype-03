"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createProposal } from "@/db/write/create-proposal";
import { WriteRefused, type Refusal } from "@/db/write/refusal";
import { writeToClasses } from "@/db/write/transaction";
import { requireActor } from "@/lib/auth/actor";

import { bodyOf, bodyProblem, type Proposed } from "./proposed";

/**
 * **A Server Action is an actor-resolution wrapper and nothing more** (issues/28,
 * issues/11, issues/81, issues/85).
 *
 * Resolve the actor, reject a null one, open the transaction, call the write path
 * in. It holds **no rules**: the permission term is `createProposal`'s, and so is
 * the one emptiness rule that matters — *a proposal has to ask at least one
 * program to review it* — which is why `db/read/proposals.test.ts` can compare the
 * sentence this page states ahead of the click with the one the writer throws.
 *
 * It lives in `propose/` rather than up beside `review-actions.ts` for the reason
 * `roles/actions.ts` does: one screen fires it. `fireReviewEvent` moved up when
 * the review machine gained a second screen, and creating a proposal has exactly
 * one door — the Catalog was rejected as a second one (issues/42).
 *
 * It opens the transaction through `writeToClasses` and says nothing about
 * *when*: the column defaults answer. `writeToClassesAt` is fenced to the seed by
 * an ESLint rule (issues/107).
 */

/**
 * Propose a course, and land on the proposals list at the new group.
 *
 * **Submitting lands on the list rather than on a record** — issues/43's one
 * amendment to variant A, and the reason it is a `redirect` here rather than a
 * router push on the client: a proposal has no page of its own, and landing on a
 * review means picking one of three by sort order. `?new=` is what makes it *at
 * the new group*; the list finds that group among the ones it was already going
 * to render, so an id naming a proposal the reader cannot reach highlights
 * nothing and says nothing.
 *
 * **A refusal comes back rather than throwing**, as it does everywhere else: the
 * page stated the permission term one step earlier, so a refusal reaching here
 * means the world moved between the render and the click — an `instructor` role
 * revoked in another tab — or that the post did not come from the form at all.
 * The wording is the writer's; this is a relay.
 */
export async function proposeCourse(
  proposed: Proposed,
): Promise<{ refusals: readonly Refusal[] } | null> {
  const actor = await requireActor();

  // **A body that is not well formed is a malformed post rather than a refused
  // one**, which is the same class of check as `EXPOSED` in `review-actions.ts`
  // and answered the same way: a Server Action is a public endpoint, and none of
  // these is reachable through the form, which disables its own submit on the
  // very same function. What is *not* checked here is anything the department
  // rules — who may propose, and that the program set is not empty — because
  // both are `createProposal`'s and both reach the screen as its own sentence.
  const input = bodyOf(proposed);
  if (!input) {
    throw new Error(bodyProblem(proposed) ?? "That proposal is not well formed.");
  }

  let proposalId: string;
  try {
    const written = await writeToClasses((open) => createProposal(open, input, actor.netid));
    proposalId = String(written.proposalId);
  } catch (thrown) {
    if (thrown instanceof WriteRefused) {
      // **A refusal revalidates too**: the control the reader is looking at is
      // *known* to be wrong, so leaving the page as it stands would leave a live
      // submit button that refuses identically on every further click.
      revalidatePath("/propose");
      return { refusals: thrown.refusals };
    }
    throw thrown;
  }

  // The list is the only screen a proposal appears on, and its rows are the
  // reviews this transaction just wrote.
  revalidatePath("/proposals");
  redirect(`/proposals?new=${proposalId}`);
}
