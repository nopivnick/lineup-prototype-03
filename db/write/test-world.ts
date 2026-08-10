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

import { applyTransition } from "./apply-transition";
import { createOffering } from "./create-offering";
import { createProposal } from "./create-proposal";
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
  [WHO.ghost, "instructor"],
];

/** Everyone the directory knows. `WHO.ghost` is deliberately absent from it. */
const DIRECTORY = [WHO.chair, WHO.itpDirector, WHO.imaDirector, WHO.areaHead, WHO.instructor, WHO.coordinator, WHO.student];

export type World = {
  itpAreaId: number;
  imaAreaId: number;
  itpCategoryId: number;
  imaCategoryId: number;
  termCode: string;
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
  await classes.insert(term).values({ code: "20253", year: 2025, semester: "Fall" });

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

/** A class of that course, in the world's one term. */
export async function slateOffering(
  world: World,
  courseId: Id,
  options: { actor?: string; sectionNumber?: string } = {},
): Promise<Id> {
  const { offeringId } = await writeToClasses((tx) =>
    createOffering(
      tx,
      {
        courseId,
        termCode: world.termCode,
        sectionNumber: options.sectionNumber ?? "1",
        meetings: [A_MEETING],
        mode: null,
        enrollmentLimit: null,
        callNumber: null,
        sisClassNumber: null,
        url: null,
      },
      options.actor ?? WHO.itpDirector,
    ),
  );
  return offeringId;
}
