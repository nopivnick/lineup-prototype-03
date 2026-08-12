import "server-only";

import { getTableName, sql, type Column, type SQL } from "drizzle-orm";

/**
 * **`"offering"."offering_id"`, always** (issues/83).
 *
 * Drizzle renders a column **unqualified** when the select it is building names
 * a single table. That is right for the columns of that table and wrong inside a
 * correlated subquery: every reference in a shared `sql` fragment collapses to a
 * bare name, and `WHERE "offering_id" = "offering_id"` is either ambiguous —
 * which Postgres says out loud — or silently self-referential, which it does not.
 *
 * The Lineup never saw it, because its select joins `course` and a two-table
 * select qualifies everything. The Course page's sections query names one table
 * and hit it on the first run, which is the whole reason this is a module rather
 * than a habit: a fragment that is only correct in the queries it was first
 * pasted into is a trap for the next caller, and the next caller is a later
 * ticket's detail page.
 */
export function qualified(column: Column): SQL {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;
}
