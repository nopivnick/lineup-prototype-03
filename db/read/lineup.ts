import "server-only";

import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";

import { course, offering, term } from "@/db/classes/schema";
import { classesDb } from "@/db/handles";
import type { Actor } from "@/lib/auth/actor";
import type { OfferingState } from "@/lib/machines/offering.machine";
import { leadOf } from "@/lib/roster";

import { getActorFacts } from "./actor-facts";
import { COURSE_TAGS } from "./course-rows";
import {
  asLineupRow,
  netidsOn,
  OFFERING_CHILDREN,
  visibleOfferingStates,
  type LineupRow,
} from "./offering-rows";
import type { OwnTag } from "./shape";
import { stitchNames } from "./stitch";

export { leadOf };

/**
 * `LineupRow` and everything on it moved to `db/read/offering-rows.ts` when the
 * Course page became a second view of a set of section rows (issues/83). They
 * are re-exported here because *the Lineup's row* is what the type is called and
 * what its readers import it as; what moved is where it is assembled, not what
 * it is.
 */
export type {
  LineupRosterEntry,
  LineupRow,
  OfferingEventName,
} from "./offering-rows";

/**
 * **The Lineup: the Offerings running in one selected term, grouped on course and
 * term** (issues/9, issues/37, issues/82).
 *
 * Three things make it the sharpest read module in the skeleton, and each is
 * something a later view inherits rather than re-derives.
 *
 * **It is where the cross-project stitch happens, and since issues/37 made the
 * Catalog person-free it is the only list that consumes it.** `classes` drives; the
 * netids on the page — roster rows and the granters of every seat-sharing tag — are
 * batched into **one** query against `people` and matched in memory. **Two round
 * trips per page, independent of page size**, which `db/read/lineup.test.ts`
 * asserts by counting calls to both handles rather than by reading the source. No
 * name is denormalised into `classes` (standing principle 1) and no transaction
 * spans the two projects — it *cannot*, which is why the netid on a roster row is
 * not a foreign key and why the writer's cross-project test is a **check** and not
 * a constraint.
 *
 * **It is where the read tiers first become visible.** `offering` is Tier 1 in
 * `COMMITTED_STATES` and Tier 2 outside them, so a `student` sees only the classes
 * an instructor agreed to teach or once did, and the six states of the department's
 * staffing process are simply not in the row set. Rows outside the tier are
 * **absent, not flagged** — a class vanishing from one state and reappearing in
 * another would leak the decline by its absence — and the same rule scaled to the
 * container: **a course whose every section is invisible does not render at all**,
 * because an empty group announces that the department is staffing something the
 * reader may not see.
 *
 * **Course-level facts are stated once.** They sit on `LineupGroup` and the section
 * row carries only what differs between siblings, so a course with three sections
 * reads as three variations rather than as three repetitions.
 *
 * **Two round trips, and the second one is the whole of the stitch.** The `classes`
 * side is one statement — the page's rows with their children aggregated as JSON
 * beside them — rather than the five set-based reads the same shape would take as
 * separate queries. That is a departure from `db/read/catalog.ts`, which issues
 * four, and the reason is that issues/82 states two round trips as a property to be
 * *tested*: a claim that counts one thing while the code does five is worth less
 * than the sentence it is written in. The cost is one large statement, and what it
 * buys is that neither round trip grows with the number of sections, the number of
 * courses, or the number of people.
 */
