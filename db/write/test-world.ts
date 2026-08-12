/**
 * The small world the Seam 1 tests build, and it is built **by calling the
 * writers**.
 *
 * Only two things here are written any other way, and they are the two the seed
 * itself writes with no in-app author (issues/34, and `SEED_ORDER` in
 * `docs/fixtures/fixtures.ts`): the reference data — programs, terms, areas,
 * categories, and the `person` rows in the other project — and **the one
 * unchecked `chair` row**. That row is a fixed point rather than a shortcut:
 * every route that writes `user_role` requires the `chair` role, so the first
 * grant cannot be written from inside. Everything after it goes through
 * `writeFields` acting as that chair.
 *
 * Not a fixture file. `docs/fixtures/` is authoritative for the seed's cast and
 * the seed script is a later ticket's; this is the smallest world in which each
 * rule below can be shown to fire.
 */
import { sql } from "drizzle-orm";

import { area, program, requirementCategory, term, userRole } from "@/db/classes/schema";
import { classesDb, peopleDb } from "@/db/handles";
import { person } from "@/db/people/schema";

import { applyTransition, type OfferingEvent } from "./apply-transition";
import { createOffering, type Meeting } from "./create-offering";
import { createProposal } from "./create-proposal";
import { WriteRefused } from "./refusal";
import { writeToClasses, type Id } from "./transaction";
import { writeFields } from "./write-fields";

/** Both databases are configured, so the write paths can be exercised against them. */
export const DATABASES_CONFIGURED =
  Boolean(process.env.CLASSES_DATABASE_URL) && Boolean(process.env.PEOPLE_DATABASE_URL);

/**
 * The cast. Small on purpose — one holder per route the write paths take, plus
 * the two netids the roster refusals need.
 */
export const WHO = {
  /** The chair. Bypasses the permission term and nothing else. */
  chair: "tv1067",
  /** ITP's program director. */
  itpDirector: "pr3390",
  /** IMA's program director — the wrong program for everything below. */
  imaDirector: "rc7781",
  /** Area head of the ITP course, and an instructor. */
  areaHead: "na2481",
  /** A plain instructor. */
  instructor: "dh4410",
  /** The department coordinator: the forward path, and `offer`. */
  coordinator: "co1234",
  /** Holds `student` and nothing else — the row that holds nothing in the matrix. */
  student: "st9999",
  /**
   * Holds `advisor` and nothing else — issues/8's **other** empty row, and the
   * one a read tier can tell apart from `student` nowhere: both are Tier 2's
   * *can do nothing*, so both lose the history section and the Actions column
   * together (issues/28, issues/41). Here so that *both* can be shown to,
   * rather than one being shown and the other assumed.
   */
  advisor: "ad5150",
  /** Holds `instructor`, and the directory has never heard of them. */
  ghost: "gh0000",
} as const;

const ROLES: readonly (readonly [netid: string, role: string])[] = [
  [WHO.itpDirector, "program_director"],
  [WHO.itpDirector, "instructor"],
  [WHO.imaDirector, "program_director"],
  [WHO.areaHead, "area_head"],
  [WHO.areaHead, "instructor"],
  [WHO.instructor, "instructor"],
  [WHO.coordinator, "coordinator"],
  [WHO.student, "student"],
  [WHO.advisor, "advisor"],
  [WHO.ghost, "instructor"],
];

/** Everyone the directory knows. `WHO.ghost` is deliberately absent from it. */
const DIRECTORY = [
  WHO.chair,
  WHO.itpDirector,
  WHO.imaDirector,
  WHO.areaHead,
  WHO.instructor,
  WHO.coordinator,
  WHO.student,
  WHO.advisor,
];

export type World = {
  itpAreaId: number;
  imaAreaId: number;
  itpCategoryId: number;
  imaCategoryId: number;
  termCode: string;
  /**
   * A second term, so a term-scoped view can be shown to be scoped: the Lineup is
   * term-scoped by definition (issues/9) and a world with one term cannot tell a
   * working picker from a missing `WHERE` clause.
   */
  laterTermCode: string;
  /**
   * A term nothing is ever slated in. *A term with no offerings* is one of the
   * Lineup's two empty states (issues/37), and a world whose every term is
   * populated cannot reach it — the picker offers **every** term precisely so a
   * reader can ask *has anything been slated for Summer yet?*
   */
  emptyTermCode: string;
};

/**
 * Drop everything and rebuild the floor. Called before each test, because these
 * run against one real database pair and a test that inherited another's rows
 * would be asserting something nobody wrote.
 */
