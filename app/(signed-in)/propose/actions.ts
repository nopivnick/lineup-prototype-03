"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createProposal } from "@/db/write/create-proposal";
import { WriteRefused, type Refusal } from "@/db/write/refusal";
import { writeToClasses } from "@/db/write/transaction";
import { requireActor } from "@/lib/auth/actor";

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
 * **What the form asks for, as it arrives from a browser.**
 *
 * Every field is the untrusted shape rather than the writer's: `credits` is what
 * a number input posts, and the programs are whatever came back checked. What
 * turns this into `CreateProposalInput` is `asWritten` below, which is parsing
 * and not ruling — the difference being that a value it rejects is one **the form
 * cannot produce**.
 */
export type Proposed = {
  title: string;
  description: string;
  credits: number | string;
  programs: readonly string[];
};

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
export async function proposeCourse(proposed: Proposed): Promise<Refused> {
  const actor = await requireActor();
  const input = asWritten(proposed);

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

type Refused = { refusals: readonly Refusal[] } | null;

/**
 * **The post, parsed** — and everything it rejects is malformed rather than
 * refused, which is the same class of check as `EXPOSED` in `review-actions.ts`
 * and answered the same way.
 *
 * A Server Action is a public endpoint, so the three body fields are checked
 * here; none of these throws is reachable through the form, which disables its
 * own submit on each of them and states why. The distinction the map cares about
 * is which of the form's four rules is a **rule**: the non-empty program set is,
 * because a proposal with no reviews is a record nothing in the skeleton can
 * reach again, and it therefore lives in `createProposal` where the seed and the
 * tests meet it too (issues/43). A blank title is a bad submission of a form.
 *
 * **A blank description is an absence and not an empty string**, the same reading
 * `fireReviewEvent` gives a blank reason: the column is nullable and the two are
 * different facts.
 *
 * **The program codes are the database's to check.** An unknown code violates
 * `course_proposal_review`'s foreign key onto `program`, which is one statement of
 * the rule rather than a second copy of the program list kept here; the boxes the
 * form draws come from that same table. Duplicates are dropped rather than sent —
 * `UNIQUE (course_proposal_id, program_code)` would refuse them, and *asked twice*
 * is plainly *asked*.
 */
function asWritten(proposed: Proposed) {
  const title = proposed.title.trim();
  if (title.length === 0) {
    throw new Error("A proposal needs a title.");
  }

  const credits = Number(proposed.credits);
  if (!Number.isSafeInteger(credits) || credits <= 0) {
    throw new Error(`${proposed.credits} is not a number of credits.`);
  }

  const description = proposed.description.trim();

  return {
    title,
    description: description.length > 0 ? description : null,
    credits,
    programs: [...new Set(proposed.programs.map((code) => code.trim()).filter(Boolean))],
  };
}
