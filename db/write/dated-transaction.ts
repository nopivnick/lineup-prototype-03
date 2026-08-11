import "server-only";

import { classesDb } from "@/db/handles";

import type { At, OpenTransaction } from "./transaction";

/**
 * **A `classes` transaction opened at a moment, and the seed is the only caller**
 * (issues/49, issues/78, issues/107).
 *
 * You open the books at a date; everything written while they are open carries
 * that date. Every write path called inside gets the same moment, because the
 * moment is the transaction's — which is also what happened, one transaction
 * being one act.
 *
 * **Why this is a module of its own rather than a second argument to
 * `writeToClasses`.** A caller-supplied date is the one way to write a
 * *plausible* lie into the transition log: a forged `now()` is obvious and a
 * forged 2019 is not, and the log's credibility is the whole of what the seed
 * exists to demonstrate (issues/13's satisfiability proof). So the door is
 * fenced with the same `no-restricted-imports` rule that keeps database handles
 * out of pages (issues/9) — a Server Action that reached for this fails
 * `npm run build` rather than succeeding quietly. `eslint.config.mjs` names the
 * two places that may import it: `db/seed.ts`, and the tests that exercise the
 * seam.
 *
 * The full statement — the three shapes issues/107 weighed, and why this is the
 * map's habitual move rather than a warning — is `OpenTransaction` in
 * `docs/data-access/data-access.ts`. Not restated here.
 *
 * The one line this shares with `writeToClasses` is deliberately not factored
 * out into a shared opener taking an `at`. Such a function would live in
 * `./transaction`, which every writer imports and no rule fences — and it would
 * be the unrestricted door this module exists to be instead of.
 */
export function writeToClassesAt<T>(
  at: At,
  body: (open: OpenTransaction) => Promise<T>,
): Promise<T> {
  return classesDb().transaction((tx) => body({ tx, at }));
}
