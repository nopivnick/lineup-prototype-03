"use server";

import { revalidatePath } from "next/cache";

import {
  applyTransition,
  NEVER_EXPOSED,
  type ExposedOfferingEvent,
} from "@/db/write/apply-transition";
import { WriteRefused, type Refusal } from "@/db/write/refusal";
import { writeToClasses } from "@/db/write/transaction";
import { requireActor } from "@/lib/auth/actor";
import { machine as offeringMachine, OFFERING_STATES } from "@/lib/machines/offering.machine";

/**
 * **A Server Action is an actor-resolution wrapper and nothing more** (issues/28,
 * issues/11, issues/81, issues/82).
 *
 * Resolve the actor, reject a null one, open the transaction, call the write path
 * in. It holds **no rules**: every check — machine legality, the invariants, the
 * permission term, the chair's clause — is inside `applyTransition`, which is also
 * what lets the seed script be a second caller of the same function and be checked
 * like anybody else.
 *
 * It opens the transaction through `writeToClasses` and says nothing about *when*:
 * the column defaults answer. `writeToClassesAt` is fenced to the seed by an ESLint
 * rule, so this module could not date a write if it wanted to (issues/107).
 */

/**
 * **The narrower union the action layer exposes**, read off the machine and off the
 * writer's own exclusion list (issues/15, issues/28).
 *
 * On the Offering machine this is what keeps `staff` and `unstaff` from being
 * user-facing — **non-exposure rather than a check**. There is no branch below
 * refusing them by name: they are absent from this set, so a browser naming one gets
 * the same answer as a browser naming `banana`. That is the guarantee, and it is why
 * one writer inserts the `offering_instructor` row and sends the event in the same
 * transaction: a roster that disagrees with the state has no code path.
 *
 * Derived rather than typed out, so it stays true of whatever the machine offers,
 * and checked at all because a Server Action is a public endpoint and `event`
 * arrives from a browser.
 */
const HIDDEN: readonly string[] = NEVER_EXPOSED;

const EXPOSED: ReadonlySet<string> = new Set(
  OFFERING_STATES.flatMap((state) => offeringMachine.states[state].ownEvents).filter(
    (event) => !HIDDEN.includes(event),
  ),
);

/**
 * Fire one Offering move, and hand back the refusal if the writer refused.
 *
 * The row's `⋯ n` menu already intersected the three terms server-side, so a refusal
 * reaching here means the world moved between the render and the click — a grant
 * revoked, a course retired, a lead who declined in another tab. Returning it rather
 * than throwing is what lets the reader see the same sentence the greyed control
 * would have carried, and it is a **relay**, not a rule: the wording is the writer's.
 *
 * **`reason` is the schema's own free text** — optional, on all three logs
 * (issues/10, parked there by issues/19) — and which controls offer a box for it is
 * this layer's question (issues/37). The answer here is `cancel` and `kill`: the two
 * acts that end something the department had committed to, where *why* is the only
 * thing the log could not reconstruct from the state pair. Every other event is
 * passed through with none rather than with an empty string, because a blank reason
 * and no reason are different facts.
 */
export async function fireOfferingEvent(
  offeringId: string,
  event: string,
  reason?: string,
): Promise<{ refusals: readonly Refusal[] } | null> {
  const actor = await requireActor();

  if (!EXPOSED.has(event)) {
    throw new Error(`${event} is not a move a class offers.`);
  }
  const id = Number(offeringId);
  if (!Number.isSafeInteger(id)) {
    throw new Error(`${offeringId} is not a class.`);
  }

  const said = reason?.trim();
  const move = {
    type: event,
    ...(said ? { reason: said } : {}),
  } as ExposedOfferingEvent;

  try {
    await writeToClasses((open) =>
      applyTransition(open, { machine: "offering", id }, move, actor.netid),
    );
  } catch (thrown) {
    if (thrown instanceof WriteRefused) {
      // **A refusal revalidates too**, and for a sharper reason than success does.
      // The row's menu already intersected the three terms, so a refusal reaching
      // here means the world moved between the render and the click — which makes
      // the menu the reader is looking at *known* to be wrong. Returning the
      // sentence without re-reading would leave a live control that refuses
      // identically on every further click until somebody reloads by hand.
      revalidatePath("/lineup");
      return { refusals: thrown.refusals };
    }
    throw thrown;
  }

  revalidatePath("/lineup");
  return null;
}