export async function getLineupPage(
  actor: Actor,
  filters: LineupFilters,
): Promise<readonly LineupGroup[]> {
  const facts = await getActorFacts(actor.netid);

  // **The read tier, intersected with the filter, before anything is read.** An
  // empty intersection matches nothing and says so here rather than as an `IN ()`
  // the driver would refuse to build — which is also what happens when a student
  // filters to `Declined`: nothing comes back, and nothing about *why* is stated.
  const states = visibleOfferingStates(facts, filters.status);
  if (states.length === 0) return [];

  const rows = await classesDb()
    .select({
      offeringId: offering.offeringId,
      sectionNumber: offering.sectionNumber,
      status: offering.status,
      mode: offering.mode,
      enrollmentLimit: offering.enrollmentLimit,
      programCode: offering.programCode,
      courseId: course.courseId,
      courseNumber: course.courseNumber,
      title: course.title,
      credits: course.credits,
      courseStatus: course.status,

      ...OFFERING_CHILDREN,

      // Course-level, so identical on every sibling section and read off the first
      // of them. Repeating them down the page costs a few bytes and saves the
      // second round trip a separate group query would be.
      ...COURSE_TAGS,
    })
    .from(offering)
    // issues/30's composite foreign key, used as the join it was bought to make
    // safe: an offering's program is always its course's, so the second clause can
    // never narrow anything and says so.
    .innerJoin(
      course,
      and(eq(course.courseId, offering.courseId), eq(course.programCode, offering.programCode)),
    )
    .where(narrow(filters, states))
    // Groups arrive in course-number order and sections in section-number order
    // within theirs. **Sorting is not offered** (issues/37): under grouping,
    // sorting means re-ordering groups, and a course's sections are always in
    // section order.
    .orderBy(asc(course.courseNumber), asc(course.courseId), asc(offering.sectionNumber));

  if (rows.length === 0) return [];

  // **The stitch's one query.** Every netid the page will display, resolved
  // together: the rosters, and the granter of every seat-sharing tag — issues/40
  // found the chip had been rendering without one, which hid the only
  // cross-program act in the system.
  const directory = await stitchNames(netidsOn(rows));

  const groups = new Map<number, Mutable>();

  for (const row of rows) {
    const group = groups.get(row.courseId) ?? {
      courseId: String(row.courseId),
      courseNumber: row.courseNumber,
      title: row.title,
      credits: row.credits,
      areas: row.areas,
      requirementCategories: row.requirementCategories,
      sections: [],
    };
    groups.set(row.courseId, group);
    group.sections.push(asLineupRow(row, directory, facts));
  }

  return matching(filters.search, [...groups.values()]);
}

/**
 * The terms the picker offers, which is **every** term and not the ones this term's
 * rows happen to be in — the same argument `listCatalogPrograms` is in its module
 * for (issues/81): a filter whose options are the result of the filter can only be
 * escaped by clearing it.
 *
 * Sharper here than there, because *a term with no offerings* is one of this view's
 * two empty states. A picker listing only terms that have classes could never reach
 * it, and the reader would have no way to ask *has anything been slated for Spring
 * yet?* — which is the question the empty state answers.
 *
 * Newest first, which `term.code` sorts by directly: issues/3 deferred term dates,
 * and the code's own CHECK ties it to `year` and `semester`, so a lexical
 * descending sort **is** chronological without a join or a computed column.
 */
export async function listLineupTerms(): Promise<readonly LineupTerm[]> {
  return classesDb()
    .select({ code: term.code, year: term.year, semester: term.semester })
    .from(term)
    .orderBy(desc(term.code));
}

export type LineupTerm = { code: string; year: number; semester: string };

// ---------------------------------------------------------------------------
// The composed rows
// ---------------------------------------------------------------------------

/**
 * Grouped on `(course_id, term_code)` — the key issues/9 named — with the term
 * being the page's, so the group is keyed by course within it.
 *
 * **Single-program by construction** since issues/30 FK-constrained
 * `offering.program_code` to its course's, so no group carries an own-program
 * label: there is nothing to distinguish it from. The only program name that
 * appears anywhere on this screen is on a foreign tag, where it is a seat-sharing
 * grant.
 *
 * **Course-level facts sit here, stated once**, and section rows carry only what
 * differs between siblings (issues/37).
 *
 * **A course whose every section is invisible to the actor does not appear at all.**
 * issues/37 asked for *a student's empty group* as an empty state and then found it
 * was a leak: an empty group announces that the department is staffing something
 * the student may not see, which is the whole content of the thing being hidden.
 * The Catalog is what keeps the student honest — a `Dead` offering's course stays
 * listed there, so *never offered in Spring* and *offered and killed* remain
 * indistinguishable, as issues/28 required.
 */
