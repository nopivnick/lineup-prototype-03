/**
 * The `classes` Postgres project, twenty tables.
 *
 * `docs/schema/classes.sql` is authoritative for every column, type and
 * constraint; this file states the same schema in the form `drizzle-kit`
 * generates migrations from. Where the two ever disagree the SQL wins, and the
 * reasoning behind every table — and the eighteen closed tickets it is the
 * synthesis of — lives in `docs/schema/README.md`.
 *
 * Three conventions carry through, each from a closed ticket:
 *
 *   * Surrogate keys are `bigint GENERATED ALWAYS AS IDENTITY`. Readable in a
 *     URL and in a `psql` session, where a UUID would be defending a door
 *     issues/11 opened on purpose.
 *
 *     **A derivation, recorded rather than silently narrowed.** issues/10 gives
 *     one reason for `bigint` over `integer`: "it is what Drizzle surfaces as
 *     `string`, which `LiveOffering.id` in course.machine.ts already assumes."
 *     That is not true of the 0.45 line the same package pins. `bigint()` takes
 *     exactly two modes — `number`, which maps through `Number()`, and `bigint`,
 *     which maps through `BigInt()`. Neither is `string`, and the mode is the
 *     only lever: the identity builder is not reachable from `customType`.
 *
 *     `number` is chosen over `bigint`. Both need a `String()` at the read
 *     module where a row becomes a `LiveOffering`, so neither honours the
 *     package's sentence; `number` survives `JSON.stringify` across the
 *     Server/Client Component boundary and reads as `1` in a fixture, where
 *     `bigint` throws there and reads as `1n`. The DDL is `bigint` either way,
 *     which is the part issues/10 was authoritative over. The exactness `number`
 *     gives up arrives at 2^53 ids.
 *
 *     Filed as issues/93, which is where the mode gets ratified or overturned
 *     and where the two false sentences in `docs/schema/` get amended. This
 *     paragraph shrinks to a pointer once it closes.
 *   * Fixed value sets are `text` plus a CHECK, never a native `ENUM`
 *     (issues/6): a generated column's expression must be IMMUTABLE and
 *     text→enum casts are only STABLE, and a CHECK is one line to widen or
 *     narrow in either direction.
 *   * Machine state is a persisted XState snapshot in `jsonb`, projected by a
 *     generated `status` column (issues/6). The CHECK is written against
 *     `snapshot->>'value'` rather than against the generated column — identical
 *     in effect, and it avoids depending on whether a generated column may be
 *     referenced in a CHECK.
 *
 * CHECK bodies and generated expressions are written as literal SQL rather than
 * interpolated column references, so they read the same here as in the
 * authoritative DDL and can be diffed against it.
 *
 * A foreign key is named explicitly wherever the name Drizzle would derive
 * exceeds Postgres's 63-character identifier limit — otherwise Postgres
 * truncates it with a NOTICE, and two long names sharing a prefix would
 * silently collide. Composite keys are always named, because the builder
 * requires it. The short single-column ones keep the derived name.
 *
 * **No foreign key in this file crosses into `people`.** The two projects
 * cannot reference each other, so `offering_instructor.netid`, every
 * `*_by`/`*_netid` column and `course.area_head` are plain `text`. The single
 * writer checks them (docs/data-access/README.md: the writer checks, the read
 * tolerates and never hides).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/** The fourteen Offering states, from `docs/machines/offering.machine.ts`. */
const OFFERING_STATES = `'Slated', 'Staffed', 'Offered', 'Accepted', 'Declined', 'Deferred', 'Scheduled', 'Published', 'Listed', 'Running', 'Evaluating', 'Canceled', 'Concluded', 'Dead'`;

/** The three Course states, from `docs/machines/course.machine.ts`. */
const COURSE_STATES = `'Approved', 'Revising', 'Retired'`;

/** The four review states, from `docs/machines/course-proposal-review.machine.ts`. */
const REVIEW_STATES = `'Proposed', 'Developing', 'Approved', 'Rejected'`;

// ===========================================================================
// Reference data
// ===========================================================================

