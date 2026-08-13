"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createOffering } from "@/db/write/create-offering";
import { WriteRefused, type Refusal } from "@/db/write/refusal";
import { writeToClasses } from "@/db/write/transaction";
import { requireActor } from "@/lib/auth/actor";

import { slatedOf, slateProblem, type Slated } from "./slated";

/**
 * **A Server Action is an actor-resolution wrapper and nothing more** (issues/28,
 * issues/11, issues/81, issues/85, issues/88).
 *
 * Resolve the actor, reject a null one, open the transaction, call the write path
 * in. It holds **no rules**: who may slate, that a `Retired` course cannot be
 * offered and that a course with no area or no area head cannot be either are all
 * `createOffering`'s, and all three reach the screen ahead of the click as that
 * writer's own sentences — which is why `db/read/offering.test.ts` can compare the
 * two.
 *
 * It lives in `slate/` rather than up beside `offering-actions.ts` for the reason
 * `propose/actions.ts` does: one screen fires it. `fireOfferingEvent` moved up
 * when the Offering machine gained a second screen, and slating a class has
 * exactly one door — the Course page's rail.
 *
 * It opens the transaction through `writeToClasses` and says nothing about
 * *when*: the column defaults answer. `writeToClassesAt` is fenced to the seed by
 * an ESLint rule (issues/107).
 */
export async function slateClass(
  slated: Slated,
): Promise<{ refusals: readonly Refusal[] } | null> {
  const actor = await requireActor();

  // **A post that is not well formed is a malformed post rather than a refused
  // one**, which is the same class of check as `EXPOSED` in `review-actions.ts`
  // and is answered the same way: a Server Action is a public endpoint, and none
  // of these is reachable through the form, which disables its own submit on the
  // very same function. What is *not* checked here is anything the department
  // rules, because every one of those is `createOffering`'s and every one of them
  // reaches the screen as its own sentence.
  //
  // The section number's uniqueness is **not** checked here either, and that is
  // the one asymmetry with the form: it is a question about the world rather than
  // about the post, `sectionCollision` needs the numbers `getSlateForm` loaded to
  // ask it, and what actually refuses a collision is
  // `UNIQUE (course_id, term_code, section_number)` — the same standing the
  // `credits > 0` CHECK has behind the propose form's own arithmetic.
  const input = slatedOf(slated);
  if (!input) {
    throw new Error(slateProblem(slated) ?? "That class is not well formed.");
  }

  let offeringId: string;
  try {
    const written = await writeToClasses((open) => createOffering(open, input, actor.netid));
    offeringId = String(written.offeringId);
  } catch (thrown) {
    if (thrown instanceof WriteRefused) {
      // **A refusal revalidates too**: the control the reader is looking at is
      // *known* to be wrong — a directorship revoked in another tab, a course
      // retired between the render and the click — so leaving the page as it
      // stands would leave a live submit button that refuses identically on
      // every further click.
      revalidatePath("/slate");
      return { refusals: thrown.refusals };
    }
    throw thrown;
  }

  // **Slating lands on the new class page, complete** (issues/43) — variant A
  // unamended, and the half of it that issues/84 had to build first. It is a
  // `redirect` here rather than a router push on the client because the class has
  // a page of its own and the id is the transaction's answer, not the form's.
  //
  // The Lineup is the term-scoped list this class has just joined, and the Course
  // page lists it as a section; both are known stale the moment the row exists.
  revalidatePath("/lineup");
  revalidatePath(`/courses/${slated.courseId}`);
  redirect(`/classes/${offeringId}`);
}