export type LineupGroup = {
  courseId: string;
  courseNumber: string;
  title: string;
  credits: number;
  areas: readonly OwnTag[];
  requirementCategories: readonly OwnTag[];
  sectionCount: number;
  sections: readonly LineupRow[];
};

// ---------------------------------------------------------------------------
// The filters
// ---------------------------------------------------------------------------

/**
 * **The term picker is not optional** — the Lineup is term-scoped by definition
 * (issues/9), which is why `termCode` is the one filter with no null.
 *
 * *"Who still needs an instructor?"* is `Slated` in the status filter, which is
 * issues/15's ordinary-filter finding used exactly as intended: making occupancy a
 * **state** is what turned an anti-join into a `status` filter.
 *
 * `status: null` is *any state* — narrowed by the reader's tier and by nothing else.
 */
export type LineupFilters = {
  termCode: string;
  /** Title, number, instructor name, instructor netid. See `matching` below. */
  search: string | null;
  programCode: string | null;
  status: readonly OfferingState[] | null;
};

function narrow(filters: LineupFilters, states: readonly OfferingState[]): SQL | undefined {
  const clauses: (SQL | undefined)[] = [
    eq(offering.termCode, filters.termCode),
    inArray(offering.status, [...states]),
  ];

  if (filters.programCode) {
    clauses.push(eq(offering.programCode, filters.programCode));
  }

  return and(...clauses);
}

/**
 * **The search predicate spans both projects, so it is applied after the stitch and
 * not in either query.**
 *
 * issues/37 wants a box over *title, number, instructor name and instructor netid*.
 * Three of those four live in `classes` and the fourth lives in `people`, and they
 * are OR'd — so a `WHERE` clause on either side alone would drop rows the other
 * side matches, and there is no single database that can answer.
 *
 * issues/9's answer was to run the two queries **in the other order**: resolve names
 * to netids in `people`, then filter `classes` by that set. That is a third round
 * trip, and it was bought to keep **paging and counts accurate** — a premise
 * issues/37 removed by not paging. The same removal is what issues/9's own note
 * says makes an in-memory *sort* by name free; this is that finding spent on the
 * filter instead, and it keeps the stitch at exactly two round trips.
 *
 * **A course-level match keeps all of its sections**, because the text a section is
 * matched against includes its course's number and title. That is the prototype's
 * behaviour and the right one: searching a course number and being shown two of its
 * three sections would be a worse answer than either extreme.
 *
 * It stops being the right shape at the scale a pager becomes necessary, which is
 * the same threshold, in the low thousands of rows, and the same recovery: page by
 * course, never by section.
 */
function matching(search: string | null, groups: readonly Mutable[]): readonly LineupGroup[] {
  const wanted = search?.trim().toLowerCase();

  const kept = wanted
    ? groups
        .map((group) => ({
          ...group,
          sections: group.sections.filter((section) => haystack(group, section).includes(wanted)),
        }))
        .filter((group) => group.sections.length > 0)
    : groups;

  return kept.map((group) => ({
    ...group,
    sectionCount: group.sections.length,
  }));
}

function haystack(group: Mutable, section: LineupRow): string {
  return [
    group.courseNumber,
    group.title,
    ...section.roster.flatMap((entry) => [entry.netid, entry.displayName ?? ""]),
  ]
    .join(" ")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// What the one query hands back
// ---------------------------------------------------------------------------

type Mutable = Omit<LineupGroup, "sectionCount" | "sections"> & {
  sections: LineupRow[];
};
