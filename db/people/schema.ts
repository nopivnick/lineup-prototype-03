/**
 * The `people` Postgres project, one table.
 *
 * `docs/schema/people.sql` is authoritative for every column, type and
 * constraint; this file states the same schema in the form `drizzle-kit`
 * generates migrations from. Where the two ever disagree the SQL wins, and the
 * reasoning behind every column — and behind the thirty-one that are not here —
 * lives in `docs/schema/README.md`.
 *
 * Nothing in this project holds a foreign key to `classes`, and nothing in
 * `classes` holds one to this table. The two projects cannot reference each
 * other; `netid` is the join key and the stitch is two queries in TypeScript
 * (docs/data-access/README.md).
 */
import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const person = pgTable(
  "person",
  {
    // The primary key rather than a surrogate: it is already the cross-project
    // join key and the dev cookie's entire payload (issues/3, issues/9,
    // issues/11).
    netid: text("netid").primaryKey(),

    // NYU's own identifier, the N-number. Recorded so the link to NYU's real
    // systems survives, never load-bearing. Optional, unique when present.
    universityId: text("university_id").unique(),

    officialFirstname: text("official_firstname").notNull(),
    officialLastname: text("official_lastname").notNull(),

    // Optional per part: a person may have a preferred first name and no
    // preferred surname.
    preferredFirstname: text("preferred_firstname"),
    preferredLastname: text("preferred_lastname"),

    pronouns: text("pronouns"),

    // Preferred name where there is one, official name otherwise. Generated, so
    // it cannot drift from its inputs, and so this table is sortable by name at
    // all — issues/9's cross-project read runs the `people` query first when
    // ordering by name and needs a single sortable column.
    displayName: text("display_name").generatedAlwaysAs(
      sql`coalesce(preferred_firstname, official_firstname) || ' ' || coalesce(preferred_lastname, official_lastname)`,
    ),

    // No `created_by` / `updated_by`: both name an actor and nothing in the
    // skeleton writes a person. `updated_at` survives because a feed has a
    // meaningful one.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [
    // The ordinary btree index, here for issues/9's *ordering* path. Search is
    // plain `ILIKE` with no index and no extension (issues/10).
    index("person_display_name").on(t.displayName),
  ],
);
