-- The `classes` Supabase project. Reference, not a migration — nothing runs this.
--
-- Source of truth for the curated schema while the map is being worked, in the
-- same sense docs/machines/*.ts are source of truth for the lifecycles. The build
-- effort turns this into `drizzle-kit` migrations; see docs/schema/README.md for
-- the reasoning behind every table, and for the twelve closed tickets this file
-- is the synthesis of.
--
-- Settled by https://github.com/nopivnick/lineup-prototype-03/issues/10.
--
-- Conventions applied throughout, each from a closed ticket:
--
--   * Surrogate keys are `bigint GENERATED ALWAYS AS IDENTITY`. Readable in a
--     URL, and surfaced as `string` in TypeScript, which is what
--     `LiveOffering.id` in course.machine.ts already assumes.
--   * Fixed value sets are `text` plus a CHECK, never a native `ENUM`. issues/6
--     forced this for `status` (a generated column's expression must be
--     IMMUTABLE, and text→enum casts are only STABLE), and the role list has
--     already changed three times (issues/4, issues/8, issues/34) — a CHECK is
--     one line to widen or narrow in either direction, an ENUM is not.
--   * Machine state is a persisted XState snapshot in `jsonb`, projected by a
--     generated `status` column (issues/6).
--   * The state CHECK is written against `snapshot->>'value'` rather than against
--     the generated column. Identical in effect, and it avoids depending on
--     whether a generated column may be referenced in a CHECK. issues/13's test —
--     the CHECK's value set must equal the machine's exported state union — reads
--     the same either way.
--   * `created_at`/`created_by` on entity rows (issues/13); `updated_at`/
--     `updated_by` alongside them (issues/10), written by the single field writer
--     and never by a trigger.
--   * No RLS anywhere (issues/28).

-- ===========================================================================
-- Reference data
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- program — issues/7
-- ---------------------------------------------------------------------------
-- A table rather than an enum: three foreign keys point at it, it carries
-- attributes an enum cannot hold, and it is where a residency or mode attribute
-- would land if one is ever wanted.

CREATE TABLE program (
  code          text        PRIMARY KEY,           -- 'ITP', 'IMA', 'LOWRES'
  name          text        NOT NULL,
  degree_level  text        NOT NULL
                            CHECK (degree_level IN ('undergraduate', 'graduate')),

  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text        NOT NULL,
  updated_at    timestamptz,
  updated_by    text
);

-- ---------------------------------------------------------------------------
-- term — issues/3
-- ---------------------------------------------------------------------------
-- `code` is year plus a semester ordinal: 20253 = Fall 2025. It sorts
-- chronologically as plain text, which is why there is no parallel `_int`
-- column — legacy had three of those and issues/3 killed the pattern.
--
-- The ordinals are forced rather than chosen: issues/3 fixed Fall = 3 and
-- required text sorting to be chronological, so within a year Spring < Summer <
-- Fall must hold as digits. 1, 2, 3 is the only assignment satisfying both.
--
-- `(year, semester)` is authoritative and `code` is checked against it, so the
-- two cannot disagree.
--
-- No dates. issues/3 deferred them without precluding them, and issues/10's
-- meeting model was chosen partly so they stay deferred — see `offering_meeting`.

CREATE TABLE term (
  code           char(5)     PRIMARY KEY,
  year           smallint    NOT NULL CHECK (year BETWEEN 1979 AND 2999),
  semester       text        NOT NULL
                             CHECK (semester IN ('Spring', 'Summer', 'Fall')),

  -- NYU SIS's own code for this term. Recorded, never load-bearing.
  sis_term_code  text,

  CONSTRAINT term_code_matches_year_and_semester CHECK (
    code = year::text || CASE semester
                           WHEN 'Spring' THEN '1'
                           WHEN 'Summer' THEN '2'
                           WHEN 'Fall'   THEN '3'
                         END
  ),
  UNIQUE (year, semester)
);

-- ===========================================================================
-- Authorization
-- ===========================================================================
-- Neither legacy database has a role table, a director table, or any
-- authorization table at all — both of these are issues/4 inventions, and
-- issues/34 established that as a fact rather than an oversight.
--
-- Reads on both are Tier 1 (issues/28 via issues/34). The *enforcement* read sits
-- outside the tiers entirely, or authorization would be gated by a rule that
-- depends on its own result.

-- ---------------------------------------------------------------------------
-- user_role — issues/4, issues/8, issues/32, issues/34
-- ---------------------------------------------------------------------------
-- Flat. No scope column and no time dimension — scope always comes from a
-- relationship, and a permission is a conjunction of the two.
--
-- Seven values, split by issues/34 into *capabilities* (actor-side, subsumed by
-- the chair: `coordinator`) and *qualifications* (subject-side, subsumed by
-- nothing: `instructor`, `area_head`, `program_director`, `advisor`). `student`
-- and `advisor` hold nothing in the permission matrix, and issues/34 established
-- that as complete rather than incomplete.
--
-- Written by the `chair` and by nobody else. Revocation is a DELETE, refused
-- while a live relationship depends on the row (standing principle 6) and
-- refused for the last remaining `chair`. A revoked grant leaves no trace: an
-- accepted cost, and the sharpest instance of the audit gap issues/10 ruled out
-- of scope.

CREATE TABLE user_role (
  netid       text        NOT NULL,
  role        text        NOT NULL CHECK (role IN (
                            'student',
                            'instructor',
                            'advisor',
                            'coordinator',
                            'program_director',
                            'area_head',
                            'chair'
                          )),

  granted_by  text        NOT NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (netid, role)
);

-- ---------------------------------------------------------------------------
-- program_director — issues/4, issues/34
-- ---------------------------------------------------------------------------
-- Many-to-many: the relationship that scopes the `program_director` role.
-- Appointing a director is two writes, the role then this row, both by the chair.
-- A program director may not appoint a co-director.

CREATE TABLE program_director (
  program_code  text        NOT NULL REFERENCES program (code),
  netid         text        NOT NULL,

  granted_by    text        NOT NULL,
  granted_at    timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (program_code, netid)
);

-- ===========================================================================
-- Curriculum vocabulary
-- ===========================================================================
-- Both tables are program-scoped, which issues/7 recommended against and the
-- requester overruled. That call has since turned out load-bearing four times:
-- issues/25 needed a program on `area` to have an author to split the tag tables
-- on, issues/30 needed the composite unique key to make its foreign key
-- declarative, issues/32 needed program-scoping to force the area assignment onto
-- the review rather than the shared proposal body, and this file needs it for the
-- composite foreign keys below.
--
-- They stay two tables despite an identical shape, because their payloads differ
-- (issues/25).
--
-- The `UNIQUE (id, program_code)` on each is redundant against the primary key on
-- its own, and exists solely so the join tables can point a composite foreign key
-- at it — the device that makes "a course's own tags are its own program's" a
-- database rule rather than a promise.

-- ---------------------------------------------------------------------------
-- area — issues/7, issues/25, issues/32
-- ---------------------------------------------------------------------------
-- Legacy had no `area` table at all: `course_x_areas` was `(course_id, area)`
-- with `area` as free text and no provenance columns. This table is an invention,
-- exactly as `course.program_code` is.
--
-- No head column. issues/32 rechecked and retired the idea: a course carries
-- 1..n areas, so three areas would imply three heads where issues/8 needs exactly
-- one, and a non-derived `area.head_netid` would be a second copy with no
-- transaction writing both. The accepted cost is that an area changing hands has
-- no single write.

CREATE TABLE area (
  area_id       bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  program_code  text        NOT NULL REFERENCES program (code),
  name          text        NOT NULL,

  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text        NOT NULL,
  updated_at    timestamptz,
  updated_by    text,

  UNIQUE (area_id, program_code),
  UNIQUE (program_code, name)
);

-- ---------------------------------------------------------------------------
-- requirement_category — issues/7
-- ---------------------------------------------------------------------------
-- Legacy `ima_category`, generalised. Its IMA-only-ness was an artifact of there
-- being no program entity to key on — the table had no program column because
-- it was IMA's by *name*, not by key.
--
-- The course→category mapping is in scope because the catalog displays it. The
-- per-student ledger (`credits_ima_category`) is not.

CREATE TABLE requirement_category (
  requirement_category_id  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  program_code             text        NOT NULL REFERENCES program (code),
  name                     text        NOT NULL,
  credits                  integer,
  group_no                 integer,

  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               text        NOT NULL,
  updated_at               timestamptz,
  updated_by               text,

  UNIQUE (requirement_category_id, program_code),
  UNIQUE (program_code, name)
);

-- ===========================================================================
-- Proposal and review
-- ===========================================================================
-- issues/7 split the supplied Course machine at `approve`. A **proposal** is one
-- shared body reviewed independently by each program it was requested for; a
-- **course** exists in exactly one program's catalog and is minted by an
-- approving review.
--
-- No ticket ever gave these tables a column list. They are derived here from
-- issues/7 and issues/32; see docs/schema/README.md, which names them as the two
-- derivations this file makes beyond what a closed ticket authorised.
--
-- Reads are Tier 3: `program_director`, or `created_by`, or `review.area_head`
-- (issues/28 as widened by issues/32).

-- ---------------------------------------------------------------------------
-- course_proposal — issues/7
-- ---------------------------------------------------------------------------
-- **No state.** All state lives in the reviews. issues/7 decided this on
-- reversibility: adding a proposal machine later is additive, removing one later
-- is the throwing case issues/13 identified.
--
-- No `course_number`: issues/7 has each approving program mint a course with its
-- own number, so the number is assigned at the mint and never sits here.
--
-- Body edits are confined to `Developing` (issues/8), which is what gives the
-- review's `develop` event a job.

CREATE TABLE course_proposal (
  course_proposal_id  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  title               text        NOT NULL,
  description         text,
  credits             integer     NOT NULL CHECK (credits > 0),

  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          text        NOT NULL,
  updated_at          timestamptz,
  updated_by          text
);

-- ---------------------------------------------------------------------------
-- course_proposal_review — issues/7, issues/32
-- ---------------------------------------------------------------------------
-- One actor per (proposal, program). **The row is the request**: a program was
-- requested exactly when a review exists for it, so there is no separate
-- requested-programs table.
--
-- `area_head` and the review's area rows are the assignment issues/32 put here,
-- because areas are program-scoped and a shared proposal body cannot hold a
-- program-scoped value. Both are nullable and no guard checks them — the rule
-- they answer to (*a course must not become an offering without an area and an
-- area head*) is asserted in the Offering create path.
--
-- `approve` copies the body **and** the assignment forward into a new `course`,
-- in one transaction. Three approving programs mint three courses that may sit in
-- three different areas under three different heads.

CREATE TABLE course_proposal_review (
  course_proposal_review_id  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_proposal_id         bigint      NOT NULL REFERENCES course_proposal (course_proposal_id),
  program_code               text        NOT NULL REFERENCES program (code),

  snapshot                   jsonb       NOT NULL,
  status                     text        GENERATED ALWAYS AS (snapshot->>'value') STORED,

  -- The assignment. Monotone: swap freely, never empty once set. The writer has
  -- no unassign operation, in issues/28's `staff`/`unstaff` non-exposure sense,
  -- which is what makes the Offering create-path check sufficient forever rather
  -- than a precondition the system eventually violates.
  --
  -- The writer refuses a netid not holding `area_head` in `user_role`
  -- (standing principle 6).
  area_head                  text,

  created_at                 timestamptz NOT NULL DEFAULT now(),
  created_by                 text        NOT NULL,
  updated_at                 timestamptz,
  updated_by                 text,

  CONSTRAINT course_proposal_review_status CHECK (
    snapshot->>'value' IN ('Proposed', 'Developing', 'Approved', 'Rejected')
  ),

  UNIQUE (course_proposal_id, program_code),
  UNIQUE (course_proposal_review_id, program_code)
);

CREATE INDEX course_proposal_review_status_idx ON course_proposal_review (status);

-- ---------------------------------------------------------------------------
-- course_proposal_review_area — derived from issues/25 + issues/32
-- ---------------------------------------------------------------------------
-- The review-level half of the area assignment. Copied into `course_area` by
-- `approve`.
--
-- The composite foreign keys make "a review's areas are its own program's" a
-- database rule. This table is not named by any ticket; it exists because
-- issues/32 put the assignment on the review while issues/25 made areas
-- program-scoped, and a course carries 1..n of them.

CREATE TABLE course_proposal_review_area (
  course_proposal_review_id  bigint NOT NULL,
  area_id                    bigint NOT NULL,
  program_code               text   NOT NULL,

  PRIMARY KEY (course_proposal_review_id, area_id),

  FOREIGN KEY (course_proposal_review_id, program_code)
    REFERENCES course_proposal_review (course_proposal_review_id, program_code),
  FOREIGN KEY (area_id, program_code)
    REFERENCES area (area_id, program_code)
);

-- ===========================================================================
-- Course
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- course — issues/7, issues/8, issues/17, issues/25, issues/30, issues/32, issues/10
-- ---------------------------------------------------------------------------
-- Legacy `course` had **no primary key** — only a non-unique `KEY course_id` —
-- while `lineup_official` declared a foreign key to it. MySQL tolerated that;
-- Postgres would reject it outright. It has a real primary key here.
--
-- A course is minted already `Approved`, by an approving review. It is never
-- proposed here.
--
-- `program_code` is **immutable**: issues/30 established that a re-home would let
-- a director do by field write what issues/8 forbade them to do by transition.
-- The wrong-program fix is `kill` and re-propose.

CREATE TABLE course (
  course_id      bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  program_code   text        NOT NULL REFERENCES program (code),

  -- Unique within a program, not department-wide. NYU's own CourseLeaf feed
  -- scopes a catalog number the same way — `(subject_code, catalog_num,
  -- section_num)` — and issues/7 established the three programs have distinct
  -- catalogs. Legacy had no constraint at all; the strict rule is the reversible
  -- direction, since dropping it is catalog-only and always succeeds while adding
  -- it later scans and can fail (issues/13's DDL argument).
  --
  -- Required from the moment a course is minted. Unlike the area assignment,
  -- which issues/32 deliberately let arrive late because a later gate enforces
  -- it, there is no later gate here — an unnumbered course is one no view can
  -- render.
  course_number  text        NOT NULL,

  title          text        NOT NULL,
  description    text,

  -- On the course, not the offering. Legacy put credits on `section`, and this
  -- reverses that on the requester's fact that a course does not run for
  -- different credit amounts in different terms. It also vindicates the comment
  -- already in course.machine.ts, which had described a course revision as
  -- covering "title, description, credits".
  credits        integer     NOT NULL CHECK (credits > 0),

  url            text,

  -- Counts approved revisions. Derivable from `course_transition` — it is one
  -- plus the number of `approve` rows — and stored anyway at the requester's
  -- direction, against the recommendation, because the number is read by people.
  --
  -- Legal under standing principle 1 by the exemption route: the same single
  -- writer that moves the course bumps this, in one transaction, so the two
  -- cannot disagree. Same shape as the `Staffed` state from issues/15.
  --
  -- Bumped on `approve`, not on `revise`. An edition is a thing that was
  -- published and stood; a half-finished edit is not one yet, and the number
  -- never has to go backwards.
  edition        integer     NOT NULL DEFAULT 1 CHECK (edition >= 1),

  -- Copied from the approving review. Nullable here: issues/32 established a
  -- director may assign before approval, at it, or after. The gate is the
  -- Offering create path, which refuses a course without both an area and a head.
  area_head      text,

  -- issues/42. The review whose `approve` minted this course.
  --
  -- **Provenance, not a reference to the body.** issues/8 ruled there is no link
  -- back from a course to its proposal, and that ruling is untouched: it is
  -- about the *body*, which issues/7 has the mint **copy** so that variants in
  -- different programmes may diverge. This column references the act, not the
  -- text, and nothing reads through it to render course content.
  --
  -- It exists because issues/42 built the first screen that can reach a review,
  -- and found the trail died at approval in both directions — the review could
  -- not say which course it produced, and the course could not say where it came
  -- from. Reconstructing the pair by matching titles is right until the course is
  -- revised, which is exactly when someone asks.
  --
  -- `UNIQUE`, because a review's `approve` fires once and mints one course; the
  -- constraint also supplies the index for the review-to-course lookup. Postgres
  -- permits many NULLs under a unique constraint, so this costs nothing while the
  -- column is optional.
  --
  -- **Nullable, deliberately, against issues/10's usual preference for the strict
  -- option.** issues/7 makes every course arrive by an approving review, so
  -- `NOT NULL` looks free — but it would force the seed to author a proposal and
  -- a review for every fixture course, and whether the seed mints through the
  -- review or writes an already-`Approved` course directly is a question no
  -- closed ticket settles. Tightening later is the direction that scans and can
  -- fail; that cost is accepted here rather than deciding the seed's shape from a
  -- column comment. Whoever settles the seed inherits the choice.
  minted_from_review_id  bigint  UNIQUE
                                 REFERENCES course_proposal_review (course_proposal_review_id),

  snapshot       jsonb       NOT NULL,
  status         text        GENERATED ALWAYS AS (snapshot->>'value') STORED,

  -- `created_by` is the approving *actor*, not the director — issues/32 amended
  -- issues/13 on that point.
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     text        NOT NULL,
  updated_at     timestamptz,
  updated_by     text,

  CONSTRAINT course_status CHECK (
    snapshot->>'value' IN ('Approved', 'Revising', 'Retired')
  ),

  UNIQUE (program_code, course_number),

  -- Redundant against the primary key, and the target of issues/30's composite
  -- foreign key from `offering` and of the join tables below.
  UNIQUE (course_id, program_code)
);

CREATE INDEX course_status_idx  ON course (status);
CREATE INDEX course_program_idx ON course (program_code);

-- ---------------------------------------------------------------------------
-- course_area, course_requirement_category — issues/25
-- ---------------------------------------------------------------------------
-- **The course's own program only.** A mapping row is program P declaring what
-- counts toward P's degree; on these two tables the course is the object of the
-- claim and its own program is the author. The composite foreign keys make that
-- structural: `program_code` is checked against the course on one side and
-- against the area or category on the other, so the two must agree.
--
-- issues/32 gave these rows their account of first authorship: they originate on
-- the review, written by that program's director, and are copied by `approve`.

CREATE TABLE course_area (
  course_id     bigint NOT NULL,
  area_id       bigint NOT NULL,
  program_code  text   NOT NULL,

  PRIMARY KEY (course_id, area_id),

  FOREIGN KEY (course_id, program_code) REFERENCES course (course_id, program_code),
  FOREIGN KEY (area_id, program_code)   REFERENCES area (area_id, program_code)
);

CREATE TABLE course_requirement_category (
  course_id                bigint NOT NULL,
  requirement_category_id  bigint NOT NULL,
  program_code             text   NOT NULL,

  PRIMARY KEY (course_id, requirement_category_id),

  FOREIGN KEY (course_id, program_code)
    REFERENCES course (course_id, program_code),
  FOREIGN KEY (requirement_category_id, program_code)
    REFERENCES requirement_category (requirement_category_id, program_code)
);

-- ===========================================================================
-- Offering
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- offering — issues/2, issues/3, issues/8, issues/15, issues/30, issues/10
-- ---------------------------------------------------------------------------
-- One taught class in one term, 1:1 with legacy `section`. Named `offering`
-- throughout; course×term is a query, not an entity.
--
-- The composite foreign key to `course` is the offering's **only** foreign key to
-- it — referencing a unique key already guarantees `course_id` exists. It
-- enforces issues/30's rule that an offering's program is always its course's,
-- and `ON UPDATE NO ACTION` does double duty by enforcing `course.program_code`'s
-- immutability rather than assuming it.
--
-- Nothing outside the create path ever writes `program_code`; the creating Server
-- Action derives it from the course, and it never appears in the create
-- signature.
--
-- Legacy's `year(4)` columns are gone — Postgres has no such type, and issues/3
-- replaced the `(year, semester)` pair everywhere but `term` with `term_code`.

CREATE TABLE offering (
  offering_id       bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  course_id         bigint      NOT NULL,
  program_code      text        NOT NULL,
  term_code         char(5)     NOT NULL REFERENCES term (code),

  -- Two sections of one course in one term is real (issues/30), so there is no
  -- uniqueness on `(course_id, term_code)` — the section number is what tells
  -- them apart, and it is unique within the pair.
  section_number    text        NOT NULL DEFAULT '1',

  call_number       text,
  sis_class_number  integer,
  url               text,

  -- Free text. Unlike the value sets elsewhere in this file, the domain of this
  -- column is not known, and a guessed CHECK would refuse real values — a rule
  -- that fires wrongly rather than one that never fires.
  mode              text,

  -- A published fact about the class, set by a coordinator, displayed in the
  -- catalog. Nothing enforces it: registration is out of scope, so no mechanism
  -- could refuse the nineteenth student.
  enrollment_limit  integer     CHECK (enrollment_limit > 0),

  snapshot          jsonb       NOT NULL,
  status            text        GENERATED ALWAYS AS (snapshot->>'value') STORED,

  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        text        NOT NULL,
  updated_at        timestamptz,
  updated_by        text,

  CONSTRAINT offering_status CHECK (
    snapshot->>'value' IN (
      'Slated', 'Staffed', 'Offered', 'Accepted', 'Declined', 'Deferred',
      'Scheduled', 'Published', 'Listed', 'Running', 'Evaluating', 'Canceled',
      'Concluded', 'Dead'
    )
  ),

  UNIQUE (course_id, term_code, section_number),

  FOREIGN KEY (course_id, program_code)
    REFERENCES course (course_id, program_code)
    ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE INDEX offering_status_idx ON offering (status);
CREATE INDEX offering_term_idx   ON offering (term_code);
CREATE INDEX offering_course_idx ON offering (course_id);

-- ---------------------------------------------------------------------------
-- offering_instructor — issues/2, issues/15, issues/19, issues/34
-- ---------------------------------------------------------------------------
-- An **ordered roster**. Position 0 is the lead, and that position gates
-- `offer` / `accept` / `decline` / `defer`.
--
-- Occupancy of position 0 is what the `Staffed` state means, and `staff` /
-- `unstaff` are never user-facing: one Server Action writes this row and sends
-- the event in one transaction, so divergence has no code path. They track
-- occupancy, not identity — swapping lead A for lead B inside `Staffed` fires
-- nothing.
--
-- Position 0 is editable only in `Slated` and `Staffed`, frozen everywhere else.
-- `decline` and `withdraw` are the only things that vacate it downstream, each a
-- DELETE inside the transition's transaction.
--
-- The writer refuses a netid not holding `instructor` in `user_role` — **every**
-- roster row, not just position 0 (standing principle 6) — and refuses a netid
-- the `people` project does not know (issues/9: the writer checks, the read
-- tolerates).

CREATE TABLE offering_instructor (
  offering_id  bigint  NOT NULL REFERENCES offering (offering_id),
  position     integer NOT NULL CHECK (position >= 0),
  netid        text    NOT NULL,

  PRIMARY KEY (offering_id, position),
  UNIQUE (offering_id, netid)
);

-- ---------------------------------------------------------------------------
-- offering_meeting — issues/10
-- ---------------------------------------------------------------------------
-- Where the map's LowRes question lands. The three programs share one term
-- calendar, so LowRes's low-residency difference — intensives, online — had to
-- land on the meeting model, and this is it.
--
-- Legacy modelled meetings **twice**: a display string `section.meetings`, and a
-- structured `section_x_time_space`. The structured one carried a weekday `day`,
-- a calendar `date_date` and a `special` flag in one table, with nothing
-- enforcing which columns went with which kind. That is the failure this table
-- fixes: the kind is **declared** and the shape CHECK enforces it, which is
-- issues/30's move of making a convention structural rather than disciplinary.
--
-- One row per slot, three kinds:
--
--   weekly  — recurs on a weekday through the term. The ordinary case.
--   dates   — a bounded date range. LowRes intensives; one-off sessions.
--   async   — no time at all. A positive statement, not an absence.
--
-- Deliberately **not** one row per concrete session. That shape would need term
-- start and end dates to expand a weekly pattern, and issues/3 deferred those; it
-- would also make an asynchronous course indistinguishable from an unscheduled
-- one.
--
-- The room lives here rather than on `offering` — legacy stored it in both places
-- — because a class genuinely can meet in different rooms on different days. This
-- amends issues/8, which listed "room" as an offering field when there was no
-- meeting table to put it on.
--
-- issues/8's "meeting pattern" field class therefore governs **rows** here rather
-- than a column on `offering`: same writers, different mechanism.

CREATE TABLE offering_meeting (
  offering_meeting_id  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offering_id          bigint      NOT NULL REFERENCES offering (offering_id),

  kind                 text        NOT NULL CHECK (kind IN ('weekly', 'dates', 'async')),

  day_of_week          smallint,   -- weekly only. 0 = Sunday .. 6 = Saturday
  start_date           date,       -- dates only
  end_date             date,       -- dates only
  start_time           time,       -- weekly and dates
  end_time             time,       -- weekly and dates
  room                 text,       -- weekly and dates

  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           text        NOT NULL,
  updated_at           timestamptz,
  updated_by           text,

  CONSTRAINT offering_meeting_shape CHECK (
    CASE kind
      WHEN 'weekly' THEN
        day_of_week IS NOT NULL
        AND start_time IS NOT NULL AND end_time IS NOT NULL
        AND start_date IS NULL AND end_date IS NULL
      WHEN 'dates' THEN
        start_date IS NOT NULL AND end_date IS NOT NULL
        AND start_time IS NOT NULL AND end_time IS NOT NULL
        AND day_of_week IS NULL
      WHEN 'async' THEN
        day_of_week IS NULL
        AND start_date IS NULL AND end_date IS NULL
        AND start_time IS NULL AND end_time IS NULL
        AND room IS NULL
    END
  ),
  CONSTRAINT offering_meeting_day_of_week CHECK (
    day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6
  ),
  CONSTRAINT offering_meeting_times_ordered CHECK (
    start_time IS NULL OR end_time IS NULL OR end_time > start_time
  ),
  CONSTRAINT offering_meeting_dates_ordered CHECK (
    start_date IS NULL OR end_date IS NULL OR end_date >= start_date
  )
);

CREATE INDEX offering_meeting_offering_idx ON offering_meeting (offering_id);

-- ---------------------------------------------------------------------------
-- offering_area, offering_requirement_category — issues/25, issues/30
-- ---------------------------------------------------------------------------
-- **Seat sharing**, and the *only* place in the whole model where a program other
-- than the course's own appears.
--
-- An ITP offering, of ITP's course, run by ITP, opening seats to IMA students,
-- with IMA's category and area assigned at that point. Written by the director of
-- the **category's** program — whoever authors the claim writes the row — which
-- is the sole exception to issues/4's rule that program scope applies to
-- Offerings.
--
-- State-blind under issues/8's rule, since no Offering state asserts anything
-- about shared seats. That keeps the retroactive-credit case in `Concluded`
-- reachable on purpose.
--
-- No composite foreign key here, unlike the course-level pair. issues/30 weighed
-- the declarative form — two denormalized columns, two composite foreign keys, a
-- CHECK and a new unique key — and rejected it on scale, not principle: the
-- **single writer refuses a category whose program equals the offering's**, down
-- a path that already loads both programs to authorize itself.
--
-- `granted_by` / `granted_at` are issues/13's creation rule applied to a row
-- creation, landing attribution exactly where the writer comes from outside the
-- offering's program. Legacy's `notes` on `course_ima_category_bk` is
-- deliberately not carried forward.

CREATE TABLE offering_area (
  offering_id  bigint      NOT NULL REFERENCES offering (offering_id),
  area_id      bigint      NOT NULL REFERENCES area (area_id),

  granted_by   text        NOT NULL,
  granted_at   timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (offering_id, area_id)
);

CREATE TABLE offering_requirement_category (
  offering_id              bigint      NOT NULL REFERENCES offering (offering_id),
  requirement_category_id  bigint      NOT NULL REFERENCES requirement_category (requirement_category_id),

  granted_by               text        NOT NULL,
  granted_at               timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (offering_id, requirement_category_id)
);

-- ===========================================================================
-- Transition logs
-- ===========================================================================
-- Append-only. One row per lifecycle move, written by `applyTransition` in the
-- same transaction as the snapshot — issues/13 made log completeness a property
-- of there being a single writer rather than of discipline, and issues/28 moved
-- the permission check inside that same writer.
--
-- **Not a general audit log.** issues/17 established the constraint and issues/10
-- honoured it: `event`, `from_state` and `to_state` are exactly machine values,
-- and that meaning is load-bearing. What records an ordinary field write is
-- `updated_at` / `updated_by` on the entity row, and nothing more; the full audit
-- table is out of scope for this destination.
--
-- **No genesis row.** `from_state` is NOT NULL. Creation is an act but not a
-- transition, and it is recorded as `created_at` / `created_by` on the entity row
-- — decided on derivability, since a genesis row reconstructs from the entity row
-- by one INSERT...SELECT while nothing reconstructs `created_by` from a log whose
-- rows you deleted.
--
-- **No CHECK on `event`.** issues/13 kept the event union a TypeScript fact,
-- enforced at the single already-type-safe writer. A database copy would be a
-- second hand-maintained list, widening the migration burden from state changes
-- to event changes — issues/17 and issues/19 would each have needed DDL.
--
-- The three tables share one shape because one generic writer writes all three.
--
-- Reads are Tier 2: any *acting* role. `student` and `advisor` see none of it —
-- if you can do nothing, you may not see the record of who did.

-- ---------------------------------------------------------------------------
-- offering_transition
-- ---------------------------------------------------------------------------

CREATE TABLE offering_transition (
  offering_transition_id  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offering_id             bigint      NOT NULL REFERENCES offering (offering_id),

  event                   text        NOT NULL,
  from_state              text        NOT NULL,
  to_state                text        NOT NULL,

  -- Who clicked.
  actor_netid             text        NOT NULL,

  -- Who it was done to. issues/15 added it because a decline is routinely
  -- recorded by an admin and the roster row is deleted in the same transaction,
  -- so "who said no" would otherwise survive nowhere. Forced on `decline`,
  -- `withdraw`, `staff` and `unstaff`.
  --
  -- Forced on `offer` and `accept` too, since issues/41. Those two were the
  -- stated exception: issues/19 held that the roster row survives them and
  -- answers "who is the lead" directly. It does — but it answers who the lead
  -- is *now*, and a log is read later. An offering whose lead is withdrawn from
  -- and re-staffed has its roster rewritten under the log, so `offer` becomes
  -- unattributable and `accept` names whoever holds position 0 today. The
  -- writer already holds the netid at both events, so this costs one assignment.
  subject_netid           text,

  -- Free text, optional. issues/19 parked this here and issues/10 settled it:
  -- free text in, structured reason codes out of scope. The codes would have
  -- served contract-obligation tracking, which issues/21 itself excluded, and
  -- their value set is not known.
  reason                  text,

  at                      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT offering_transition_from_state CHECK (
    from_state IN (
      'Slated', 'Staffed', 'Offered', 'Accepted', 'Declined', 'Deferred',
      'Scheduled', 'Published', 'Listed', 'Running', 'Evaluating', 'Canceled',
      'Concluded', 'Dead'
    )
  ),
  CONSTRAINT offering_transition_to_state CHECK (
    to_state IN (
      'Slated', 'Staffed', 'Offered', 'Accepted', 'Declined', 'Deferred',
      'Scheduled', 'Published', 'Listed', 'Running', 'Evaluating', 'Canceled',
      'Concluded', 'Dead'
    )
  )
);

CREATE INDEX offering_transition_offering_idx ON offering_transition (offering_id, at);

-- ---------------------------------------------------------------------------
-- course_transition
-- ---------------------------------------------------------------------------
-- `subject_netid` is present for shape symmetry with the other two logs, since
-- one generic writer writes all three. No Course event currently carries one.
--
-- This is also where `course.edition` derives from: edition is one plus the
-- number of `approve` rows here.

CREATE TABLE course_transition (
  course_transition_id  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id             bigint      NOT NULL REFERENCES course (course_id),

  event                 text        NOT NULL,
  from_state            text        NOT NULL,
  to_state              text        NOT NULL,
  actor_netid           text        NOT NULL,
  subject_netid         text,
  reason                text,
  at                    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_transition_from_state CHECK (
    from_state IN ('Approved', 'Revising', 'Retired')
  ),
  CONSTRAINT course_transition_to_state CHECK (
    to_state IN ('Approved', 'Revising', 'Retired')
  )
);

CREATE INDEX course_transition_course_idx ON course_transition (course_id, at);

-- ---------------------------------------------------------------------------
-- course_proposal_review_transition — derived
-- ---------------------------------------------------------------------------
-- The second table in this file no ticket names. issues/6 predates issues/7's
-- split, so it specified two logs for what were then two machines; the review is
-- a third machine, its `approve` / `reject` / `develop` are permission-gated
-- (issues/8, issues/32), and issues/13's single writer holds the snapshot and the
-- log row together for every machine it moves.
--
-- Without it, `applyTransition` needs a branch for a machine with no log, and a
-- rejection would be recorded nowhere: issues/13's `created_by` on a minted
-- course makes an *approval* attributable, but nothing makes a `reject` or a
-- `develop` so.

CREATE TABLE course_proposal_review_transition (
  course_proposal_review_transition_id  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_proposal_review_id             bigint      NOT NULL
                                          REFERENCES course_proposal_review (course_proposal_review_id),

  event                                 text        NOT NULL,
  from_state                            text        NOT NULL,
  to_state                              text        NOT NULL,
  actor_netid                           text        NOT NULL,
  subject_netid                         text,
  reason                                text,
  at                                    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_proposal_review_transition_from_state CHECK (
    from_state IN ('Proposed', 'Developing', 'Approved', 'Rejected')
  ),
  CONSTRAINT course_proposal_review_transition_to_state CHECK (
    to_state IN ('Proposed', 'Developing', 'Approved', 'Rejected')
  )
);

CREATE INDEX course_proposal_review_transition_review_idx
  ON course_proposal_review_transition (course_proposal_review_id, at);
