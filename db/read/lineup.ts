import "server-only";

import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import {
  area,
  course,
  courseArea,
  courseRequirementCategory,
  offering,
  offeringArea,
  offeringInstructor,
  offeringMeeting,
  offeringRequirementCategory,
  requirementCategory,
  term,
} from "@/db/classes/schema";
import { classesDb } from "@/db/handles";
import type { ExposedOfferingEvent } from "@/db/write/apply-transition";
import { NEVER_EXPOSED } from "@/db/write/apply-transition";
import {
  courseRetired,
  notYours,
  permitted,
  routesFor,
  type ActorFacts,
  type Subject,
} from "@/db/write/rules";
import type { Netid } from "@/db/write/transaction";
import type { Actor } from "@/lib/auth/actor";
import {
  COMMITTED_STATES,
  machine as offeringMachine,
  OFFERING_STATES,
  type OfferingState,
} from "@/lib/machines/offering.machine";
import { leadOf } from "@/lib/roster";

import { getActorFacts } from "./actor-facts";
import {
  canEverAct,
  type ForeignTag,
  type Meeting,
  type OwnTag,
  type PermittedAction,
} from "./shape";
import { stitchNames, type StitchedName } from "./stitch";

export { leadOf };

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
  const states = visibleStates(facts, filters.status);
  if (states.length === 0) return [];

  const rows = await classesDb()
    .select({
      offeringId: offering.offeringId,
      sectionNumber: offering.sectionNumber,
      status: offering.status,
      mode: offering.mode,
      enrollmentLimit: offering.enrollmentLimit,
      // Not on the returned row. The offering's program is the scope half of every
      // permission on this record (issues/4), and it is always its course's
      // (issues/30), so it is read for `Subject` and never rendered: the only
      // program name the Lineup displays is a seat-sharing grant.
      programCode: offering.programCode,
      courseId: course.courseId,
      courseNumber: course.courseNumber,
      title: course.title,
      credits: course.credits,
      // The `retry` invariant is a predicate over the parent course's state
      // (issues/14), read here so a greyed control can carry the reason.
      courseStatus: course.status,

      roster: sql<RosterJson>`(
        SELECT coalesce(json_agg(json_build_object(
          'position', ${offeringInstructor.position},
          'netid', ${offeringInstructor.netid}
        ) ORDER BY ${offeringInstructor.position}), '[]'::json)
        FROM ${offeringInstructor}
        WHERE ${offeringInstructor.offeringId} = ${offering.offeringId}
      )`,

      meetings: sql<MeetingJson>`(
        SELECT coalesce(json_agg(json_build_object(
          'kind', ${offeringMeeting.kind},
          'dayOfWeek', ${offeringMeeting.dayOfWeek},
          'startDate', ${offeringMeeting.startDate},
          'endDate', ${offeringMeeting.endDate},
          'startTime', ${offeringMeeting.startTime},
          'endTime', ${offeringMeeting.endTime},
          'room', ${offeringMeeting.room}
        ) ORDER BY ${offeringMeeting.offeringMeetingId}), '[]'::json)
        FROM ${offeringMeeting}
        WHERE ${offeringMeeting.offeringId} = ${offering.offeringId}
      )`,

      // The two seat-sharing tables, read as one list: *Also counts toward* is one
      // fact about the section, and whether the other program expressed it as an
      // area or as a requirement category is that program's own bookkeeping.
      foreignTags: sql<ForeignTagJson>`(
        SELECT coalesce(json_agg(tag ORDER BY tag->>'programCode', tag->>'name'), '[]'::json)
        FROM (
          SELECT json_build_object(
            'programCode', ${area.programCode},
            'name', ${area.name},
            'grantedBy', ${offeringArea.grantedBy},
            'grantedAt', ${offeringArea.grantedAt}
          ) AS tag
          FROM ${offeringArea}
          JOIN ${area} ON ${area.areaId} = ${offeringArea.areaId}
          WHERE ${offeringArea.offeringId} = ${offering.offeringId}
          UNION ALL
          SELECT json_build_object(
            'programCode', ${requirementCategory.programCode},
            'name', ${requirementCategory.name},
            'grantedBy', ${offeringRequirementCategory.grantedBy},
            'grantedAt', ${offeringRequirementCategory.grantedAt}
          ) AS tag
          FROM ${offeringRequirementCategory}
          JOIN ${requirementCategory}
            ON ${requirementCategory.requirementCategoryId}
             = ${offeringRequirementCategory.requirementCategoryId}
          WHERE ${offeringRequirementCategory.offeringId} = ${offering.offeringId}
        ) tags
      )`,

      // Course-level, so identical on every sibling section and read off the first
      // of them. Repeating them down the page costs a few bytes and saves the
      // second round trip a separate group query would be.
      areas: sql<TagJson>`(
        SELECT coalesce(json_agg(json_build_object('name', ${area.name}) ORDER BY ${area.name}), '[]'::json)
        FROM ${courseArea}
        JOIN ${area} ON ${area.areaId} = ${courseArea.areaId}
        WHERE ${courseArea.courseId} = ${course.courseId}
      )`,
      requirementCategories: sql<TagJson>`(
        SELECT coalesce(json_agg(json_build_object('name', ${requirementCategory.name}) ORDER BY ${requirementCategory.name}), '[]'::json)
        FROM ${courseRequirementCategory}
        JOIN ${requirementCategory}
          ON ${requirementCategory.requirementCategoryId}
           = ${courseRequirementCategory.requirementCategoryId}
        WHERE ${courseRequirementCategory.courseId} = ${course.courseId}
      )`,
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
  const directory = await stitchNames(
    rows.flatMap((row) => [
      ...row.roster.map((entry) => entry.netid),
      ...row.foreignTags.map((tag) => tag.grantedBy),
    ]),
  );

  const columnExists = canEverAct(facts);
  const groups = new Map<number, Mutable>();

  for (const row of rows) {
    const status = row.status as OfferingState;
    const roster = row.roster.map((entry) => ({
      position: entry.position,
      ...directory(entry.netid),
    }));

    // **The lead is whoever holds position 0, never `roster[0]`** (issues/61), and
    // the same call answers both questions: who scopes the lead-only permissions,
    // and whether there is anybody there at all.
    const lead = leadOf(roster)?.netid ?? null;

    const section: LineupRow = {
      offeringId: String(row.offeringId),
      sectionNumber: row.sectionNumber,
      status,
      roster,
      meetings: row.meetings.map(asMeeting),
      mode: row.mode,
      enrollmentLimit: row.enrollmentLimit,
      foreignTags: row.foreignTags.map((tag) => ({
        programCode: tag.programCode,
        name: tag.name,
        grantedBy: directory(tag.grantedBy),
        grantedAt: tag.grantedAt,
      })),
      actions: columnExists
        ? actionsFor(
            status,
            { programCode: row.programCode, courseStatus: row.courseStatus },
            lead,
            facts,
          )
        : null,
    };

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
    group.sections.push(section);
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

/**
 * One Offering. **Amended by issues/37**: issues/9 sketched this row as carrying
 * course title, number, term and program alongside the offering's own facts;
 * grouping moved every course-level fact onto `LineupGroup`, and the term is the
 * page's. What is left is what differs between sibling sections.
 */
export type LineupRow = {
  offeringId: string;
  sectionNumber: string;
  status: OfferingState;
  /**
   * In `position` order, and **each entry carries its own `position`** (issues/61).
   * Never an array indexed by convention: `decline` and `withdraw` each `DELETE`
   * position 0 and leave everything below it, so a gap at 0 is a shape the
   * machine's own edges produce. `leadOf` — and `rosterShape` in `lib/roster.ts`,
   * which the renderer uses — is how that gap is read.
   */
  roster: readonly LineupRosterEntry[];
  meetings: readonly Meeting[];
  mode: string | null;
  enrollmentLimit: number | null;
  /**
   * Rendered *Also counts toward*, one line beneath the section row — the grant
   * attaches to the section that made it, not to the course (issues/37).
   */
  foreignTags: readonly ForeignTag[];
  /**
   * **Absent — not empty — for an actor who can never act** (issues/37), on the
   * same Tier 2 predicate the Catalog uses.
   */
  actions: readonly PermittedAction<OfferingEventName>[] | null;
};

/**
 * The Lineup's roster entry. **No pronouns**: a list is not where a person is
 * presented as a person (issues/40). The Offering detail page's roster is where
 * `StitchedPerson` belongs.
 */
export type LineupRosterEntry = { position: number } & StitchedName;

/**
 * The Offering moves a **row** can offer, which is the writer's own exposed union
 * rather than the machine's whole event set (issues/15, issues/28).
 *
 * `staff` and `unstaff` are absent because nothing user-facing may name them, and
 * that is inherited from `ExposedOfferingEvent` rather than restated: a row that
 * offered `staff` would be a control whose Server Action cannot exist.
 */
export type OfferingEventName = ExposedOfferingEvent["type"];

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

/**
 * **The read tier, as a state set** (issues/28).
 *
 * `offering` is Tier 1 in `COMMITTED_STATES` — *an instructor agreed to teach this,
 * or did once* — and Tier 2 in the six states that are the department's staffing
 * process. The Tier 2 predicate is `canEverAct`, read off `READ_TIERS` in
 * `db/read/shape.ts` rather than restated as a list of roles, and it is the same
 * predicate that decides whether the Actions column exists: `student` and `advisor`
 * are exactly issues/8's two empty rows.
 *
 * The narrowing happens **in the query**, so invisibility is never something a page
 * has to remember to honour (issues/9).
 */
function visibleStates(
  facts: ActorFacts,
  chosen: readonly OfferingState[] | null,
): readonly OfferingState[] {
  const allowed: readonly OfferingState[] = canEverAct(facts) ? OFFERING_STATES : COMMITTED_STATES;
  return chosen === null ? allowed : allowed.filter((state) => chosen.includes(state));
}

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
// The per-row permitted-action set
// ---------------------------------------------------------------------------

/**
 * **Machine legality AND invariants AND permissions, intersected here** — the same
 * three terms in the same order as `applyTransition`, computed one step earlier so
 * a row can say what it offers before anybody clicks (issues/28, issues/37).
 *
 * Every move the machine offers from this state and the action layer exposes is
 * listed, the permitted ones clickable and the refused ones carrying their reason.
 * A move the machine does not offer at all is **absent** rather than greyed — the
 * state is not a refusal, it is the shape of the lifecycle — so `Concluded` and
 * `Dead`, being final, carry no menu at all.
 *
 * The `retry` guard is the one invariant an Offering row carries, and its refusal is
 * `courseRetired`'s sentence rather than one written here, so what the greyed control
 * says and what the writer throws cannot drift apart. It is checked **before** the
 * permission term, in the writer's own order: a director looking at a revivable
 * section of a retired course is told the course is retired, which is the thing they
 * can act on, rather than being told the move is theirs.
 */
function actionsFor(
  status: OfferingState,
  record: { programCode: string; courseStatus: string | null },
  lead: Netid | null,
  facts: ActorFacts,
): readonly PermittedAction<OfferingEventName>[] {
  const subject: Subject = {
    offering: { programCode: record.programCode, lead },
  };

  return movesFrom(status).map((event) => {
    if (event === "retry" && record.courseStatus === "Retired") {
      return { event, permitted: false, refusal: courseRetired() };
    }

    const routes = routesFor("offering", event);
    return permitted(routes, facts, subject)
      ? { event, permitted: true }
      : {
          event,
          permitted: false,
          refusal: notYours(event, "this class", routes, subject),
        };
  });
}

/**
 * The edges the machine draws out of one state, minus the two nothing user-facing
 * may name.
 *
 * `.can()` is deliberately not what asks — it folds a guard in, and a guarded edge
 * is precisely the one that has to be listed and greyed with its reason. The
 * Offering machine has no guards at all since issues/17, so here the difference is
 * only that `ownEvents` is honest about a final state having none.
 */
function movesFrom(status: OfferingState): readonly OfferingEventName[] {
  const hidden: readonly string[] = NEVER_EXPOSED;
  return (offeringMachine.states[status].ownEvents as readonly string[]).filter(
    (event): event is OfferingEventName => !hidden.includes(event),
  );
}

// ---------------------------------------------------------------------------
// What the one query hands back
// ---------------------------------------------------------------------------
//
// The children arrive as JSON beside their parent row, which is what makes the
// `classes` side one round trip. These types are the shape of that JSON and
// nothing else: every one of them is mapped into a row type above before it
// leaves the module, so no caller ever sees a nullable column it has to
// re-discriminate.

type RosterJson = readonly { position: number; netid: string }[];

type TagJson = readonly { name: string }[];

type ForeignTagJson = readonly {
  programCode: string;
  name: string;
  grantedBy: string;
  grantedAt: string;
}[];

type MeetingJson = readonly {
  kind: string;
  dayOfWeek: number | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
}[];

type Mutable = Omit<LineupGroup, "sectionCount" | "sections"> & {
  sections: LineupRow[];
};

/**
 * `offering_meeting`'s nullable columns back into the discriminated union, which is
 * the one direction that matters: the **kind is declared** and this switch reads it
 * rather than inferring it from which columns are filled — the exact legacy failure
 * issues/10 declared the column to fix.
 *
 * `time` and `date` arrive as strings, and the seconds on a `time` are trimmed here
 * rather than in the renderer: *18:30* and *18:30:00* are the same fact, and a
 * renderer that trims is a renderer that has to know the column type.
 */
function asMeeting(row: MeetingJson[number]): Meeting {
  switch (row.kind) {
    case "weekly": {
      if (row.dayOfWeek === null || row.startTime === null || row.endTime === null) {
        throw new Error("Invalid meeting row: weekly meetings require dayOfWeek, startTime, and endTime.");
      }
      return {
        kind: "weekly",
        dayOfWeek: row.dayOfWeek,
        startTime: clock(row.startTime),
        endTime: clock(row.endTime),
        room: row.room,
      };
    }
    case "dates": {
      if (row.startDate === null || row.endDate === null || row.startTime === null || row.endTime === null) {
        throw new Error("Invalid meeting row: dates meetings require startDate, endDate, startTime, and endTime.");
      }
      return {
        kind: "dates",
        startDate: row.startDate,
        endDate: row.endDate,
        startTime: clock(row.startTime),
        endTime: clock(row.endTime),
        room: row.room,
      };
    }
    case "async":
      return { kind: "async" };
    default:
      // The shape CHECK allows three values and the schema builds it from this same
      // list, so a fourth means the migration and the code have parted company —
      // the alarm `db/machine-states.test.ts` is for, one table over.
      throw new Error(`${row.kind} is not a meeting kind.`);
  }
}

function clock(time: string | null): string {
  return (time ?? "").slice(0, 5);
}
