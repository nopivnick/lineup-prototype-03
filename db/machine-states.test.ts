/**
 * **The test the map owes** (issues/13, issues/76): for each machine, the value
 * set of the database's CHECK constraint equals the machine's exported state
 * union.
 *
 * It is the detection mechanism that replaced a `machine_version` column.
 * Renaming or removing an occupied state invalidates every persisted snapshot
 * and throws on read; the machines are amended often; and the database's copy of
 * the state set is written sessions apart from the machine. So the **test is the
 * alarm**, the **migration is the gate** — an `ALTER` dropping an occupied value
 * refuses to run — and **reseed is the fix**. There is no per-version snapshot
 * migration function by construction: every fixture is reproducible from the
 * seed (`npm run db:reset`).
 *
 * It reads the **migration SQL**, which is what the database actually has,
 * rather than `db/classes/schema.ts`, which now builds its CHECK bodies from the
 * same machines this test imports and so could never disagree with them. That is
 * what makes a machine changed without a regenerated migration fail here rather
 * than in production.
 *
 * It reads the CHECK on **`snapshot->>'value'`, not on the generated `status`
 * column** (issues/10) — and the pattern below is what enforces that: a CHECK
 * rewritten to reference `status` matches nothing and fails this test.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { COURSE_STATES } from "@/lib/machines/course.machine";
import { REVIEW_STATES } from "@/lib/machines/course-proposal-review.machine";
import { OFFERING_STATES } from "@/lib/machines/offering.machine";

type JournalEntry = { tag: string };

const migrations = fileURLToPath(new URL("./classes/migrations/", import.meta.url));

/** Every migration for the `classes` project, in the order they are applied. */
const applied: string = (
  JSON.parse(readFileSync(`${migrations}meta/_journal.json`, "utf8")) as {
    entries: JournalEntry[];
  }
).entries
  .map((entry) => readFileSync(`${migrations}${entry.tag}.sql`, "utf8"))
  .join("\n");

/**
 * The states one CHECK admits — the **last** definition of that constraint, so a
 * later migration that drops and re-adds it wins, as it does in the database.
 */
function checkedStates(constraint: string): string[] {
  const definitions = [
    ...applied.matchAll(
      new RegExp(`CONSTRAINT "${constraint}" CHECK \\(snapshot->>'value' IN \\(([^)]*)\\)\\)`, "g"),
    ),
  ];
  expect(definitions.length, `no CHECK on snapshot->>'value' named ${constraint}`).toBeGreaterThan(
    0,
  );
  return definitions
    .at(-1)![1]
    .split(",")
    .map((value) => value.trim().replace(/^'|'$/g, ""));
}

test.each([
  ["offering_status", OFFERING_STATES],
  ["course_status", COURSE_STATES],
  ["course_proposal_review_status", REVIEW_STATES],
])("%s admits exactly the machine's states", (constraint, states) => {
  expect(checkedStates(constraint).sort()).toEqual([...states].sort());
});
