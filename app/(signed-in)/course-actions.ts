"use server";

import { revalidatePath } from "next/cache";

import { applyTransition, type CourseEvent } from "@/db/write/apply-transition";
import { WriteRefused, type Refusal } from "@/db/write/refusal";
import { writeToClasses } from "@/db/write/transaction";
import { requireActor } from "@/lib/auth/actor";
import { COURSE_STATES, machine as courseMachine } from "@/lib/machines/course.machine";

/**
 * **A Server Action is an actor-resolution wrapper and nothing more** (issues/28,
 * issues/11, issues/81).
 *
 * Resolve the actor, reject a null one, open the transaction, call the write
 * path in. It holds **no rules**: every check — machine legality, the
 * invariants, the permission term, the chair's clause — is inside
 * `applyTransition`, which is also what lets the seed script be a second caller
 * of the same function and be checked like anybody else.
 *
 * It opens the transaction through `writeToClasses` and says nothing about
 * *when*: the column defaults answer. `writeToClassesAt` is fenced to the seed
 * by an ESLint rule, so this module could not date a write if it wanted to
 * (issues/107).
 */

/**
 * **The narrower union the action layer exposes**, read off the machine
 * (issues/15, issues/28).
 *
 * On the Offering machine this is what keeps `staff` and `unstaff` from being
 * user-facing — non-exposure rather than a check. The Course machine hides
 * none of its three, so this set is all of them; it is derived rather than typed
 * out so that it stays true of whatever the machine offers, and it is checked at
 * all because a Server Action is a public endpoint and `event` arrives from a
 * browser.
 */
const EXPOSED: ReadonlySet<string> = new Set(
  COURSE_STATES.flatMap((state) => courseMachine.states[state].ownEvents),
);

/**
 * Fire one Course move, and hand back the refusal if the writer refused.
 *
 * The row's `⋯ n` menu already intersected the three terms server-side, so a
 * refusal reaching here means the world moved between the render and the click —
 * a grant revoked, a class slated. Returning it rather than throwing is what
 * lets the reader see the same sentence the greyed control would have carried,
 * and it is a **relay**, not a rule: the wording is the writer's.
 *
 * **One action for one machine, and the Course machine now has two screens**
 * (issues/83): the Catalog's `⋯ n` menu and the Course page's rail render the
 * same permitted-action set in two treatments, so they fire it through the same
 * wrapper. It lives here rather than beside either route for that reason, and
 * it revalidates both — a `retire` clicked in the rail changes the row in the
 * Catalog, and the reverse.
 */
export async function fireCourseEvent(
  courseId: string,
  event: string,
): Promise<{ refusals: readonly Refusal[] } | null> {
  const actor = await requireActor();

  if (!EXPOSED.has(event)) {
    throw new Error(`${event} is not a move the Course machine offers.`);
  }
  const id = Number(courseId);
  if (!Number.isSafeInteger(id)) {
    throw new Error(`${courseId} is not a course.`);
  }

  try {
    await writeToClasses((open) =>
      applyTransition(open, { machine: "course", id }, { type: event } as CourseEvent, actor.netid),
    );
  } catch (thrown) {
    if (thrown instanceof WriteRefused) return { refusals: thrown.refusals };
    throw thrown;
  }

  revalidatePath("/catalog");
  revalidatePath(`/courses/${id}`);
  return null;
}