export async function freshWorld(): Promise<World> {
  const classes = classesDb();
  const people = peopleDb();

  await classes.execute(sql`
    TRUNCATE TABLE
      offering_transition, course_transition, course_proposal_review_transition,
      offering_instructor, offering_meeting, offering_area, offering_requirement_category,
      offering, course_area, course_requirement_category, course,
      course_proposal_review_area, course_proposal_review, course_proposal,
      program_director, user_role, area, requirement_category, term, program
    RESTART IDENTITY CASCADE
  `);
  await people.execute(sql`TRUNCATE TABLE person RESTART IDENTITY CASCADE`);

  await classes.insert(program).values([
    { code: "ITP", name: "Interactive Telecommunications", degreeLevel: "graduate", createdBy: WHO.chair },
    { code: "IMA", name: "Interactive Media Arts", degreeLevel: "undergraduate", createdBy: WHO.chair },
  ]);
  await classes.insert(term).values([
    { code: "20253", year: 2025, semester: "Fall" },
    { code: "20261", year: 2026, semester: "Spring" },
    { code: "20262", year: 2026, semester: "Summer" },
  ]);

  const areas = await classes
    .insert(area)
    .values([
      { programCode: "ITP", name: "Physical Computing", createdBy: WHO.chair },
      { programCode: "IMA", name: "Media Art", createdBy: WHO.chair },
    ])
    .returning({ areaId: area.areaId, programCode: area.programCode });

  const categories = await classes
    .insert(requirementCategory)
    .values([
      { programCode: "ITP", name: "Core", createdBy: WHO.chair },
      { programCode: "IMA", name: "Elective", createdBy: WHO.chair },
    ])
    .returning({
      requirementCategoryId: requirementCategory.requirementCategoryId,
      programCode: requirementCategory.programCode,
    });

  await people.insert(person).values(
    DIRECTORY.map((netid) => ({
      netid,
      officialFirstname: netid.slice(0, 2).toUpperCase(),
      officialLastname: "Example",
    })),
  );

  // Step 3: the genesis grant, and the only unchecked write in the world.
  await classes.insert(userRole).values({ netid: WHO.chair, role: "chair", grantedBy: WHO.chair });

  // Steps 4 and 5: every other grant, and the two director rows, through the
  // checked writer acting as that chair.
  await writeToClasses((tx) =>
    writeFields(
      tx,
      {
        record: { authorization: true },
        rows: ROLES.map(([netid, role]) => ({
          table: "user_role" as const,
          op: "insert" as const,
          values: { netid, role },
        })),
      },
      WHO.chair,
    ),
  );

  await writeToClasses((tx) =>
    writeFields(
      tx,
      {
        record: { authorization: true },
        rows: [
          { table: "program_director", op: "insert", values: { program_code: "ITP", netid: WHO.itpDirector } },
          { table: "program_director", op: "insert", values: { program_code: "IMA", netid: WHO.imaDirector } },
        ],
      },
      WHO.chair,
    ),
  );

  return {
    itpAreaId: areas.find((row) => row.programCode === "ITP")!.areaId,
    imaAreaId: areas.find((row) => row.programCode === "IMA")!.areaId,
    itpCategoryId: categories.find((row) => row.programCode === "ITP")!.requirementCategoryId,
    imaCategoryId: categories.find((row) => row.programCode === "IMA")!.requirementCategoryId,
    termCode: "20253",
    laterTermCode: "20261",
    emptyTermCode: "20262",
  };
}

export type MintedCourse = { proposalId: Id; reviewId: Id; courseId: Id };

/**
 * A course, by the only route there is to one: a proposal, one review per
 * requested program, an assignment written onto the review, and an `approve`
 * that mints it. `course.minted_from_review_id` is `NOT NULL`, so there is no
 * other way to have a course at all (issues/49).
 */
export async function mintCourse(
  world: World,
  options: {
    courseNumber: string;
    programCode?: "ITP" | "IMA";
    /** Leave the area unassigned, for the create path's *not offerable yet* refusal. */
    withArea?: boolean;
    /** Leave the head unassigned, likewise. */
    withAreaHead?: boolean;
    credits?: number;
  },
): Promise<MintedCourse> {
  const programCode = options.programCode ?? "ITP";
  const director = programCode === "ITP" ? WHO.itpDirector : WHO.imaDirector;
  const areaId = programCode === "ITP" ? world.itpAreaId : world.imaAreaId;

  const { proposalId, reviewIds } = await writeToClasses((tx) =>
    createProposal(
      tx,
      {
        title: `A course numbered ${options.courseNumber}`,
        description: "Written by the world builder.",
        credits: options.credits ?? 4,
        programs: [programCode],
      },
      WHO.instructor,
    ),
  );
  const reviewId = reviewIds[0]!;

  const assignment: Parameters<typeof writeFields>[1] = {
    record: { machine: "course_proposal_review", id: reviewId },
    columns: (options.withAreaHead ?? true) ? { "course_proposal_review.area_head": WHO.areaHead } : {},
    rows:
      (options.withArea ?? true)
        ? [
            {
              table: "course_proposal_review_area",
              op: "insert",
              values: {
                course_proposal_review_id: reviewId,
                area_id: areaId,
                program_code: programCode,
              },
            },
          ]
        : [],
  };
  if (Object.keys(assignment.columns ?? {}).length > 0 || (assignment.rows ?? []).length > 0) {
    await writeToClasses((tx) => writeFields(tx, assignment, director));
  }

  await writeToClasses((tx) =>
    applyTransition(
      tx,
      { machine: "course_proposal_review", id: reviewId },
      { type: "approve", courseNumber: options.courseNumber },
      director,
    ),
  );

  const [minted] = await classesDb().execute<{ course_id: number }>(
    sql`SELECT course_id FROM course WHERE minted_from_review_id = ${reviewId}`,
  );

  return { proposalId, reviewId, courseId: Number(minted!.course_id) };
}

