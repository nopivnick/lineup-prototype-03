import "server-only";

import { READ_TIERS, type ReadTier, type Role } from "@/lib/permissions";

import type { Refusal } from "@/db/write/refusal";
import type { ActorFacts } from "@/db/write/rules";

/**
 * **What every read module ships beside the record** (issues/9, issues/14,
 * issues/28, issues/37).
 *
 * The three conventions below are built here first, by the Catalog (issues/81),
 * because the six views after it inherit them. They are shapes rather than
 * rules: the rules are `lib/permissions.ts` and the wording is
 * `db/write/rules.ts`, and this module names neither a role nor a sentence.
 *
 * A **client component may import these types** — `import type` is erased, so
 * the `server-only` above still holds and the machines still do not reach the
 * browser. What a client may never import is the value side of the rules.
 */

/**
 * A refusal, and it is **the writer's own type** rather than a second one shaped
 * like it (issues/14).
 *
 * The refused thing and its explanation are one value, and the read side ships
 * that value ahead of the click while the writer throws it at whoever clicks
 * anyway. Two types here would be two places for the shape to drift, in the one
 * place the map has spent three tickets making drift impossible.
 */
export type { Refusal };

/**
 * One entry in a record's permitted-action set: an event the machine offers from
 * this state, together with whether this actor may fire it and why not
 * (issues/28, issues/37).
 *
 * The set is **already intersected** — machine legality AND invariants AND
 * permissions — and the client renders from it alone and computes nothing. The
 * machine is never imported client-side: issues/17 deleted every Offering guard,
 * so a client-side `.can()` would be bare edge existence, while both things that
 * decide whether a control should be live are server-side.
 *
 * The `⋯ n` menu's **`n` is the count of `permitted: true` entries**, which is a
 * rendering of this set and not a second computation of it.
 */
export type PermittedAction<Event extends string> =
  | { event: Event; permitted: true }
  | { event: Event; permitted: false; refusal: Refusal };

/**
 * A tag from the record's own program — an `area` or a `requirement_category`
 * (issues/25). Rendered unlabelled, because every program name a list renders is
 * a seat-sharing grant, and the Catalog has none: seat sharing attaches to the
 * section that made it, never to the course.
 */
export type OwnTag = { name: string };

/**
 * **Absent, never empty** (issues/37): whether a list renders an Actions column
 * at all.
 *
 * The predicate is Tier 2's *may-read* — *actor holds any acting role* — used as
 * issues/37 used it, to decide whether the column exists rather than what it
 * holds. An always-empty column is dead width advertising a capability the
 * reader will never have, and a refusal with no control to refuse is dead text
 * explaining a button that was never there (issues/38).
 *
 * It is **read off `READ_TIERS`** rather than restated as a list of five roles,
 * so a role added to that predicate arrives here without anybody choosing to
 * bring it. `student` and `advisor` are exactly issues/8's two empty rows, which
 * is why this is one predicate and not a per-view judgement.
 */
export function canEverAct(facts: ActorFacts): boolean {
  return ACTING_ROLES.some((role) => facts.roles.has(role));
}

const TIERS: readonly ReadTier[] = READ_TIERS;

const ACTING_ROLES: readonly Role[] = (TIERS.find((tier) => tier.tier === 2)?.mayRead.routes ?? [])
  .flatMap((route) => ("role" in route ? [route.role] : []));

/**
 * **The derivation above fails open, so it is checked at import.**
 *
 * `ReadPredicate.routes` is optional and two of the three tiers are already
 * written without it, so a Tier 2 rewritten in prose alone would leave this an
 * empty set — and an empty set means `canEverAct` answers `false` for everybody
 * and the Actions column silently disappears from every list in the skeleton for
 * every reader. That is an under-grant, which the map calls the loud kind of
 * mistake, and it would be the one shape of under-grant that is not: nobody sees
 * a control missing that they never knew was there.
 *
 * A failing import is what makes it loud, in the same spirit as
 * `db/machine-states.test.ts`.
 */
if (ACTING_ROLES.length === 0) {
  throw new Error(
    "READ_TIERS tier 2 states no routes, so no actor can ever act and no list would render an " +
      "Actions column (issues/37, issues/81). Either the tier moved or its predicate is now prose; " +
      "whichever it is, `canEverAct` has to be told where to read it.",
  );
}
