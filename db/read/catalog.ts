import "server-only";

import { and, asc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";

import {
  area,
  course,
  courseArea,
  courseRequirementCategory,
  offering,
  program,
  requirementCategory,
} from "@/db/classes/schema";
import { classesDb } from "@/db/handles";
import type { Actor } from "@/lib/auth/actor";
import { COURSE_STATES, type CourseState } from "@/lib/machines/course.machine";
import { LIVE_STATES } from "@/lib/machines/offering.machine";

import { getActorFacts } from "./actor-facts";
import {
  courseActionsFor,
  notOfferableYet,
  type CourseEventName,
  type NotOfferableYet,
} from "./course-rows";
import { canEverAct, type OwnTag, type PermittedAction } from "./shape";

/**
 * The permitted-action set and the *not offerable yet* marker are
 * `db/read/course-rows.ts`'s, shared with the Course page (issues/83): two views
 * of one course must offer the same moves and name the same refusal, or the
 * `⋯ n` menu and the rail's buttons are two answers rather than two treatments
 * of one (issues/40, issues/41).
 */
export type { CourseEventName };

/**
 * **The Catalog: every Course eligible to be offered, grouped by program, with
 * no term anywhere** (issues/9, issues/37, issues/81).
 *
 * **The one read module in the skeleton that never touches `people`.** issues/37
 * answered *does the Catalog display a person* in the negative, at the
 * requester's direction and against the recommendation, and the consequence is
 * larger than a dropped column: this module issues no query against the other
 * project at all, which makes it the one view immune to the cross-project
 * failure mode. `db/read/catalog.test.ts` asserts it, because a build reading
 * issues/9 alone would add the batch fetch back.
 *
 * The gap that opened — *which of my courses cannot be offered yet?* — closes
 * without a person, as the derived `notOfferableYet` marker below. Both of its
 * inputs are `classes`-side, which is what lets the read stay single-database.
 *
 * **View-shaped, not table-shaped.** What comes back is composed rows, never
 * table rows plus a map for the page to assemble: two views disagreeing about
 * what a row *is* would each invent their own assembly, and the seam exists to
 * prevent exactly that.
 *
 * **Four queries of its own and none of them per row** — the courses, their two
 * tag sets, and the offerings the `retire` guard is a predicate over — plus the
 * actor's facts, which are `cache()`d and shared with every other read module
 * rendering on the same page.
 */
export async function getCatalogPage(
  actor: Actor,
  filters: CatalogFilters,
): Promise<readonly CatalogGroup[]> {
  // A status filter narrowed to nothing matches nothing, and says so here rather
  // than as an `IN ()` the driver would refuse to build.
  if (filters.status.length === 0) return [];

  const classes = classesDb();

  // Tier 1: `course` is readable by any signed-in netid, so no row is hidden
  // from anybody here and the actor narrows nothing. What the actor decides is
  // the Actions column, below.
  const rows = await classes
    .select({
      courseId: course.courseId,
      courseNumber: course.courseNumber,
      title: course.title,
      credits: course.credits,
      status: course.status,
      areaHead: course.areaHead,
      programCode: course.programCode,
      programName: program.name,
    })
    .from(course)
    .innerJoin(program, eq(program.code, course.programCode))
    .where(narrow(filters))
    .orderBy(asc(course.programCode), asc(course.courseNumber));

  if (rows.length === 0) return [];

  const courseIds = rows.map((row) => row.courseId);

  // Three set-based reads over the page's own course ids — the tags a row
  // displays, and the offerings the `retire` guard is a predicate over. None is
  // per row, and none leaves this project.
  const [areas, categories, live] = await Promise.all([
    classes
      .select({ courseId: courseArea.courseId, name: area.name })
      .from(courseArea)
      .innerJoin(area, eq(area.areaId, courseArea.areaId))
      .where(inArray(courseArea.courseId, courseIds))
      .orderBy(asc(area.name)),
    classes
      .select({ courseId: courseRequirementCategory.courseId, name: requirementCategory.name })
      .from(courseRequirementCategory)
      .innerJoin(
        requirementCategory,
        eq(
          requirementCategory.requirementCategoryId,
          courseRequirementCategory.requirementCategoryId,
        ),
      )
      .where(inArray(courseRequirementCategory.courseId, courseIds))
      .orderBy(asc(requirementCategory.name)),
    classes
      .select({
        courseId: offering.courseId,
        termCode: offering.termCode,
        status: offering.status,
      })
      .from(offering)
      .where(
        and(inArray(offering.courseId, courseIds), inArray(offering.status, [...LIVE_STATES])),
      )
      .orderBy(asc(offering.termCode)),
  ]);

  const facts = await getActorFacts(actor.netid);
  const columnExists = canEverAct(facts);

  const areasOf = collect(areas);
  const categoriesOf = collect(categories);
  const liveOf = new Map<number, { termCode: string; status: string }[]>();
  for (const offered of live) {
    const held = liveOf.get(offered.courseId) ?? [];
    held.push({ termCode: offered.termCode, status: offered.status ?? "" });
    liveOf.set(offered.courseId, held);
  }

  const groups = new Map<string, { programName: string; courses: CatalogRow[] }>();

  for (const row of rows) {
    const status = row.status as CourseState;
    const record = { programCode: row.programCode, areaHead: row.areaHead };
    const areasHeld = areasOf.get(row.courseId) ?? [];

    const group = groups.get(row.programCode) ?? { programName: row.programName, courses: [] };
    groups.set(row.programCode, group);

    group.courses.push({
      // `bigint` reaches the write side as a number (issues/93) and a row type
      // says `string`, so the boundary is here rather than in a page.
      courseId: String(row.courseId),
      courseNumber: row.courseNumber,
      title: row.title,
      credits: row.credits,
      areas: areasHeld,
      requirementCategories: categoriesOf.get(row.courseId) ?? [],
      status,
      notOfferableYet: notOfferableYet(areasHeld.length, row.areaHead),
      actions: columnExists
        ? courseActionsFor(status, record, liveOf.get(row.courseId) ?? [], facts)
        : null,
    });
  }

  return [...groups].map(([programCode, group]) => ({
    programCode,
    programName: group.programName,
    courseCount: group.courses.length,
    courses: group.courses,
  }));
}

/**
 * The programs the filter offers, which is **every** program and not the ones
 * this page's rows happen to belong to: a filter whose options are the result of
 * the filter can only be escaped by clearing it.
 *
 * It is in this module and not a table-shaped one of its own because the filter
 * is part of the view, and because the alternative is a page holding a handle.
 */
export async function listCatalogPrograms(): Promise<readonly CatalogProgram[]> {
  return classesDb()
    .select({ code: program.code, name: program.name })
    .from(program)
    .orderBy(asc(program.code));
}

export type CatalogProgram = { code: string; name: string };

// ---------------------------------------------------------------------------
// The composed rows
// ---------------------------------------------------------------------------

/**
 * Grouped by program — a course belongs to exactly one, and the grouping costs
 * nothing (issues/37).
 *
 * The mechanism on the page is mantine-datatable's `rowExpansion` with
 * `trigger: 'always'`, because **the library has no row grouping at all**: its
 * `groups` groups *columns*. That is a rendering fact, recorded here because the
 * shape of this type is what makes it available.
 *
 * Groups arrive in `program.code` order. The department's own order — ITP, IMA,
 * LowRes — is not a fact the schema holds, so the deterministic one is used
 * rather than invented.
 */
export type CatalogGroup = {
  programCode: string;
  programName: string;
  courseCount: number;
  courses: readonly CatalogRow[];
};

/**
 * One Course. Not a table row, and deliberately **not** called `Course` — that
 * name belongs to the entity issues/7 settled.
 *
 * Dropped from the row by issues/37 and landing on the Course detail page
 * instead: `description` and `url` (a row is not a place to read prose),
 * `edition`, `area_head`, and every `created_*` / `updated_*` column.
 */
export type CatalogRow = {
  courseId: string;
  courseNumber: string;
  title: string;
  credits: number;
  areas: readonly OwnTag[];
  requirementCategories: readonly OwnTag[];
  status: CourseState;
  /**
   * **Derived, not stored**, and shared with the Course page — see
   * `notOfferableYet` in `db/read/course-rows.ts` for the derivation and the
   * argument (issues/37, issues/32).
   */
  notOfferableYet: NotOfferableYet;
  /**
   * **Absent — not empty — for an actor who can never act** (issues/37). An
   * always-empty column is dead width advertising a capability the reader will
   * never have.
   */
  actions: readonly PermittedAction<CourseEventName>[] | null;
};

// ---------------------------------------------------------------------------
// The filters
// ---------------------------------------------------------------------------

/**
 * **`Retired` is excluded by the default, not by the query** (issues/37): a
 * `Revising` course is still eligible to be offered in future, and hiding a
 * retired one in the query would make it unreachable from the only view that
 * lists courses — which is what keeps *never offered in Spring* and *offered and
 * killed* indistinguishable to a student, as issues/28 required.
 *
 * **`search` covers title and number only.** issues/37's filter sentence reads
 * *"a search box over title, number, instructor name and instructor netid"*
 * across both views; a Course has no instructor — the only netid it carries is
 * `area_head`, which the same ticket dropped from the row — so the intersection
 * of the two statements is title and number. The instructor half belongs to the
 * Lineup.
 */
export type CatalogFilters = {
  search: string | null;
  programCode: string | null;
  status: readonly CourseState[];
};

/** *Any status* is one click away, and it is `COURSE_STATES`. */
export const DEFAULT_STATUS = ["Approved", "Revising"] as const satisfies readonly CourseState[];

export const ANY_STATUS: readonly CourseState[] = COURSE_STATES;

function narrow(filters: CatalogFilters): SQL | undefined {
  const clauses: (SQL | undefined)[] = [inArray(course.status, [...filters.status])];

  if (filters.programCode) {
    clauses.push(eq(course.programCode, filters.programCode));
  }

  const search = filters.search?.trim();
  if (search) {
    const like = `%${search}%`;
    clauses.push(or(ilike(course.title, like), ilike(course.courseNumber, like)));
  }

  return and(...clauses);
}

function collect(rows: readonly { courseId: number; name: string }[]): Map<number, OwnTag[]> {
  const byCourse = new Map<number, OwnTag[]>();
  for (const row of rows) {
    const held = byCourse.get(row.courseId) ?? [];
    held.push({ name: row.name });
    byCourse.set(row.courseId, held);
  }
  return byCourse;
}