/** One `weekly` slot. Meetings are part of slating (issues/43), so every created offering has one. */
export const A_MEETING = {
  kind: "weekly",
  dayOfWeek: 1,
  startTime: "18:30",
  endTime: "21:00",
  room: "370J",
} as const;

/** A `dates` slot — the LowRes intensive, which is the shape issues/10's `kind` column exists for. */
export const AN_INTENSIVE = {
  kind: "dates",
  startDate: "2026-01-05",
  endDate: "2026-01-16",
  startTime: "10:00",
  endTime: "16:00",
  room: "370J-Commons",
} as const;

/** An `async` slot — no time and no room, and the shape CHECK enforces both absences. */
export const ASYNCHRONOUS = { kind: "async" } as const;

/** A class of that course, in the world's earlier term unless another is named. */
export async function slateOffering(
  world: World,
  courseId: Id,
  options: {
    actor?: string;
    sectionNumber?: string;
    termCode?: string;
    meetings?: readonly Meeting[];
    mode?: string | null;
    enrollmentLimit?: number | null;
  } = {},
): Promise<Id> {
  const { offeringId } = await writeToClasses((tx) =>
    createOffering(
      tx,
      {
        courseId,
        termCode: options.termCode ?? world.termCode,
        sectionNumber: options.sectionNumber ?? "1",
        meetings: options.meetings ?? [A_MEETING],
        mode: options.mode ?? null,
        enrollmentLimit: options.enrollmentLimit ?? null,
        callNumber: null,
        sisClassNumber: null,
        url: null,
      },
      options.actor ?? WHO.itpDirector,
    ),
  );
  return offeringId;
}

/**
 * Walk a class along its lifecycle, one checked transition per transaction — which
 * is what a class reaching a state **means**, since `applyTransition` is the only
 * thing that can write a snapshot.
 *
 * `staff` is the one event carrying a subject, so it is spelled with its netid; the
 * rest are bare. Who may fire each one is the matrix's business and not this
 * helper's, so the actor is per step and defaults to the seat that ordinarily holds
 * the move.
 */
export async function driveOffering(
  offeringId: Id,
  steps: readonly (OfferingEvent & { by?: string })[],
): Promise<void> {
  for (const step of steps) {
    const { by, ...event } = step;
    await writeToClasses((tx) =>
      applyTransition(tx, { machine: "offering", id: offeringId }, event as OfferingEvent, by ?? WHO.itpDirector),
    );
  }
}

/**
 * A co-instructor, below position 0, through the field writer — which is the only
 * path there is: position 0 is refused by that writer in every state, and naming a
 * lead is `staff` (issues/61).
 */
export function seatCoInstructor(
  offeringId: Id,
  netid: string,
  position: number,
  actor: string = WHO.itpDirector,
): Promise<void> {
  return writeToClasses((tx) =>
    writeFields(
      tx,
      {
        record: { machine: "offering", id: offeringId },
        rows: [{ table: "offering_instructor", op: "insert", values: { netid, position } }],
      },
      actor,
    ),
  );
}

/**
 * A seat-sharing tag: **another** program's claim on this class, written by that
 * program's director, because whoever authors the claim writes the row (issues/25,
 * issues/30). The writer refuses a tag whose program is the offering's own, so this
 * helper cannot be used to fake a foreign tag out of a local one.
 */
export function shareSeats(
  offeringId: Id,
  tag: { areaId: Id } | { categoryId: Id },
  actor: string,
): Promise<void> {
  const row =
    "areaId" in tag
      ? { table: "offering_area" as const, op: "insert" as const, values: { area_id: tag.areaId } }
      : {
          table: "offering_requirement_category" as const,
          op: "insert" as const,
          values: { requirement_category_id: tag.categoryId },
        };

  return writeToClasses((tx) =>
    writeFields(tx, { record: { machine: "offering", id: offeringId }, rows: [row] }, actor),
  );
}

/**
 * The refusal itself, so a test can read the sentence it states. A write that
 * was **not** refused fails here rather than silently passing.
 */
export async function refusalFrom(attempt: Promise<unknown>): Promise<WriteRefused> {
  try {
    await attempt;
  } catch (thrown) {
    if (thrown instanceof WriteRefused) return thrown;
    throw thrown;
  }
  throw new Error("The write was not refused.");
}
