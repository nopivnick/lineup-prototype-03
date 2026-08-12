import "server-only";

import { sql, type SQL } from "drizzle-orm";

import {
  area,
  offering,
  offeringArea,
  offeringInstructor,
  offeringMeeting,
  offeringRequirementCategory,
  requirementCategory,
} from "@/db/classes/schema";
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
import {
  COMMITTED_STATES,
  machine as offeringMachine,
  OFFERING_STATES,
  type OfferingState,
} from "@/lib/machines/offering.machine";
import { leadOf } from "@/lib/roster";

import { qualified } from "./qualified";
import { canEverAct, type ForeignTag, type Meeting, type PermittedAction } from "./shape";
import type { Directory, StitchedName } from "./stitch";

/**
 * **One Offering, as a list renders it — and the two views that render one read
 * it from here** (issues/37, issues/82, issues/83).
 *
 * It is the **fourth module in `db/read/` that is not one of the seven views**,
 * beside `shape.ts`, `stitch.ts` and `actor-facts.ts`, and by the same rule: what
 * makes something one of the seven is that it is a **view**. This is what a
 * section row *is*, and the Lineup and the Course page are both views of a set of
 * them.
 *
 * It landed here when issues/83 made the Course page's sections `LineupRow`s
 * rather than a second, thinner section row. A second assembly would have been a
 * second answer to *what is on a section row* — the exact shallow shape
 * `docs/data-access/` spends a paragraph rejecting — and, worse, a second
 * intersection of machine legality, invariants and permissions: two screens
 * offering different moves on one class, neither of them the writer's answer.
 *
 * **The tier lives here too**, because it is a property of the row and not of
 * either page: `offering` is Tier 1 in `COMMITTED_STATES` and Tier 2 in the six
 * states that are the department's staffing process, so a `student` sees the
 * classes an instructor agreed to teach or once did and none of the process
 * behind them. Both callers narrow **in the query**, so invisibility is never
 * something a page has to remember to honour (issues/9).
 */

/**
 * One Offering. **Amended by issues/37**: issues/9 sketched this row as carrying
 * course title, number, term and program alongside the offering's own facts;
 * grouping moved every course-level fact onto the group, and the term is the
 * group's. What is left is what differs between sibling sections.
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
 * A section row's roster entry. **No pronouns**: a list is not where a person is
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
// The children, aggregated beside their parent row
// ---------------------------------------------------------------------------

/**
 * **The three child sets a section row carries, as JSON beside the row** — which
 * is what keeps the `classes` side of either page at **one statement** rather
 * than at the four or five the same shape would take as separate set-based
 * reads (issues/82).
 *
 * They are selected together and never one at a time, because a caller that took
 * two of the three would be rendering a row this module has a name for and the
 * row type has no shape for.
 */
