"use server";

import { revalidatePath } from "next/cache";

import { applyTransition, type ReviewEvent } from "@/db/write/apply-transition";
import { WriteRefused, type Refusal } from "@/db/write/refusal";
import { writeToClasses } from "@/db/write/transaction";
import { requireActor } from "@/lib/auth/actor";
import {
  machine as reviewMachine,
  REVIEW_STATES,
} from "@/lib/machines/course-proposal-review.machine";

/**
 * **A Server Action is an actor-resolution wrapper and nothing more** (issues/28,
 * issues/11, issues/81, issues/85).
 *
 * Resolve the actor, reject a null one, open the transaction, call the write path
 * in. It holds **no rules**: every check — machine legality, the permission term,
 * the chair's clause — is inside `applyTransition`, which is also what lets the
 * seed script be a second caller of the same function and be checked like anybody
 * else.
 *
 * It opens the transaction through `writeToClasses` and says nothing about
 * *when*: the column defaults answer. `writeToClassesAt` is fenced to the seed by
 * an ESLint rule, so this module could not date a write if it wanted to
 * (issues/107).
 *
 * It lives beside `fireCourseEvent` and `fireOfferingEvent` rather than inside
 * `proposals/` because the review machine is about to have a second screen: the
 * proposals list's `⋯ n` menu and the review page's rail render one
 * permitted-action set in two treatments, so they fire it through one wrapper.
 */

/**
 * **The narrower union the action layer exposes**, read off the machine
 * (issues/15, issues/28).
 *
 * The review machine hides none of its three, so this set is all of them —
 * `NEVER_EXPOSED` is the Offering machine's list and has no counterpart here. It
 * is derived rather than typed out so that it stays true of whatever the machine
 * offers, and it is checked at all because a Server Action is a public endpoint
 * and `event` arrives from a browser.
 */
const EXPOSED: ReadonlySet<string> = new Set(
  REVIEW_STATES.flatMap((state) => reviewMachine.states[state].ownEvents),
);

/**
 * Fire one review move, and hand back the refusal if the writer refused.
 *
 * The row's `⋯ n` menu already intersected machine legality and the permission
 * term server-side, so a refusal reaching here means the world moved between the
 * render and the click — a directorship revoked, an area head reassigned, a
 * sibling program approving in another tab. Returning it rather than throwing is
 * what lets the reader see the same sentence the greyed control would have
 * carried, and it is a **relay**, not a rule: the wording is the writer's.
 *
 * **`courseNumber` is not an option and not a rule.** `approve` is the seam: one
 * transaction moves the review and mints a `course`, and `course.course_number`
 * is `NOT NULL` from the moment a course exists while the proposal deliberately
 * carries no number (issues/7). So the number is part of what the event *is*, and
 * an `approve` arriving without one is a malformed event rather than a refused
 * one — the same class of check as `EXPOSED` above, and answered the same way.
 *
 * **`reason` is the schema's own free text** — optional, on all three logs
 * (issues/10) — and which controls offer a box for it is this layer's question
 * (issues/37). `EXPLAINED_REVIEW` in `./explained-moves` is that answer, shared
 * with the screen so the two cannot disagree.
 */
export async function fireReviewEvent(
  reviewId: string,
  event: string,
  said: { reason?: string; courseNumber?: string } = {},
): Promise<{ refusals: readonly Refusal[] } | null> {
  const actor = await requireActor();

  if (!EXPOSED.has(event)) {
    throw new Error(`${event} is not a move a review offers.`);
  }
  const id = Number(reviewId);
  if (!Number.isSafeInteger(id)) {
    throw new Error(`${reviewId} is not a review.`);
  }

  const courseNumber = said.courseNumber?.trim();
  if (event === "approve" && !courseNumber) {
    throw new Error("Approving a review mints a course, and a course has to have a number.");
  }

  const reason = said.reason?.trim();
  const move = {
    type: event,
    // A blank reason and no reason are different facts, and the log has room for
    // both, so an empty box is passed through as an absence.
    ...(reason ? { reason } : {}),
    ...(courseNumber ? { courseNumber } : {}),
  } as ReviewEvent;

  try {
    await writeToClasses((open) =>
      applyTransition(open, { machine: "course_proposal_review", id }, move, actor.netid),
    );
  } catch (thrown) {
    if (thrown instanceof WriteRefused) {
      // **A refusal revalidates too**, and for a sharper reason than success
      // does: the screen had already intersected the terms, so a refusal reaching
      // here means the controls the reader is looking at are *known* to be wrong.
      revalidate(id);
      return { refusals: thrown.refusals };
    }
    throw thrown;
  }

  revalidate(id);
  return null;
}

/**
 * The list, the review's own page — and the Catalog, because `approve` is the
 * one move in the system that creates a record on another screen. A course
 * minted here appears there, and a stale Catalog would be the mint's only
 * visible failure.
 */
function revalidate(id: number): void {
  revalidatePath("/proposals");
  revalidatePath(`/reviews/${id}`);
  revalidatePath("/catalog");
}
