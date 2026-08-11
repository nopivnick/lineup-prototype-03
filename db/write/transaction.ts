import "server-only";

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