export const OFFERING_CHILDREN = {
  roster: sql<RosterJson>`(
    SELECT coalesce(json_agg(json_build_object(
      'position', ${qualified(offeringInstructor.position)},
      'netid', ${qualified(offeringInstructor.netid)}
    ) ORDER BY ${qualified(offeringInstructor.position)}), '[]'::json)
    FROM ${offeringInstructor}
    WHERE ${qualified(offeringInstructor.offeringId)} = ${qualified(offering.offeringId)}
  )`,

  meetings: sql<MeetingJson>`(
    SELECT coalesce(json_agg(json_build_object(
      'kind', ${qualified(offeringMeeting.kind)},
      'dayOfWeek', ${qualified(offeringMeeting.dayOfWeek)},
      'startDate', ${qualified(offeringMeeting.startDate)},
      'endDate', ${qualified(offeringMeeting.endDate)},
      'startTime', ${qualified(offeringMeeting.startTime)},
      'endTime', ${qualified(offeringMeeting.endTime)},
      'room', ${qualified(offeringMeeting.room)}
    ) ORDER BY ${qualified(offeringMeeting.offeringMeetingId)}), '[]'::json)
    FROM ${offeringMeeting}
    WHERE ${qualified(offeringMeeting.offeringId)} = ${qualified(offering.offeringId)}
  )`,

  // The two seat-sharing tables, read as one list: *Also counts toward* is one
  // fact about the section, and whether the other program expressed it as an
  // area or as a requirement category is that program's own bookkeeping.
  foreignTags: sql<ForeignTagJson>`(
    SELECT coalesce(json_agg(tag ORDER BY tag->>'programCode', tag->>'name'), '[]'::json)
    FROM (
      SELECT json_build_object(
        'programCode', ${qualified(area.programCode)},
        'name', ${qualified(area.name)},
        'grantedBy', ${qualified(offeringArea.grantedBy)},
        'grantedAt', ${qualified(offeringArea.grantedAt)}
      ) AS tag
      FROM ${offeringArea}
      JOIN ${area} ON ${qualified(area.areaId)} = ${qualified(offeringArea.areaId)}
      WHERE ${qualified(offeringArea.offeringId)} = ${qualified(offering.offeringId)}
      UNION ALL
      SELECT json_build_object(
        'programCode', ${qualified(requirementCategory.programCode)},
        'name', ${qualified(requirementCategory.name)},
        'grantedBy', ${qualified(offeringRequirementCategory.grantedBy)},
        'grantedAt', ${qualified(offeringRequirementCategory.grantedAt)}
      ) AS tag
      FROM ${offeringRequirementCategory}
      JOIN ${requirementCategory}
        ON ${qualified(requirementCategory.requirementCategoryId)}
         = ${qualified(offeringRequirementCategory.requirementCategoryId)}
      WHERE ${qualified(offeringRequirementCategory.offeringId)} = ${qualified(offering.offeringId)}
    ) tags
  )`,
} satisfies Record<string, SQL<unknown>>;

/**
 * The columns of `offering` and its parent `course` that a section row is built
 * from — selected beside `OFFERING_CHILDREN` by both callers.
 *
 * `programCode` and `courseStatus` are **not on the returned row**. The
 * offering's program is the scope half of every permission on this record
 * (issues/4) and is always its course's (issues/30), so it is read for `Subject`
 * and never rendered; the course's state is the `retry` invariant's predicate
 * (issues/14), read so a greyed control can carry the reason. A row that
 * rendered either would be saying something the two views agreed not to say.
 */
export type OfferingRowSource = {
  offeringId: number;
  sectionNumber: string;
  status: string | null;
  mode: string | null;
  enrollmentLimit: number | null;
  programCode: string;
  courseStatus: string | null;
  roster: RosterJson;
  meetings: MeetingJson;
  foreignTags: ForeignTagJson;
};

/**
 * One database row plus the stitched directory, as the row a page renders.
 *
 * The netids it resolves must already be in the `directory` the caller built:
 * the stitch is **one** query per page over every netid the page will display,
 * and resolving one here would be the per-row cross-project lookup issues/9
 * forbids. `Directory` is total, so nothing here can decline to answer and no
 * roster entry can go missing (issues/9, issues/15).
 */
export function asLineupRow(
  row: OfferingRowSource,
  directory: Directory,
  facts: ActorFacts,
): LineupRow {
  const status = row.status as OfferingState;
  const roster = row.roster.map((entry) => ({
    position: entry.position,
    ...directory(entry.netid),
  }));

  // **The lead is whoever holds position 0, never `roster[0]`** (issues/61), and
  // the same call answers both questions: who scopes the lead-only permissions,
  // and whether there is anybody there at all.
  const lead = leadOf(roster)?.netid ?? null;

  return {
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
    actions: canEverAct(facts)
      ? offeringActionsFor(
          status,
          { programCode: row.programCode, courseStatus: row.courseStatus },
          lead,
          facts,
        )
      : null,
  };
}

/**
 * Every netid a set of section rows will display — the rosters, and the granter
 * of every seat-sharing tag. issues/40 found the chip had been rendering without
 * one, which hid the only cross-program act in the system behind the one control
 * designed to be read at a glance.
 *
 * It asks for the two child sets and not for a whole row, so a caller can gather
 * netids from rows it has not finished building — which is what the Course page
 * does, holding the course's state to one side.
 */
