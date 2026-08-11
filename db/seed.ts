/**
 * **The seed: the department's fixture world, driven through the machines.**
 *
 * Every course here was minted by approving a review, every offering walked its
 * own history event by event, and the transition log ships populated because this
 * script drove it rather than inserting it at rest (issues/13, issues/78).
 * `db/fixtures.ts` holds the world; this file walks `SEED_ORDER`'s eleven steps
 * over it.
 *
 * **The seed is checked like any other caller** (issues/28). One write in the
 * whole run is unchecked — the genesis `chair` grant, which has to come from
 * somewhere — and everything else goes through the same four paths a screen
 * would use. That is what makes a passing seed a **satisfiability proof** of a
 * permission matrix this map amended six times: if no legal actor exists for some
 * act the world needs, the seed cannot run, and that is a much louder failure
 * than a matrix nobody ever tried to use.
 *
 * Two categories of write have **no in-app author** and therefore no path to go
 * through. `SEED_ORDER` names them as its first two steps and issues/34 is where
 * they were settled:
 *
 *   * **reference data** — `program`, `term`, `area`, `requirement_category`, and
 *     the `area` rename that issues/49 filed under *rendered, never minted*.
 *     Reference-data maintenance is a screen the skeleton does not contain.
 *   * **`person` rows**, in the `people` project. Nothing in the skeleton writes
 *     a person: rows arrive from the seed here and from an NYU feed in a real
 *     deployment (`docs/schema/people.sql`).
 *
 * A third joins them under protest, and it is a **finding rather than a
 * category**: `course_requirement_category` is claimed by no field class, so
 * under issues/28's *a column with no class is unwritable* it has no writer at
 * all — while issues/25 put the course→category mapping in scope because the
 * Catalog displays it. Raised as a ticket rather than closed here; see
 * `courseCategories` below.
 *
 * **Dates are literal** (issues/49). Nothing below is computed from run time: the
 * world sits on `WORLD_DATE`, 20 October 2026, and every timestamp is the
 * fixture's own, handed to the writer as its `at` argument.
 *
 * Destructive and stupid about it: run it against a development database only.
 * It refuses a database that already holds rows — `npm run db:reset` is the
 * recovery path, and it is the only one (issues/9, issues/13).
 */
import { config } from "dotenv";

// `.env.local` is where `.env.example` says the four connection strings live.
// Loaded before anything reaches for a handle, which `db/handles.ts` opens
// lazily on first use.
config({ path: [".env.local", ".env"], quiet: true });

import { and, eq, sql } from "drizzle-orm";

import {
  area,
  course,
  courseProposalReview,
  courseProposalReviewTransition,
  courseRequirementCategory,
  offering,
  offeringInstructor,
  program,
  requirementCategory,
  term,
  userRole,
} from "@/db/classes/schema";
import {
  AREAS,
  COUNTS,
  COURSES,
  C17_DIVERGENCE,
  FIELD_EDITS,
  NETID_WITH_NO_PERSON_ROW,
  O9_ENROLLMENT_LIMIT_BEFORE_THE_EDIT,
  OFFERINGS,
  P1_BODY_AFTER_THE_EDIT,
  PEOPLE,
  PROGRAM_DIRECTORS,
  PROGRAMS,
  PROPOSAL_DESCRIPTIONS,
  PROPOSALS,
  REFERENCE_DATA_AUTHOR,
  REQUIREMENT_CATEGORIES,
  ROLE_GRANTS,
  SEED_ONLY,
  SEED_ORDER,
  STATE_COVERAGE,
  TERMS,
  type AreaKey,
  type CategoryKey,
  type CourseKey,
  type CourseRow,
  type FixtureNetid,
  type OfferingKey,
  type OfferingRow,
  type OfferingStep,
  type PersonRow,
  type ProposalRow,
  type ReviewKey,
  type RoleGrantRow,
} from "@/db/fixtures";
import { classesDb, peopleDb } from "@/db/handles";
import { person } from "@/db/people/schema";
import { applyTransition, type OfferingEvent } from "@/db/write/apply-transition";
import { createOffering } from "@/db/write/create-offering";
import { createProposal } from "@/db/write/create-proposal";
import { writeToClasses, type Id } from "@/db/write/transaction";
import { writeFields, type FieldRowWrite } from "@/db/write/write-fields";

// ---------------------------------------------------------------------------
// Keys resolved to ids
// ---------------------------------------------------------------------------
// Keys are issues/49's labels and not columns: every id in the schema is
// `bigint GENERATED ALWAYS AS IDENTITY`, so the seed resolves a key to an id as
// it inserts.

const areaIds = new Map<AreaKey, Id>();
const categoryIds = new Map<CategoryKey, Id>();
const reviewIds = new Map<ReviewKey, Id>();
const courseIds = new Map<CourseKey, Id>();
const offeringIds = new Map<OfferingKey, Id>();

function idOf<K>(map: Map<K, Id>, key: K, what: string): Id {
  const id = map.get(key);
  if (id === undefined) throw new Error(`The seed has no ${what} for ${String(key)} yet.`);
  return id;
}

