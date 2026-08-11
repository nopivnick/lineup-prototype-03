/**
 * **The lead is whoever holds position 0 — never `roster[0]`** (issues/61).
 *
 * This is not a style preference. `decline` and `withdraw` each `DELETE` position
 * 0 and leave everything below it, so a **gap at 0 is what the machine's own edges
 * produce**: `Declined.retry` → `Slated` lands a section holding co-instructors
 * and no lead. An array indexed by convention cannot express that gap, and
 * `roster[0]` silently reports a co-instructor as the lead.
 *
 * issues/41 shipped the broken shape — its empty state fired on `roster.length`,
 * so a section with two co-instructors and no lead rendered as an ordinary staffed
 * roster with nothing saying it could not be offered to anyone.
 *
 * **Why this module holds no `server-only` and is not under `db/read/`.** It is
 * the one thing about a roster that both sides need: the read module composes the
 * rows and the browser renders them, and the renderer is exactly where the gap was
 * missed. Nothing here is a rule — no role, no state, no matrix — so shipping it
 * to the client costs the boundary nothing, and `db/read/lineup.ts` re-exports
 * `leadOf` so a reader following `docs/data-access/` finds it beside the row type
 * it governs.
 */

/** Whoever holds position 0, or `undefined` where nobody does. */
export function leadOf<T extends { position: number }>(roster: readonly T[]): T | undefined {
  return roster.find((entry) => entry.position === 0);
}

/**
 * **The three shapes a roster can be in, as a union the renderer cannot collapse.**
 *
 * `leadOf` alone leaves the caller to remember that `undefined` means two
 * different things — nobody at all, and nobody *yet* above people who are already
 * seated. That second one is the shape issues/61 was written about, and a
 * `!lead ? "needs an instructor" : …` conditional reports it as the first. Making
 * it an arm of a union means a renderer that ignores it does not compile.
 *
 * Order below position 0 is a **bare key**: no promotion, no reorder, gaps legal
 * (issues/61). So `others` is whatever is left, in `position` order, and nothing
 * here treats the lowest of them as a lead-in-waiting.
 */
export type RosterShape<T> =
  /** Nobody is seated. `Slated` says the same thing as a state. */
  | { kind: "vacant" }
  /** Position 0 is occupied, and `others` are the non-gating co-instructors. */
  | { kind: "led"; lead: T; others: readonly T[] }
  /** Rows below an empty position 0 — what `decline` and `withdraw` leave behind. */
  | { kind: "leaderless"; others: readonly T[] };

export function rosterShape<T extends { position: number }>(
  roster: readonly T[],
): RosterShape<T> {
  const lead = leadOf(roster);
  const others = roster
    .filter((entry) => entry.position !== 0)
    .sort((a, b) => a.position - b.position);

  if (lead) return { kind: "led", lead, others };
  return others.length === 0 ? { kind: "vacant" } : { kind: "leaderless", others };
}