export function netidsOn(
  rows: readonly Pick<OfferingRowSource, "roster" | "foreignTags">[],
): readonly Netid[] {
  return rows.flatMap((row) => [
    ...row.roster.map((entry) => entry.netid),
    ...row.foreignTags.map((tag) => tag.grantedBy),
  ]);
}

// ---------------------------------------------------------------------------
// The read tier, as a state set
// ---------------------------------------------------------------------------

/**
 * **The read tier, as a state set** (issues/28).
 *
 * `offering` is Tier 1 in `COMMITTED_STATES` — *an instructor agreed to teach
 * this, or did once* — and Tier 2 in the six states that are the department's
 * staffing process. The Tier 2 predicate is `canEverAct`, read off `READ_TIERS`
 * in `db/read/shape.ts` rather than restated as a list of roles, and it is the
 * same predicate that decides whether the Actions column exists: `student` and
 * `advisor` are exactly issues/8's two empty rows.
 *
 * The narrowing happens **in the query** on both pages, so invisibility is never
 * something a page has to remember to honour (issues/9).
 */
export function visibleOfferingStates(
  facts: ActorFacts,
  chosen: readonly OfferingState[] | null = null,
): readonly OfferingState[] {
  const allowed: readonly OfferingState[] = canEverAct(facts) ? OFFERING_STATES : COMMITTED_STATES;
  return chosen === null ? allowed : allowed.filter((state) => chosen.includes(state));
}

// ---------------------------------------------------------------------------
// The per-row permitted-action set
// ---------------------------------------------------------------------------

/**
 * **Machine legality AND invariants AND permissions, intersected here** — the same
 * three terms in the same order as `applyTransition`, computed one step earlier
 * so a row can say what it offers before anybody clicks (issues/28, issues/37).
 *
 * **Exported, because a class now has two screens** (issues/84). The Lineup row
 * renders this set as `⋯ n` and the Offering page's rail renders it as buttons
 * with the refusals stated beneath — two treatments of one set, never two sets.
 * A second intersection here would be the drift issues/14 exists to prevent, one
 * screen offering a move the other refuses, neither of them the writer's answer;
 * it is the same reason `courseActionsFor` is shared by the Catalog and the
 * Course page.
 *
 * Every move the machine offers from this state and the action layer exposes is
 * listed, the permitted ones clickable and the refused ones carrying their reason.
 * A move the machine does not offer at all is **absent** rather than greyed — the
 * state is not a refusal, it is the shape of the lifecycle — so `Concluded` and
 * `Dead`, being final, carry no menu at all.
 *
 * The `retry` guard is the one invariant an Offering row carries, and its refusal
 * is `courseRetired`'s sentence rather than one written here, so what the greyed
 * control says and what the writer throws cannot drift apart. It is checked
 * **before** the permission term, in the writer's own order: a director looking at
 * a revivable section of a retired course is told the course is retired, which is
 * the thing they can act on, rather than being told the move is theirs.
 */
export function offeringActionsFor(
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
// nothing else: every one of them is mapped into the row type above before it
// leaves this module, so no caller ever sees a nullable column it has to
// re-discriminate.

export type RosterJson = readonly { position: number; netid: string }[];

export type ForeignTagJson = readonly {
  programCode: string;
  name: string;
  grantedBy: string;
  grantedAt: string;
}[];

export type MeetingJson = readonly {
  kind: string;
  dayOfWeek: number | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
}[];

/**
 * `offering_meeting`'s nullable columns back into the discriminated union, which is
 * the one direction that matters: the **kind is declared** and this switch reads it
 * rather than inferring it from which columns are filled — the exact legacy failure
 * issues/10 declared the column to fix.
 *
 * `time` and `date` arrive as strings, and the seconds on a `time` are trimmed here
 * rather than in the renderer: *18:30* and *18:30:00* are the same fact, and a
 * renderer that trims is a renderer that has to know the column type.
 *
 * **Exported for the Offering page** (issues/84), which composes its own record
 * rather than a `LineupRow` and would otherwise be a second reading of a declared
 * column — the exact thing issues/10 declared the column to stop.
 */
export function asMeeting(row: MeetingJson[number]): Meeting {
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