// The arrays are `as const`, so a member with an optional property widens the
// element type into a union and reading that property off it is an error. Read
// through the row types the fixtures export instead.
const PEOPLE_ROWS: readonly PersonRow[] = PEOPLE;
const ROLE_GRANT_ROWS: readonly RoleGrantRow[] = ROLE_GRANTS;
const PROPOSAL_ROWS: readonly ProposalRow[] = PROPOSALS;
const COURSE_ROWS: readonly CourseRow[] = COURSES;
const OFFERING_ROWS: readonly OfferingRow[] = OFFERINGS;

/** The world's first moment: the genesis grant's, which is where authority starts. */
const WORLD_BEGINS = new Date(ROLE_GRANT_ROWS[0]!.grantedAt);

/** A fixture timestamp as the moment a write happened. Never `Date.now()`. */
const instant = (timestamp: string): Date => new Date(timestamp);

function assert(held: boolean, what: string): asserts held {
  if (!held) throw new Error(`The seed's world is wrong: ${what}`);
}

/**
 * issues/40's seven field edits, each claimed at the moment the seed writes it —
 * **the lookup records as well as finds**, so `checkTheWorld` can assert that all
 * seven were written and not merely that seven exist. They are claimed at three
 * different sites, because two of them cannot be written in step 11: see
 * `fieldEdits`.
 */
const written = new Set<string>();

function claimFieldEdit(table: string, record: string) {
  const found = FIELD_EDITS.find((edit) => edit.table === table && edit.record === record);
  if (!found) throw new Error(`No field edit on ${table} ${record}.`);
  written.add(`${table}:${record}`);
  return found;
}

// ---------------------------------------------------------------------------
// Step 1 — reference data
// ---------------------------------------------------------------------------

/**
 * `program`, `term`, `area`, `requirement_category`. **No in-app author**
 * (issues/49's step 1), and three of the four carry `created_by NOT NULL`, so
 * the seed writes the chair's netid — see `REFERENCE_DATA_AUTHOR`. `term` has no
 * provenance columns at all and needs nothing.
 *
 * The fixtures date none of these, so they are dated to the world's first moment
 * rather than to run time: a reference row created *after* the courses that
 * point at it would be the one place in the seed reading as computed.
 */
async function referenceData(): Promise<void> {
  const classes = classesDb();

  await classes.insert(program).values(
    PROGRAMS.map((row) => ({
      code: row.code,
      name: row.name,
      degreeLevel: row.degreeLevel,
      createdBy: REFERENCE_DATA_AUTHOR,
      createdAt: WORLD_BEGINS,
    })),
  );

  await classes.insert(term).values(
    TERMS.map((row) => ({
      code: row.code,
      year: row.year,
      semester: row.semester,
      sisTermCode: row.sisTermCode,
    })),
  );

  const areas = await classes
    .insert(area)
    .values(
      AREAS.map((row) => ({
        programCode: row.programCode,
        name: row.name,
        createdBy: row.createdBy,
        createdAt: WORLD_BEGINS,
      })),
    )
    .returning({ areaId: area.areaId, programCode: area.programCode, name: area.name });

  for (const row of AREAS) {
    const found = areas.find((made) => made.programCode === row.programCode && made.name === row.name);
    assert(found !== undefined, `area ${row.key} was not written`);
    areaIds.set(row.key, found.areaId);
  }

  const categories = await classes
    .insert(requirementCategory)
    .values(
      REQUIREMENT_CATEGORIES.map((row) => ({
        programCode: row.programCode,
        name: row.name,
        credits: row.credits,
        groupNo: row.groupNo,
        createdBy: row.createdBy,
        createdAt: WORLD_BEGINS,
      })),
    )
    .returning({
      requirementCategoryId: requirementCategory.requirementCategoryId,
      programCode: requirementCategory.programCode,
      name: requirementCategory.name,
    });

  for (const row of REQUIREMENT_CATEGORIES) {
    const found = categories.find(
      (made) => made.programCode === row.programCode && made.name === row.name,
    );
    assert(found !== undefined, `requirement category ${row.key} was not written`);
    categoryIds.set(row.key, found.requirementCategoryId);
  }
}

// ---------------------------------------------------------------------------
// Step 2 — the `person` rows, in the other project
// ---------------------------------------------------------------------------

/**
 * Thirteen rows, and a fourteenth netid with none — `xq7742`, who holds two
 * roles and appears on no roster anywhere, because nothing may put them on one
 * (issues/69).
 *
 * `person` has no `created_by` / `updated_by` at all (issues/10): both name an
 * actor and nothing in the skeleton writes a person. `by6640`'s preferred first
 * name and its `updated_at` are the `person` field edit — **the feed, not a
 * field write** — so they are written here rather than in step 11.
 */
