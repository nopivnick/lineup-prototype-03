-- The `people` Supabase project. Reference, not a migration — nothing runs this.
--
-- Source of truth for the curated schema while the map is being worked, in the
-- same sense docs/machines/*.ts are source of truth for the lifecycles. The
-- build effort turns this into `drizzle-kit` migrations; see docs/schema/README.md
-- for why every column is here and why thirty-one others are not.
--
-- Settled by https://github.com/nopivnick/lineup-prototype-03/issues/10.

-- ---------------------------------------------------------------------------
-- person
-- ---------------------------------------------------------------------------
-- The whole project. Legacy `nyu_official` had 34 columns; 8 survive.
--
-- `netid` is the primary key rather than a surrogate, because it is already the
-- cross-project join key (issues/3, issues/9) and the dev cookie's entire
-- payload (issues/11). Nothing in either database holds a foreign key to this
-- table — the two projects cannot reference each other (issues/5) — so there is
-- no referential cost to keying on a natural identifier.

CREATE TABLE person (
  netid                text        PRIMARY KEY,

  -- NYU's own identifier for a person, the N-number. Kept on the precedent of
  -- `term.sis_term_code` (issues/3): recorded so the link to NYU's real systems
  -- survives, never load-bearing. Optional, because a fixture person need not
  -- have one; unique when present.
  university_id        text        UNIQUE,

  official_firstname   text        NOT NULL,
  official_lastname    text        NOT NULL,

  -- The name someone actually goes by. Optional per part: a person may have a
  -- preferred first name and no preferred surname.
  preferred_firstname  text,
  preferred_lastname   text,

  pronouns             text,

  -- Preferred name where there is one, official name otherwise. Generated, so
  -- it cannot drift from its inputs — the same device issues/6 used for the
  -- machine `status` columns, and the reason this table is sortable by name at
  -- all. issues/9 depends on that: its cross-project read runs the `people`
  -- query first when filtering or ordering by name, which needs a single
  -- sortable column rather than a two-part COALESCE at every call site.
  display_name         text        GENERATED ALWAYS AS (
                                     coalesce(preferred_firstname, official_firstname)
                                     || ' ' ||
                                     coalesce(preferred_lastname, official_lastname)
                                   ) STORED,

  -- No `created_by` / `updated_by`. issues/13 puts creation provenance on entity
  -- rows and issues/10 added `updated_*` to the same set, but both name an actor,
  -- and nothing in the skeleton writes a person: rows arrive from the seed, and
  -- in a real deployment from an NYU feed. Actor columns here would be
  -- permanently null. `updated_at` survives because a feed has a meaningful one —
  -- legacy's `last_updated` was exactly that.
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz
);

-- issues/10 ruled search to be plain `ILIKE` pattern matching with no index and
-- no extension: the index is invisible to the query, so adding `pg_trgm` later
-- changes no application code. This index is the ordinary btree one, and it is
-- here for issues/9's *ordering* path, not for search.
CREATE INDEX person_display_name ON person (display_name);