/**
 * A table rather than an enum: three foreign keys point at it, it carries
 * attributes an enum cannot hold, and it is where a residency or mode attribute
 * would land if one is ever wanted (issues/7).
 */
export const program = pgTable(
  "program",
  {
    code: text("code").primaryKey(), // 'ITP', 'IMA', 'LOWRES'
    name: text("name").notNull(),
    degreeLevel: text("degree_level").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: text("updated_by"),
  },
  () => [
    check("program_degree_level", sql`degree_level IN ('undergraduate', 'graduate')`),
  ],
);

/**
 * `code` is year plus a semester ordinal: 20253 = Fall 2025. It sorts
 * chronologically as plain text, which is why there is no parallel `_int`
 * column — legacy had three of those and issues/3 killed the pattern.
 *
 * `(year, semester)` is authoritative and `code` is checked against it, so the
 * two cannot disagree. No dates: issues/3 deferred them, and `offering_meeting`
 * was shaped partly so they stay deferred.
 */
export const term = pgTable(
  "term",
  {
    code: char("code", { length: 5 }).primaryKey(),
    year: smallint("year").notNull(),
    semester: text("semester").notNull(),

    // NYU SIS's own code for this term. Recorded, never load-bearing.
    sisTermCode: text("sis_term_code"),
  },
  (t) => [
    check("term_year", sql`"year" BETWEEN 1979 AND 2999`),
    check("term_semester", sql`semester IN ('Spring', 'Summer', 'Fall')`),
    check(
      "term_code_matches_year_and_semester",
      sql`code = "year"::text || CASE semester WHEN 'Spring' THEN '1' WHEN 'Summer' THEN '2' WHEN 'Fall' THEN '3' END`,
    ),
    unique("term_year_semester").on(t.year, t.semester),
  ],
);

// ===========================================================================
// Authorization
// ===========================================================================

/**
 * Flat. No scope column and no time dimension — scope always comes from a
 * relationship, and a permission is a conjunction of the two (issues/4,
 * issues/8, issues/32, issues/34).
 *
 * Written by the `chair` and by nobody else. Revocation is a DELETE and leaves
 * no trace: the sharpest instance of the audit gap issues/10 ruled out of scope.
 */
export const userRole = pgTable(
  "user_role",
  {
    netid: text("netid").notNull(),
    role: text("role").notNull(),

    grantedBy: text("granted_by").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "user_role_pkey", columns: [t.netid, t.role] }),
    check(
      "user_role_role",
      sql`role IN ('student', 'instructor', 'advisor', 'coordinator', 'program_director', 'area_head', 'chair')`,
    ),
  ],
);

/**
 * Many-to-many: the relationship that scopes the `program_director` role
 * (issues/4, issues/34). Appointing a director is two writes, the role then this
 * row, both by the chair.
 */
export const programDirector = pgTable(
  "program_director",
  {
    programCode: text("program_code")
      .notNull()
      .references(() => program.code),
    netid: text("netid").notNull(),

    grantedBy: text("granted_by").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "program_director_pkey", columns: [t.programCode, t.netid] })],
);

// ===========================================================================
// Curriculum vocabulary
// ===========================================================================
// Both tables are program-scoped, which issues/7 recommended against and the
// requester overruled — a call that has since turned out load-bearing four
// times. They stay two tables despite an identical shape, because their payloads
// differ (issues/25).
//
// The `UNIQUE (id, program_code)` on each is redundant against the primary key
// and exists solely so the join tables can point a composite foreign key at it —
// the device that makes "a course's own tags are its own program's" a database
// rule rather than a promise.

/**
 * Legacy had no `area` table at all. No head column: a course carries 1..n
 * areas, so three areas would imply three heads where issues/8 needs exactly one
 * (issues/7, issues/25, issues/32).
 */
