import "server-only";

import { sql, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { classesDb } from "@/db/handles";

/**
 * **A transaction handle on the `classes` connection, and it is a parameter**
 * (issues/6, issues/13, issues/28).
 *
 * Every write path takes one rather than opening its own. That is what lets the
 * seed script be a second caller of the same functions — issues/13 made it one on
 * purpose — and it is what lets a transition lock its row, re-read the
 * relationships that authorize it and commit the snapshot, the log row and every
 * side effect together.
 *
 * The type is read off the driver rather than restated, because the concrete
 * transaction type belongs to the `drizzle()` instance in `db/handles.ts` and a
 * hand-written copy would be a second thing to keep true.
 *
 * **There is no `people` transaction anywhere.** Nothing in the skeleton writes
 * to `people`, and no transaction spans the two projects (issues/5, issues/9).
 */
type ClassesHandle = PostgresJsDatabase<Record<string, never>>;

export type ClassesTx = Parameters<Parameters<ClassesHandle["transaction"]>[0]>[0];

/**
 * The one way to open a `classes` transaction.
 *
 * A Server Action calls `getActor()`, rejects a `null` one, opens the transaction
 * through here and calls a write path in — it holds no rules, because every check
 * is inside the writer (issues/28).
 */
export function writeToClasses<T>(body: (tx: ClassesTx) => Promise<T>): Promise<T> {
  return classesDb().transaction(body);
}

/**
 * A surrogate key. `bigint GENERATED ALWAYS AS IDENTITY` read through Drizzle's
 * `mode: "number"` (issues/93), so the write side speaks numbers; the read side
 * puts a `String()` at its own boundary where a row type says `string`.
 */
export type Id = number;

/** A netid — the actor, end to end, and the only thing `classes` holds about a person. */
export type Netid = string;

/**
 * **When a write happened**, and it is a parameter of the writer for the same
 * reason the transaction is (issues/13, issues/49, issues/78).
 *
 * Every timestamp in both schemas defaults to `now()`, which is the right answer
 * for every caller but one. The seed drives a world dated 2018 to 2026 and
 * **its dates are literal, never computed from run time**: a world stamped with
 * the moment of `db:reset` would put every mint, every offer and all 164
 * transition-log rows at one instant, and the populated log is the thing the
 * skeleton ships that a snapshot fixture could not have produced. Fixed dates
 * are also what make a screenshot stay true across resets.
 *
 * Shaped like `actor` and for the same reason: it is an argument the writer
 * takes, **never a column in the caller's payload**. `created_at`, `granted_at`
 * and `updated_at` are the Creation and Timestamps field classes, which nobody
 * may write (issues/28) — a caller hands the writer a moment and the writer
 * decides which columns it lands in.
 *
 * `undefined` is the ordinary case: a Server Action passes nothing and the
 * database's own clock answers.
 *
 * `docs/data-access/data-access.ts` still declares the four paths with four
 * parameters, and rule 1 of `docs/agents/spec-packages.md` forbids amending an
 * artifact without a closed ticket behind it — so the shape this seam should
 * finally take is open as issues/107, which weighs it against a clock on the
 * transaction and against a seam only the seed can reach.
 */
export type At = Date | undefined;

/** What a timestamp column is set to: the caller's moment, or `now()`. */
export function moment(at: At): Date | SQL {
  return at ?? sql`now()`;
}