async function personRows(): Promise<void> {
  claimFieldEdit("person", "by6640");

  await peopleDb()
    .insert(person)
    .values(
      PEOPLE_ROWS.map((row) => ({
        netid: row.netid,
        universityId: row.universityId,
        officialFirstname: row.officialFirstname,
        officialLastname: row.officialLastname,
        preferredFirstname: row.preferredFirstname ?? null,
        preferredLastname: row.preferredLastname ?? null,
        pronouns: row.pronouns ?? null,
        createdAt: WORLD_BEGINS,
        updatedAt: row.updatedAt ? instant(row.updatedAt) : null,
      })),
    );
}

// ---------------------------------------------------------------------------
// Steps 3, 4 and 5 — authorization
// ---------------------------------------------------------------------------

/**
 * **The one unchecked write in the run** (issues/34). The chair writes
 * `user_role` and nobody else does, so the first `chair` row cannot be granted
 * by a checked path — there is no authority to check it against yet. Every row
 * after this one goes through `writeFields`.
 */
async function genesisGrant(): Promise<void> {
  const genesis = ROLE_GRANT_ROWS[0]!;
  assert(!genesis.checked, "the first role grant is the unchecked one");
  assert(genesis.role === "chair", "the unchecked grant is the `chair` row");
  assert(
    ROLE_GRANT_ROWS.filter((row) => !row.checked).length === 1,
    "exactly one grant in the fixtures is unchecked",
  );

  await classesDb().insert(userRole).values({
    netid: genesis.netid,
    role: genesis.role,
    grantedBy: genesis.grantedBy,
    grantedAt: instant(genesis.grantedAt),
  });
}

/**
 * The remaining twenty grants, each through the checked writer acting as the
 * chair. One call per row rather than one call for all of them: the moment is a
 * property of the write, and these grants span eight years.
 *
 * **Twenty, where `SEED_ORDER`'s step 4 says nineteen.** The artifact's own table
 * is what the seed walks, and `docs/fixtures/README.md` resolves
 * prose-against-table *for the table* four times over — issues/69's `area_head`
 * grant to `xq7742` is the twentieth and postdates that sentence. `COUNTS` agrees
 * with the table at 21 rows, one of them the genesis grant.
 */
async function roleGrants(): Promise<void> {
  for (const grant of ROLE_GRANT_ROWS.slice(1)) {
    assert(grant.checked, `${grant.netid}'s ${grant.role} grant is checked`);
    await writeToClasses((tx) =>
      writeFields(
        tx,
        {
          record: { authorization: true },
          rows: [{ table: "user_role", op: "insert", values: { netid: grant.netid, role: grant.role } }],
        },
        grant.grantedBy,
        instant(grant.grantedAt),
      ),
    );
  }
}

/**
 * The three `program_director` rows. Appointing a director is **two writes**, the
 * role then this row, and the second refuses a netid without the first (standing
 * principle 6) — which is why they are separate steps rather than one.
 */