export const area = pgTable(
  "area",
  {
    areaId: bigint("area_id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    programCode: text("program_code")
      .notNull()
      .references(() => program.code),
    name: text("name").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: text("updated_by"),
  },
  (t) => [
    unique("area_id_program_code").on(t.areaId, t.programCode),
    unique("area_program_code_name").on(t.programCode, t.name),
  ],
);

/**
 * Legacy `ima_category`, generalised — its IMA-only-ness was an artifact of
 * there being no program entity to key on (issues/7). The course→category
 * mapping is in scope because the catalog displays it; the per-student ledger is
 * not.
 */
export const requirementCategory = pgTable(
  "requirement_category",
  {
    requirementCategoryId: bigint("requirement_category_id", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    programCode: text("program_code")
      .notNull()
      .references(() => program.code),
    name: text("name").notNull(),
    credits: integer("credits"),
    groupNo: integer("group_no"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: text("updated_by"),
  },
  (t) => [
    unique("requirement_category_id_program_code").on(t.requirementCategoryId, t.programCode),
    unique("requirement_category_program_code_name").on(t.programCode, t.name),
  ],
);

// ===========================================================================
// Proposal and review
// ===========================================================================

/**
 * **No state.** All state lives in the reviews — issues/7 decided this on
 * reversibility: adding a proposal machine later is additive, removing one later
 * is the throwing case issues/13 identified.
 *
 * No `course_number`: each approving program mints a course with its own number,
 * so the number is assigned at the mint and never sits here.
 */
export const courseProposal = pgTable(
  "course_proposal",
  {
    courseProposalId: bigint("course_proposal_id", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),

    title: text("title").notNull(),
    description: text("description"),
    credits: integer("credits").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: text("updated_by"),
  },
  () => [check("course_proposal_credits", sql`credits > 0`)],
);

/**
 * One actor per (proposal, program). **The row is the request**: a program was
 * requested exactly when a review exists for it, so there is no separate
 * requested-programs table (issues/7, issues/32).
 *
 * `approve` copies the body **and** the assignment forward into a new `course`,
 * in one transaction.
 */
export const courseProposalReview = pgTable(
  "course_proposal_review",
  {
    courseProposalReviewId: bigint("course_proposal_review_id", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    courseProposalId: bigint("course_proposal_id", { mode: "number" }).notNull(),
    programCode: text("program_code")
      .notNull()
      .references(() => program.code),

    snapshot: jsonb("snapshot").notNull(),
    status: text("status").generatedAlwaysAs(sql`snapshot->>'value'`),

    // The assignment. Monotone: swap freely, never empty once set. The writer
    // refuses a netid not holding `area_head` in `user_role` (standing
    // principle 6). Plain text — `people` is another project.
    areaHead: text("area_head"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: text("updated_by"),
  },
  (t) => [
    check("course_proposal_review_status", sql`snapshot->>'value' IN (${sql.raw(REVIEW_STATES)})`),
    foreignKey({
      name: "course_proposal_review_proposal_fk",
      columns: [t.courseProposalId],
      foreignColumns: [courseProposal.courseProposalId],
    }),
    unique("course_proposal_review_proposal_program").on(t.courseProposalId, t.programCode),
    unique("course_proposal_review_id_program_code").on(t.courseProposalReviewId, t.programCode),
    index("course_proposal_review_status_idx").on(t.status),
  ],
);

/**
 * The review-level half of the area assignment, copied into `course_area` by
 * `approve`. Derived from issues/25 + issues/32 rather than named by a ticket;
 * see `docs/schema/README.md`.
 *
 * The composite foreign keys make "a review's areas are its own program's" a
 * database rule.
 */
export const courseProposalReviewArea = pgTable(
  "course_proposal_review_area",
  {
    courseProposalReviewId: bigint("course_proposal_review_id", { mode: "number" }).notNull(),
    areaId: bigint("area_id", { mode: "number" }).notNull(),
    programCode: text("program_code").notNull(),
  },
  (t) => [
    primaryKey({
      name: "course_proposal_review_area_pkey",
      columns: [t.courseProposalReviewId, t.areaId],
    }),
    foreignKey({
      name: "course_proposal_review_area_review_fk",
      columns: [t.courseProposalReviewId, t.programCode],
      foreignColumns: [courseProposalReview.courseProposalReviewId, courseProposalReview.programCode],
    }),
    foreignKey({
      name: "course_proposal_review_area_area_fk",
      columns: [t.areaId, t.programCode],
      foreignColumns: [area.areaId, area.programCode],
    }),
  ],
);

// ===========================================================================
// Course
// ===========================================================================

/**
 * A course is minted already `Approved`, by an approving review. It is never
 * proposed here.
 *
 * `program_code` is **immutable**: issues/30 established that a re-home would
 * let a director do by field write what issues/8 forbade them to do by
 * transition. The wrong-program fix is `kill` and re-propose.
 */
export const course = pgTable(
  "course",
  {
    courseId: bigint("course_id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    programCode: text("program_code")
      .notNull()
      .references(() => program.code),

    // Unique within a program, not department-wide. Required from the moment a
    // course is minted — an unnumbered course is one no view can render.
    courseNumber: text("course_number").notNull(),

    title: text("title").notNull(),
    description: text("description"),

    // On the course, not the offering: a course does not run for different
    // credit amounts in different terms.
    credits: integer("credits").notNull(),

    url: text("url"),

    // Counts approved revisions. Derivable from `course_transition` and stored
    // anyway at the requester's direction, because the number is read by people.
    // Bumped on `approve`, not on `revise`.
    edition: integer("edition").notNull().default(1),

    // Copied from the approving review. Nullable: a director may assign before
    // approval, at it, or after. The gate is the Offering create path.
    areaHead: text("area_head"),

    // issues/42. The review whose `approve` minted this course — provenance, not
    // a reference to the body. `NOT NULL` as of issues/49, which ruled that every
    // seeded course is minted through a proposal and an approving review.
    // `UNIQUE`, because a review's `approve` fires once and mints one course.
    mintedFromReviewId: bigint("minted_from_review_id", { mode: "number" }).notNull().unique(),

    snapshot: jsonb("snapshot").notNull(),
    status: text("status").generatedAlwaysAs(sql`snapshot->>'value'`),

    // `created_by` is the approving *actor*, not the director (issues/32
    // amending issues/13).
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: text("updated_by"),
  },
  (t) => [
    check("course_credits", sql`credits > 0`),
    check("course_edition", sql`edition >= 1`),
    check("course_status", sql`snapshot->>'value' IN (${sql.raw(COURSE_STATES)})`),
    foreignKey({
      name: "course_minted_from_review_fk",
      columns: [t.mintedFromReviewId],
      foreignColumns: [courseProposalReview.courseProposalReviewId],
    }),
    unique("course_program_code_course_number").on(t.programCode, t.courseNumber),
    // Redundant against the primary key, and the target of issues/30's composite
    // foreign key from `offering` and of the join tables below.
    unique("course_id_program_code").on(t.courseId, t.programCode),
    index("course_status_idx").on(t.status),
    index("course_program_idx").on(t.programCode),
  ],
);

// ---------------------------------------------------------------------------
// course_area, course_requirement_category — issues/25
// ---------------------------------------------------------------------------
// **The course's own program only.** A mapping row is program P declaring what
// counts toward P's degree. The composite foreign keys make that structural:
// `program_code` is checked against the course on one side and against the area
// or category on the other, so the two must agree.

export const courseArea = pgTable(
  "course_area",
  {
    courseId: bigint("course_id", { mode: "number" }).notNull(),
    areaId: bigint("area_id", { mode: "number" }).notNull(),
    programCode: text("program_code").notNull(),
  },
  (t) => [
    primaryKey({ name: "course_area_pkey", columns: [t.courseId, t.areaId] }),
    foreignKey({
      name: "course_area_course_fk",
      columns: [t.courseId, t.programCode],
      foreignColumns: [course.courseId, course.programCode],
    }),
    foreignKey({
      name: "course_area_area_fk",
      columns: [t.areaId, t.programCode],
      foreignColumns: [area.areaId, area.programCode],
    }),
  ],
);

export const courseRequirementCategory = pgTable(
  "course_requirement_category",
  {
    courseId: bigint("course_id", { mode: "number" }).notNull(),
    requirementCategoryId: bigint("requirement_category_id", { mode: "number" }).notNull(),
    programCode: text("program_code").notNull(),
  },
  (t) => [
    primaryKey({
      name: "course_requirement_category_pkey",
      columns: [t.courseId, t.requirementCategoryId],
    }),
    foreignKey({
      name: "course_requirement_category_course_fk",
      columns: [t.courseId, t.programCode],
      foreignColumns: [course.courseId, course.programCode],
    }),
    foreignKey({
      name: "course_requirement_category_category_fk",
      columns: [t.requirementCategoryId, t.programCode],
      foreignColumns: [requirementCategory.requirementCategoryId, requirementCategory.programCode],
    }),
  ],
);

// ===========================================================================
// Offering
// ===========================================================================

/**
 * One taught class in one term, 1:1 with legacy `section`. Named `offering`
 * throughout; course×term is a query, not an entity.
 *
 * The composite foreign key to `course` is the offering's **only** foreign key
 * to it. It enforces issues/30's rule that an offering's program is always its
 * course's, and `ON UPDATE NO ACTION` does double duty by enforcing
 * `course.program_code`'s immutability rather than assuming it.
 */
export const offering = pgTable(
  "offering",
  {
    offeringId: bigint("offering_id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),

    courseId: bigint("course_id", { mode: "number" }).notNull(),
    programCode: text("program_code").notNull(),
    termCode: char("term_code", { length: 5 })
      .notNull()
      .references(() => term.code),

    // Two sections of one course in one term is real (issues/30), so there is no
    // uniqueness on `(course_id, term_code)` — the section number is what tells
    // them apart, and it is unique within the pair.
    sectionNumber: text("section_number").notNull().default("1"),

    callNumber: text("call_number"),
    sisClassNumber: integer("sis_class_number"),
    url: text("url"),

    // Free text. The domain of this column is not known, and a guessed CHECK
    // would refuse real values — a rule that fires *wrongly* rather than one
    // that never fires.
    mode: text("mode"),

    // A published fact about the class, displayed in the catalog. Nothing
    // enforces it: registration is out of scope.
    enrollmentLimit: integer("enrollment_limit"),

    snapshot: jsonb("snapshot").notNull(),
    status: text("status").generatedAlwaysAs(sql`snapshot->>'value'`),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: text("updated_by"),
  },
  (t) => [
    check("offering_enrollment_limit", sql`enrollment_limit > 0`),
    check("offering_status", sql`snapshot->>'value' IN (${sql.raw(OFFERING_STATES)})`),
    unique("offering_course_term_section").on(t.courseId, t.termCode, t.sectionNumber),
    foreignKey({
      name: "offering_course_fk",
      columns: [t.courseId, t.programCode],
      foreignColumns: [course.courseId, course.programCode],
    })
      .onUpdate("no action")
      .onDelete("no action"),
    index("offering_status_idx").on(t.status),
    index("offering_term_idx").on(t.termCode),
    index("offering_course_idx").on(t.courseId),
  ],
);

/**
 * **Two writers, split at position 0.** Position 0 is the lead, and that
 * position gates `offer` / `accept` / `decline` / `defer`. Everything below it
 * is a co-instructor, written by the ordinary field writer (issues/2,
 * issues/15, issues/19, issues/34, issues/61).
 *
 * **Below 0, `position` is a key and nothing else.** Order carries no meaning:
 * no promotion, no reorder, and gaps are legal. Rows may sit below an empty
 * position 0 — `decline` and `withdraw` DELETE position 0 and leave everything
 * under it — so the read model carries each row's `position` rather than
 * indexing an array, and `leadOf` is whoever holds 0.
 *
 * `netid` is a plain column and **not** a foreign key: `people` is another
 * project. The writer refuses a netid `people` does not know; the read tolerates
 * one it cannot resolve and never drops the row (issues/9).
 */
export const offeringInstructor = pgTable(
  "offering_instructor",
  {
    offeringId: bigint("offering_id", { mode: "number" })
      .notNull()
      .references(() => offering.offeringId),
    position: integer("position").notNull(),
    netid: text("netid").notNull(),

    // issues/13's creation rule applied to a row creation: a field write fires
    // no transition since issues/17, so without these a person named to a paid
    // teaching role is attributable to nobody. Deletion stays untraced.
    grantedBy: text("granted_by").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "offering_instructor_pkey", columns: [t.offeringId, t.position] }),
    check("offering_instructor_position", sql`"position" >= 0`),
    unique("offering_instructor_offering_netid").on(t.offeringId, t.netid),
  ],
);

/**
 * Where the map's LowRes question lands. One row per **slot**, three kinds —
 * `weekly`, `dates`, `async` — with the kind **declared** and the shape CHECK
 * enforcing it, which is issues/30's move of making a convention structural
 * rather than disciplinary (issues/10).
 *
 * Deliberately not one row per concrete session: that shape would need term
 * start and end dates to expand a weekly pattern, and issues/3 deferred those.
 *
 * The room lives here rather than on `offering` — legacy stored it in both
 * places — because a class genuinely can meet in different rooms on different
 * days.
 */
export const offeringMeeting = pgTable(
  "offering_meeting",
  {
    offeringMeetingId: bigint("offering_meeting_id", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    offeringId: bigint("offering_id", { mode: "number" })
      .notNull()
      .references(() => offering.offeringId),

    kind: text("kind").notNull(),

    dayOfWeek: smallint("day_of_week"), // weekly only. 0 = Sunday .. 6 = Saturday
    startDate: date("start_date"), // dates only
    endDate: date("end_date"), // dates only
    startTime: time("start_time"), // weekly and dates
    endTime: time("end_time"), // weekly and dates
    room: text("room"), // weekly and dates

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: text("updated_by"),
  },
  (t) => [
    check("offering_meeting_kind", sql`kind IN ('weekly', 'dates', 'async')`),
    check(
      "offering_meeting_shape",
      sql`CASE kind
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
    END`,
    ),
    check("offering_meeting_day_of_week", sql`day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6`),
    check(
      "offering_meeting_times_ordered",
      sql`start_time IS NULL OR end_time IS NULL OR end_time > start_time`,
    ),
    check(
      "offering_meeting_dates_ordered",
      sql`start_date IS NULL OR end_date IS NULL OR end_date >= start_date`,
    ),
    index("offering_meeting_offering_idx").on(t.offeringId),
  ],
);

// ---------------------------------------------------------------------------
// offering_area, offering_requirement_category — issues/25, issues/30
// ---------------------------------------------------------------------------
// **Seat sharing**, and the *only* place in the whole model where a program
// other than the course's own appears. Written by the director of the
// **category's** program — whoever authors the claim writes the row.
//
// No composite foreign key here, unlike the course-level pair. issues/30 weighed
// the declarative form and rejected it on scale, not principle: the single
// writer refuses a category whose program equals the offering's, down a path
// that already loads both programs to authorize itself.

export const offeringArea = pgTable(
  "offering_area",
  {
    offeringId: bigint("offering_id", { mode: "number" })
      .notNull()
      .references(() => offering.offeringId),
    areaId: bigint("area_id", { mode: "number" })
      .notNull()
      .references(() => area.areaId),

    grantedBy: text("granted_by").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "offering_area_pkey", columns: [t.offeringId, t.areaId] })],
);

export const offeringRequirementCategory = pgTable(
  "offering_requirement_category",
  {
    offeringId: bigint("offering_id", { mode: "number" }).notNull(),
    requirementCategoryId: bigint("requirement_category_id", { mode: "number" }).notNull(),

    grantedBy: text("granted_by").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "offering_requirement_category_pkey",
      columns: [t.offeringId, t.requirementCategoryId],
    }),
    foreignKey({
      name: "offering_requirement_category_offering_fk",
      columns: [t.offeringId],
      foreignColumns: [offering.offeringId],
    }),
    foreignKey({
      name: "offering_requirement_category_category_fk",
      columns: [t.requirementCategoryId],
      foreignColumns: [requirementCategory.requirementCategoryId],
    }),
  ],
);

// ===========================================================================
// Transition logs
// ===========================================================================
// Append-only. One row per lifecycle move, written by `applyTransition` in the
// same transaction as the snapshot (issues/13, issues/28).
//
// **Not a general audit log.** `event`, `from_state` and `to_state` are exactly
// machine values, and that meaning is load-bearing (issues/17, issues/10).
//
// **No genesis row.** `from_state` is NOT NULL: creation is an act but not a
// transition, and it is recorded as `created_at` / `created_by` on the entity
// row.
//
// **No CHECK on `event`.** issues/13 kept the event union a TypeScript fact,
// enforced at the single already-type-safe writer. A database copy would widen
// the migration burden from state changes to event changes.
//
// The three tables share one shape because one generic writer writes all three.

export const offeringTransition = pgTable(
  "offering_transition",
  {
    offeringTransitionId: bigint("offering_transition_id", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    offeringId: bigint("offering_id", { mode: "number" })
      .notNull()
      .references(() => offering.offeringId),

    event: text("event").notNull(),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),

    // Who clicked.
    actorNetid: text("actor_netid").notNull(),

    // Who it was done to. Forced on `decline`, `withdraw`, `staff`, `unstaff`
    // (issues/15) and, since issues/41, on `offer` and `accept` too — the roster
    // answers who the lead is *now*, and a log is read later.
    subjectNetid: text("subject_netid"),

    // Free text, optional. Structured reason codes are out of scope (issues/10).
    reason: text("reason"),

    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("offering_transition_from_state", sql`from_state IN (${sql.raw(OFFERING_STATES)})`),
    check("offering_transition_to_state", sql`to_state IN (${sql.raw(OFFERING_STATES)})`),
    index("offering_transition_offering_idx").on(t.offeringId, t.at),
  ],
);

/**
 * `subject_netid` is present for shape symmetry with the other two logs, since
 * one generic writer writes all three. No Course event currently carries one.
 *
 * This is also where `course.edition` derives from: edition is one plus the
 * number of `approve` rows here.
 */
export const courseTransition = pgTable(
  "course_transition",
  {
    courseTransitionId: bigint("course_transition_id", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    courseId: bigint("course_id", { mode: "number" })
      .notNull()
      .references(() => course.courseId),

    event: text("event").notNull(),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),
    actorNetid: text("actor_netid").notNull(),
    subjectNetid: text("subject_netid"),
    reason: text("reason"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("course_transition_from_state", sql`from_state IN (${sql.raw(COURSE_STATES)})`),
    check("course_transition_to_state", sql`to_state IN (${sql.raw(COURSE_STATES)})`),
    index("course_transition_course_idx").on(t.courseId, t.at),
  ],
);

/**
 * The second table in this schema no ticket names. issues/6 predates issues/7's
 * split, so it specified two logs for what were then two machines; the review is
 * a third machine. Without it, `applyTransition` needs a branch for a machine
 * with no log, and a rejection would be recorded nowhere.
 */
export const courseProposalReviewTransition = pgTable(
  "course_proposal_review_transition",
  {
    courseProposalReviewTransitionId: bigint("course_proposal_review_transition_id", {
      mode: "number",
    })
      // Named, for the same 63-character reason the foreign keys above are: the
      // sequence name Drizzle derives from this table and column is 74.
      .generatedAlwaysAsIdentity({ name: "course_proposal_review_transition_id_seq" })
      .primaryKey(),
    courseProposalReviewId: bigint("course_proposal_review_id", { mode: "number" }).notNull(),

    event: text("event").notNull(),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),
    actorNetid: text("actor_netid").notNull(),
    subjectNetid: text("subject_netid"),
    reason: text("reason"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "course_proposal_review_transition_from_state",
      sql`from_state IN (${sql.raw(REVIEW_STATES)})`,
    ),
    check(
      "course_proposal_review_transition_to_state",
      sql`to_state IN (${sql.raw(REVIEW_STATES)})`,
    ),
    foreignKey({
      name: "course_proposal_review_transition_review_fk",
      columns: [t.courseProposalReviewId],
      foreignColumns: [courseProposalReview.courseProposalReviewId],
    }),
    index("course_proposal_review_transition_review_idx").on(t.courseProposalReviewId, t.at),
  ],
);