async function programDirectors(): Promise<void> {
  for (const row of PROGRAM_DIRECTORS) {
    await writeToClasses((tx) =>
      writeFields(
        tx,
        {
          record: { authorization: true },
          rows: [
            {
              table: "program_director",
              op: "insert",
              values: { program_code: row.programCode, netid: row.netid },
            },
          ],
        },
        row.grantedBy,
        instant(row.grantedAt),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Step 6 — proposals, their reviews, and the assignment onto each review
// ---------------------------------------------------------------------------

/**
 * `createProposal` writes the body and **one review per requested program** in
 * one transaction — a review row *is* the request, so there is no
 * requested-programs table (issues/7, issues/43).
 *
 * The area and the head are assigned **onto the review** afterwards, by that
 * program's director, because issues/25 made `area` program-scoped and a
 * program-scoped assignment cannot sit on a body shared across programs
 * (issues/32). They are written at the proposal's own moment — assignment at
 * intake — except on R4, where issues/40 made the head a dated field edit of its
 * own and step 11 writes it.
 */
const HEAD_ASSIGNED_AS_ITS_OWN_FIELD_EDIT: ReviewKey = "R4";

async function proposalsAndReviews(): Promise<void> {
  for (const proposal of PROPOSAL_ROWS) {
    const created = await writeToClasses((tx) =>
      createProposal(
        tx,
        {
          title: proposal.title,
          description: PROPOSAL_DESCRIPTIONS[proposal.key],
          credits: proposal.credits,
          programs: proposal.reviews.map((review) => review.programCode),
        },
        proposal.createdBy,
        instant(proposal.createdAt),
      ),
    );

    // `createProposal` returns its review ids in the order of the programs it
    // was handed, which is the order they are written in here.
    proposal.reviews.forEach((review, index) => {
      reviewIds.set(review.key, created.reviewIds[index]!);
    });

    for (const review of proposal.reviews) {
      const director = directorOf(review.programCode);
      const head = review.key === HEAD_ASSIGNED_AS_ITS_OWN_FIELD_EDIT ? null : review.areaHead;
      const rows: FieldRowWrite[] = review.areas.map((key) => ({
        table: "course_proposal_review_area",
        op: "insert",
        values: { area_id: idOf(areaIds, key, "area") },
      }));
      if (head === null && rows.length === 0) continue;

      await writeToClasses((tx) =>
        writeFields(
          tx,
          {
            record: { machine: "course_proposal_review", id: idOf(reviewIds, review.key, "review") },
            columns: head === null ? {} : { "course_proposal_review.area_head": head },
            rows,
          },
          director,
          instant(proposal.createdAt),
        ),
      );
    }
  }
}

/** The sitting director of a program, which is who a review's assignment is written by. */
function directorOf(programCode: string): FixtureNetid {
  const found = PROGRAM_DIRECTORS.find((row) => row.programCode === programCode);
  if (!found) throw new Error(`No director for ${programCode}.`);
  return found.netid;
}

// ---------------------------------------------------------------------------
// Step 7 — review transitions, and the mints they carry
// ---------------------------------------------------------------------------

/**
 * Each review's history, event by event. **`approve` is the seam**: one
 * transaction moves the review and mints a `course` in that program's catalog,
 * copying the body and the area assignment forward (issues/7, issues/32). The
 * course number rides on the event, because each approving program mints its own
 * and the proposal deliberately has none.
 *
 * `endState` is asserted after the history is driven and stored nowhere.
 */
async function reviewTransitions(): Promise<void> {
  const classes = classesDb();

  for (const proposal of PROPOSAL_ROWS) {
    for (const review of proposal.reviews) {
      const id = idOf(reviewIds, review.key, "review");
      const mints = COURSE_ROWS.find((row) => row.key === review.mints);

      for (const step of review.history) {
        if (step.event === "approve") {
          assert(mints !== undefined, `${review.key}'s approve mints a course`);
        }

        await writeToClasses((tx) =>
          applyTransition(
            tx,
            { machine: "course_proposal_review", id },
            step.event === "approve"
              ? { type: "approve", courseNumber: mints!.courseNumber, reason: step.reason }
              : { type: step.event, reason: step.reason },
            step.actor,
            instant(step.at),
          ),
        );
      }

      const [landed] = await classes
        .select({ status: courseProposalReview.status })
        .from(courseProposalReview)
        .where(eq(courseProposalReview.courseProposalReviewId, id));
      assert(landed?.status === review.endState, `${review.key} is ${review.endState}`);

      if (review.mints) {
        const [made] = await classes
          .select({ courseId: course.courseId })
          .from(course)
          .where(eq(course.mintedFromReviewId, id));
        assert(made !== undefined, `${review.key} minted ${review.mints}`);
        courseIds.set(review.mints, made.courseId);
      }
    }
  }

  // Not a twelfth step. The course→category rows have no writer to be a step of,
  // and they hang here because a mint is the earliest moment their course exists.
  await courseCategories();
}

/**
 * **The one write the field-class map has no writer for.**
 *
 * issues/25 put the course→category mapping in scope because the Catalog
 * displays it, and every course in the fixtures carries one. No field class in
 * `lib/permissions.ts` claims `course_requirement_category` — `course_area` sits
 * in Course assignment and this table sits in nothing — so under issues/28's *a
 * column with no class is unwritable* the field writer refuses it, and the mint
 * copies areas only.
 *
 * That is a hole in the permission model rather than a decision for a build
 * effort to take, which is issues/50's rule and issues/65's and issues/69's
 * precedent: **a build effort that finds itself deciding has found a ticket**.
 * Filed as https://github.com/nopivnick/lineup-prototype-03/issues/106. Until it
 * is settled the rows are written here, beside the reference data and for the
 * same reason — no control in the skeleton performs this write.
 */
async function courseCategories(): Promise<void> {
  const rows = COURSE_ROWS.flatMap((row) =>
    row.categories.map((key) => ({
      courseId: idOf(courseIds, row.key, "course"),
      requirementCategoryId: idOf(categoryIds, key, "requirement category"),
      programCode: row.programCode,
    })),
  );
  await classesDb().insert(courseRequirementCategory).values(rows);
}

// ---------------------------------------------------------------------------
// Step 8 — the courses' own revise / approve cycles, and the one retire
// ---------------------------------------------------------------------------

/**
 * `revise` re-opens an approval and `approve` restores it and **bumps the
 * edition** — the only thing that does (issues/10). `retire` is director-only and
 * carries the machine's one guard, over live offerings (issues/8, issues/14);
 * C3's held vacuously, having no offerings at all.
 *
 * Two body edits are **interleaved into the histories rather than left to step
 * 11**, and the interleaving is forced rather than tidy: the Course body class's
 * state gate is an invariant, so a body write outside a `Revising` window is
 * *refused* and not merely irregular (issues/8, issues/28). C1's description
 * rewrite of 20 June 2023 sits inside its second window, and C17's divergence
 * sits inside its only one.
 *
 * `edition` and `endState` are asserted afterwards and stored nowhere — edition
 * is one plus the number of `approve` rows, and the seed lets `applyTransition`
 * bump it rather than writing the number.
 */
async function courseCycles(): Promise<void> {
  const classes = classesDb();
  const bodyEdits = courseBodyEdits();

  for (const row of COURSE_ROWS) {
    const id = idOf(courseIds, row.key, "course");

    type Move = { at: string; run: () => Promise<void> };
    const moves: Move[] = row.history.map((step) => ({
      at: step.at,
      run: () =>
        writeToClasses((tx) =>
          applyTransition(
            tx,
            { machine: "course", id },
            { type: step.event, reason: step.reason },
            step.actor,
            instant(step.at),
          ),
        ),
    }));

    for (const edit of bodyEdits.filter((entry) => entry.course === row.key)) {
      moves.push({
        at: edit.at,
        run: () =>
          writeToClasses((tx) =>
            writeFields(
              tx,
              { record: { machine: "course", id }, columns: edit.columns(row) },
              edit.by,
              instant(edit.at),
            ),
          ),
      });
    }

    moves.sort((left, right) => left.at.localeCompare(right.at));
    for (const move of moves) await move.run();

    const [landed] = await classes
      .select({ status: course.status, edition: course.edition })
      .from(course)
      .where(eq(course.courseId, id));
    assert(landed?.status === row.endState, `${row.key} is ${row.endState}`);
    assert(landed.edition === row.edition, `${row.key} is at edition ${row.edition}`);
  }
}

/**
 * The two writes to a course body, and the only two field writes in the seed
 * that cannot be written in step 11. Each states the text it lands on as the
 * course's own final value, because the *earlier* text is what the proposal
 * carried and the mint copied forward — so neither is stated twice.
 */
function courseBodyEdits(): readonly {
  course: CourseKey;
  at: string;
  by: FixtureNetid;
  columns: (row: CourseRow) => Record<string, unknown>;
}[] {
  const rewrite = claimFieldEdit("course", "C1");
  return [
    {
      course: "C1",
      at: rewrite.at,
      by: rewrite.by!,
      columns: (row) => ({ "course.description": row.description }),
    },
    {
      // Not one of issues/40's seven. C13 and C17 are minted from one body and
      // C17 is then revised into a different title and description — the only
      // place in the seed where issues/7's copy-rather-than-link semantics
      // actually diverge rather than merely being permitted to.
      course: "C17",
      at: C17_DIVERGENCE.at,
      by: C17_DIVERGENCE.writtenBy,
      columns: (row) => ({ "course.title": row.title, "course.description": row.description }),
    },
  ];
}

// ---------------------------------------------------------------------------
// Step 9 — the classes, created and then driven event by event
// ---------------------------------------------------------------------------

/**
 * `createOffering` derives `program_code` from the course inside the transaction
 * — it never appears in a create signature, here included (issues/30) — and
 * meetings are part of slating, so the asynchronous class and the unscheduled one
 * are distinguishable at the moment of creation (issues/43).
 *
 * Two of O9's operational fields are written **as they were before** issues/40's
 * field edits raised them, because step 11 is where those edits happen: the
 * enrolment limit, and the second weekly slot in a second room.
 *
 * Roster rows **below position 0** are ordinary field writes by the offering's
 * own program director (issues/61), written after the history because they are
 * state-blind in every state and their own `granted_at` is what dates them.
 * Position 0 is not a field at all: it is written by `staff`, inside
 * `applyTransition`.
 */
async function offerings(): Promise<void> {
  const classes = classesDb();

  for (const row of OFFERING_ROWS) {
    const created = await writeToClasses((tx) =>
      createOffering(
        tx,
        {
          courseId: idOf(courseIds, row.course, "course"),
          termCode: row.termCode,
          sectionNumber: row.sectionNumber,
          // O9's second slot arrives in step 11, as the `offering_meeting` field
          // edit, so it is not part of what is slated.
          meetings: row.key === "O9" ? row.meetings.slice(0, 1) : row.meetings,
          mode: row.mode,
          enrollmentLimit:
            row.key === "O9" ? O9_ENROLLMENT_LIMIT_BEFORE_THE_EDIT : row.enrollmentLimit,
          callNumber: row.callNumber,
          sisClassNumber: row.sisClassNumber,
          url: row.url ?? null,
        },
        row.createdBy,
        instant(row.createdAt),
      ),
    );
    offeringIds.set(row.key, created.offeringId);

    for (const step of row.history) {
      await writeToClasses((tx) =>
        applyTransition(
          tx,
          { machine: "offering", id: created.offeringId },
          offeringEvent(step),
          step.actor,
          instant(step.at),
        ),
      );
    }

    for (const seat of row.roster) {
      if (seat.position === 0) continue;
      await writeToClasses((tx) =>
        writeFields(
          tx,
          {
            record: { machine: "offering", id: created.offeringId },
            rows: [
              {
                table: "offering_instructor",
                op: "insert",
                values: { position: seat.position, netid: seat.netid },
              },
            ],
          },
          seat.grantedBy,
          instant(seat.grantedAt),
        ),
      );
    }

    const [landed] = await classes
      .select({ status: offering.status })
      .from(offering)
      .where(eq(offering.offeringId, created.offeringId));
    assert(landed?.status === row.endState, `${row.key} is ${row.endState}`);

    const seated = await classes
      .select({ position: offeringInstructor.position, netid: offeringInstructor.netid })
      .from(offeringInstructor)
      .where(eq(offeringInstructor.offeringId, created.offeringId));
    assert(
      seated.length === row.roster.length,
      `${row.key} holds ${row.roster.length} roster ${row.roster.length === 1 ? "row" : "rows"}`,
    );
    for (const seat of row.roster) {
      assert(
        seated.some((held) => held.position === seat.position && held.netid === seat.netid),
        `${row.key} seats ${seat.netid} at position ${seat.position}`,
      );
    }
  }
}

/**
 * `staff` carries the netid being seated, which is also the log row's
 * `subject_netid`; every other subject the writer reads off the roster itself.
 */
function offeringEvent(step: OfferingStep): OfferingEvent {
  if (step.event === "staff") {
    if (!step.subject) throw new Error("A `staff` step names nobody.");
    return { type: "staff", netid: step.subject, reason: step.reason };
  }
  return { type: step.event, reason: step.reason };
}

// ---------------------------------------------------------------------------
// Step 10 — seat sharing
// ---------------------------------------------------------------------------

/**
 * **The only place in the model where a program other than the course's own
 * appears** (issues/25, made sole by issues/30). The scope comes from the tag
 * rather than from the class: whoever authors the claim writes the row, so IMA's
 * director writes IMA's area onto an ITP section and ITP's writes ITP's onto a
 * LowRes one.
 */
async function seatSharing(): Promise<void> {
  for (const row of OFFERING_ROWS) {
    for (const tag of row.seatSharing ?? []) {
      const write: FieldRowWrite =
        tag.kind === "area"
          ? {
              table: "offering_area",
              op: "insert",
              values: { area_id: idOf(areaIds, tag.key as AreaKey, "area") },
            }
          : {
              table: "offering_requirement_category",
              op: "insert",
              values: {
                requirement_category_id: idOf(categoryIds, tag.key as CategoryKey, "category"),
              },
            };

      await writeToClasses((tx) =>
        writeFields(
          tx,
          { record: { machine: "offering", id: idOf(offeringIds, row.key, "class") }, rows: [write] },
          tag.grantedBy,
          instant(tag.grantedAt),
        ),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Step 11 — the field edits that leave `updated_at` / `updated_by` behind
// ---------------------------------------------------------------------------

/**
 * Four of issues/40's seven are written here. The other three are written where
 * the rules put them rather than where the step list does, and each is recorded
 * at its own site: the `person` edit is the feed and lands in step 2, C1's
 * description rewrite has to sit inside a `Revising` window and lands in step 8,
 * and R4's head is assigned in step 6's shape by step 6's writer.
 *
 * The `area` rename is the odd one and issues/49 knew it: `area.name` sits in no
 * field class, so under issues/28 no control in the skeleton can perform it. It
 * is seeded anyway on that ticket's own *rendered, never minted* precedent, as a
 * reference-data write with no in-app author — which is what it is.
 */
async function fieldEdits(): Promise<void> {
  const limit = claimFieldEdit("offering", "O9");
  const meetings = claimFieldEdit("offering_meeting", "O9");
  const o9 = OFFERING_ROWS.find((row) => row.key === "O9")!;

  // One record, one moment, one Save: both edits are Offering operational and
  // the edit page is one page (issues/62).
  assert(limit.at === meetings.at && limit.by === meetings.by, "O9's two edits are one write");
  await writeToClasses((tx) =>
    writeFields(
      tx,
      {
        record: { machine: "offering", id: idOf(offeringIds, "O9", "class") },
        columns: { "offering.enrollment_limit": o9.enrollmentLimit },
        rows: [{ table: "offering_meeting", op: "insert", values: meetingColumns(o9.meetings[1]!) }],
      },
      limit.by!,
      instant(limit.at),
    ),
  );

  // The proposal body, edited thirteen days after ITP minted C6 from it. Legal by
  // the `created_by` arm under the actorless floor *at least one review is
  // `Developing`* — IMA's has been since 14 February — and the mint **copies**,
  // so this changes the proposal and not the course (issues/7, issues/65).
  const p1 = claimFieldEdit("course_proposal", "P1");
  await writeToClasses((tx) =>
    writeFields(
      tx,
      {
        record: { machine: "course_proposal_review", id: idOf(reviewIds, "R2", "review") },
        columns: { "course_proposal.description": P1_BODY_AFTER_THE_EDIT },
      },
      p1.by!,
      instant(p1.at),
    ),
  );

  // A head assigned after the row was created and before any verdict — issues/32's
  // point that a director may assign before approval, at it, or after.
  const r4 = claimFieldEdit("course_proposal_review", "R4");
  const r4Head = PROPOSAL_ROWS.flatMap((row) => row.reviews).find((row) => row.key === "R4")!;
  await writeToClasses((tx) =>
    writeFields(
      tx,
      {
        record: { machine: "course_proposal_review", id: idOf(reviewIds, "R4", "review") },
        columns: { "course_proposal_review.area_head": r4Head.areaHead },
      },
      r4.by!,
      instant(r4.at),
    ),
  );

  // Reference data, and the whole of `SEED_ONLY`'s second entry.
  const rename = claimFieldEdit("area", "A2");
  const a2 = AREAS.find((row) => row.key === "A2")!;
  await classesDb()
    .update(area)
    .set({ name: a2.name, updatedAt: instant(rename.at), updatedBy: rename.by })
    .where(eq(area.areaId, idOf(areaIds, "A2", "area")));
}

/** The fixture's meeting rows as the field writer's column names spell them. */
function meetingColumns(meeting: OfferingRow["meetings"][number]): Record<string, unknown> {
  switch (meeting.kind) {
    case "weekly":
      return {
        kind: "weekly",
        day_of_week: meeting.dayOfWeek,
        start_time: meeting.startTime,
        end_time: meeting.endTime,
        room: meeting.room,
      };
    case "dates":
      return {
        kind: "dates",
        start_date: meeting.startDate,
        end_date: meeting.endDate,
        start_time: meeting.startTime,
        end_time: meeting.endTime,
        room: meeting.room,
      };
    case "async":
      return { kind: "async" };
  }
}

// ---------------------------------------------------------------------------
// What the seed asserts once the world stands
// ---------------------------------------------------------------------------

/**
 * The counts, the state partition and the two invariants the fixtures exist to
 * render. `COUNTS` is derived by enumerating the artifact rather than restated
 * from issues/49, and the offering total landing on exactly 164 is a **check
 * rather than a coincidence**: it only comes out if every history walks the edges
 * the machine actually has.
 */
async function checkTheWorld(): Promise<void> {
  const classes = classesDb();
  const people = peopleDb();

  const [personRowCount] = await people.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM person`,
  );
  assert(Number(personRowCount!.n) === COUNTS.people, `${COUNTS.people} person rows`);

  const totals = await classes.execute<{ what: string; n: number }>(sql`
    SELECT 'roleGrants' AS what, count(*)::int AS n FROM user_role
    UNION ALL SELECT 'programDirectorRows', count(*)::int FROM program_director
    UNION ALL SELECT 'proposals', count(*)::int FROM course_proposal
    UNION ALL SELECT 'reviews', count(*)::int FROM course_proposal_review
    UNION ALL SELECT 'courses', count(*)::int FROM course
    UNION ALL SELECT 'offerings', count(*)::int FROM offering
    UNION ALL SELECT 'offeringTransitions', count(*)::int FROM offering_transition
    UNION ALL SELECT 'courseTransitions', count(*)::int FROM course_transition
    UNION ALL SELECT 'reviewTransitions', count(*)::int FROM course_proposal_review_transition
  `);
  for (const row of totals) {
    const expected = COUNTS[row.what as keyof typeof COUNTS];
    assert(Number(row.n) === expected, `${expected} ${row.what} (found ${row.n})`);
  }

  // All fourteen Offering states occupied, each by exactly the classes the
  // artifact names — which is what the three-term, twenty-eight-class sizing was
  // bought for, and it only holds if driving every history through the machine
  // produces this partition.
  for (const [state, keys] of Object.entries(STATE_COVERAGE)) {
    const held = await classes
      .select({ offeringId: offering.offeringId })
      .from(offering)
      .where(eq(offering.status, state));
    const expected = new Set(keys.map((key) => idOf(offeringIds, key, "class")));
    assert(
      held.length === expected.size && held.every((row) => expected.has(row.offeringId)),
      `${state} holds exactly ${keys.join(", ")}`,
    );
  }

  // **Rendered, never minted** — `SEED_ONLY`'s three, each checked in the shape
  // it takes, and none of them a signal to add a control (issues/49, issues/69).
  assert(SEED_ONLY.length === 3, "three seed-only fixtures");

  // 1. A person holding `program_director` who directs no program. The roles
  //    page appoints as one control writing both rows and nothing un-appoints
  //    one, so this state is seedable and not reachable at runtime.
  const vera = await classes
    .select({ role: userRole.role })
    .from(userRole)
    .where(and(eq(userRole.netid, "vm7781"), eq(userRole.role, "program_director")));
  assert(vera.length === 1, "vm7781 holds program_director");
  const veraDirects = await classes.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM program_director WHERE netid = 'vm7781'`,
  );
  assert(Number(veraDirects[0]!.n) === 0, "vm7781 directs no program");

  // 2. ITP's *Networks* rename, which `area.name` sitting in no field class
  //    makes unwritable by any control in the skeleton.
  const [renamed] = await classes
    .select({ name: area.name, updatedBy: area.updatedBy })
    .from(area)
    .where(eq(area.areaId, idOf(areaIds, "A2", "area")));
  assert(renamed?.name === "Networks" && renamed.updatedBy === "pr3390", "A2 was renamed");

  // 3. *A program with no director* is seeded by **not** being there:
  //    issues/49 ruled the LowRes conflict in favour of a full complement, so
  //    issues/38's empty state is unreachable rather than overlooked.
  const directorless = await classes.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM program
    WHERE NOT EXISTS (SELECT 1 FROM program_director WHERE program_code = program.code)
  `);
  assert(Number(directorless[0]!.n) === 0, "every program has a sitting director");

  // **The invariant biting**: a netid holding `instructor` who appears on no
  // roster anywhere, because a roster write refuses a netid `people` does not
  // know and the `user_role` writer never consults `people` (issues/9,
  // issues/69).
  const ghostRoles = await classes
    .select({ role: userRole.role })
    .from(userRole)
    .where(eq(userRole.netid, NETID_WITH_NO_PERSON_ROW));
  assert(ghostRoles.some((row) => row.role === "instructor"), `${NETID_WITH_NO_PERSON_ROW} holds instructor`);
  const ghostSeats = await classes
    .select({ offeringId: offeringInstructor.offeringId })
    .from(offeringInstructor)
    .where(eq(offeringInstructor.netid, NETID_WITH_NO_PERSON_ROW));
  assert(ghostSeats.length === 0, `${NETID_WITH_NO_PERSON_ROW} is on no roster`);
  const ghostActs = await classes
    .select({ id: courseProposalReviewTransition.courseProposalReviewTransitionId })
    .from(courseProposalReviewTransition)
    .where(eq(courseProposalReviewTransition.actorNetid, NETID_WITH_NO_PERSON_ROW));
  assert(ghostActs.length === 1, `${NETID_WITH_NO_PERSON_ROW} acts once, on R2's develop`);

  // Every netid on a roster is one the directory knows.
  const seated = await classes
    .selectDistinct({ netid: offeringInstructor.netid })
    .from(offeringInstructor);
  const known = new Set(PEOPLE_ROWS.map((row) => row.netid as string));
  for (const row of seated) {
    assert(known.has(row.netid), `${row.netid} is a person the directory knows`);
  }

  // **The directory is incomplete, and by exactly one** — the count the artifact
  // states beside its thirteen people. Asserted rather than implied, because a
  // fifteenth netid arriving somewhere in `classes` would otherwise pass.
  const strangers = await classes.execute<{ netid: string }>(sql`
    SELECT DISTINCT netid FROM (
      SELECT netid FROM user_role
      UNION SELECT netid FROM program_director
      UNION SELECT netid FROM offering_instructor
      UNION SELECT created_by FROM course_proposal
      UNION SELECT actor_netid FROM course_proposal_review_transition
      UNION SELECT actor_netid FROM course_transition
      UNION SELECT actor_netid FROM offering_transition
    ) AS everyone
  `);
  const unknown = strangers.map((row) => row.netid).filter((netid) => !known.has(netid));
  assert(
    unknown.length === COUNTS.netidsWithoutAPersonRow && unknown[0] === NETID_WITH_NO_PERSON_ROW,
    `one netid the directory does not know, and it is ${NETID_WITH_NO_PERSON_ROW}`,
  );

  assert(written.size === COUNTS.fieldEdits, `all ${COUNTS.fieldEdits} field edits were written`);

  // The log is the point: no snapshot was hand-authored, so every state below is
  // where `applyTransition` put it.
  const [logged] = await classes.execute<{ n: number }>(sql`
    SELECT (SELECT count(*) FROM offering_transition)
         + (SELECT count(*) FROM course_transition)
         + (SELECT count(*) FROM course_proposal_review_transition) AS n
  `);
  console.log(`  ${logged!.n} transitions, all of them driven`);
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/**
 * The seed refuses a database that already holds rows. It is not idempotent and
 * is not trying to be: **reseed is the recovery path**, `npm run db:reset` drops
 * both projects, migrates both and runs this, and per-version snapshot migration
 * functions are out of scope by construction (issues/13).
 */
async function refuseANonEmptyWorld(): Promise<void> {
  const [classesExisting] = await classesDb().execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM program`,
  );
  const [peopleExisting] = await peopleDb().execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM person`,
  );

  if (Number(classesExisting!.n) > 0 || Number(peopleExisting!.n) > 0) {
    throw new Error("The databases already hold rows. Run `npm run db:reset`.");
  }
}

const STEPS: readonly (() => Promise<void>)[] = [
  referenceData,
  personRows,
  genesisGrant,
  roleGrants,
  programDirectors,
  proposalsAndReviews,
  reviewTransitions,
  courseCycles,
  offerings,
  seatSharing,
  fieldEdits,
];

async function main(): Promise<void> {
  await refuseANonEmptyWorld();

  assert(STEPS.length === SEED_ORDER.length, "the seed walks all eleven steps");

  for (const [index, step] of STEPS.entries()) {
    const named = SEED_ORDER[index]!;
    console.log(`\n— step ${named.step}: ${named.writes}`);
    await step();
  }

  console.log("\n— checking the world");
  await checkTheWorld();
  console.log("\nSeeded.");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
