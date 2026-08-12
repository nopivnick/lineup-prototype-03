import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { course, offering, offeringTransition, term } from "@/db/classes/schema";
import { classesDb } from "@/db/handles";
import { termLabel, type ActorFacts } from "@/db/write/rules";
import type { Netid } from "@/db/write/transaction";
import type { Actor } from "@/lib/auth/actor";
import type { OfferingState } from "@/lib/machines/offering.machine";
import { leadOf } from "@/lib/roster";

import { getActorFacts } from "./actor-facts";
import {
  asMeeting,
  netidsOn,
  offeringActionsFor,
  OFFERING_CHILDREN,
  visibleOfferingStates,
  type OfferingEventName,
} from "./offering-rows";
import {
  canEverAct,
  editAffordanceFor,
  type EditAffordance,
  type ForeignTag,
  type History,
  type HistoryLine,
  type LastChanged,
  type Meeting,
  type PermittedAction,
  type Visible,
} from "./shape";
import { stitchPeople, type StitchedName, type StitchedPerson } from "./stitch";

/**
 * **The Offering page — *a class*, in the department's words** (issues/41,
 * issues/62, issues/84).
 *
 * It is the sixth view-shaped read module and it takes the Course page's
 * conventions unchanged: the record on the left, what you may do about it on the
 * right in a sticky rail, the history in sentences at the foot of the main
 * column. Two things here are new, and neither is cosmetic.
 *
 * **This is the read that can be refused on the record itself.** `course` is
 * Tier 1, so `getCoursePage`'s `{ visible: false }` only ever means *there is no
 * such course*; `offering` is Tier 2 in the six states that are the department's
 * staffing process, so here the same answer covers two different worlds — a
 * class that does not exist, and a class a `student` may not see. **They are the
 * same answer in the same words on purpose**: the refusal **names no state**,
 * because saying `Declined` leaks exactly what hiding it is for, and *not
 * visible to you* was rejected for confirming that a section exists at that
 * number, which is half the same leak.
 *
 * The mechanism is that **the tier narrows in the query** — `visibleOfferingStates`,
 * the same call `db/read/lineup.ts` and `db/read/course.ts` make — so a hidden
 * class is not a row this module then has to remember to withhold (issues/9). It
 * is also what makes the criterion *the same predicate thins the sibling list on
 * the page it refuses from* true by construction rather than by agreement: the
 * Course page's section list and this page's visibility are one predicate, so a
 * section absent from that list is a section this page refuses, and there is no
 * shape in which a reader is offered a link that then declines to open.
 *
 * **The history names the person an act was about, not whoever holds the seat
 * now.** The roster is present-tense and the log is not, so `offer` and `accept`
 * carry `subject_netid` (issues/41 amending issues/15) and the sentences read it
 * rather than reading position 0: after a withdraw-and-re-offer, position 0 holds
 * somebody who was never the subject of the first offer, and a page reading the
 * roster would attribute one act to nobody and the next to the wrong person.
 *
 * **Two `classes` statements and one `people` statement**, and the second
 * `classes` statement is the log, which is **not read at all** for a reader with
 * no history section (issues/38's *a refusal with no control is dead text*,
 * applied to a query). `db/read/offering.test.ts` counts them.
 */
export async function getOfferingPage(
  offeringId: string,
  actor: Actor,
): Promise<Visible<OfferingPage>> {
  // A URL is a public input, so what counts as a class id is stated rather than
  // left to `Number`, which reads `" 12 "`, `"1e3"` and `"0x0c"` as classes. The
  // answer for an address that is not an id at all is the answer for one that
  // names a class the reader may not see — the same words, reached without a
  // query, which is the whole of *the refusal names no state*.
  //
  // **Leading zeros are refused**, which is issues/83's own stated rule — *one
  // record has exactly one address* — held to one digit further than the pattern
  // it shipped with. `/classes/007` rendering the same class as `/classes/7`
  // gives a record countably many addresses, and the Server Action revalidates
  // the canonical one: a reader who fired a move from the odd address would sit
  // looking at a page known to be stale. `db/read/course.ts` says the same.
  if (!CLASS_ID.test(offeringId)) return { visible: false };
  const id = Number(offeringId);
  if (!Number.isSafeInteger(id)) return { visible: false };

  const facts = await getActorFacts(actor.netid);

  const [record] = await classesDb()
    .select({
      offeringId: offering.offeringId,
      sectionNumber: offering.sectionNumber,
      status: offering.status,
      mode: offering.mode,
      enrollmentLimit: offering.enrollmentLimit,
      callNumber: offering.callNumber,
      sisClassNumber: offering.sisClassNumber,
      url: offering.url,
      programCode: offering.programCode,
      createdBy: offering.createdBy,
      createdAt: offering.createdAt,
      updatedBy: offering.updatedBy,
      updatedAt: offering.updatedAt,

      // issues/30's composite foreign key used as the join it was bought to make
      // safe: an offering's program is always its course's, so the second clause
      // can never narrow anything and says so.
      courseId: course.courseId,
      courseNumber: course.courseNumber,
      title: course.title,
      credits: course.credits,
      // The `retry` invariant's predicate (issues/14), read so a greyed control
      // can carry the writer's own reason rather than a second copy of it.
      courseStatus: course.status,

      termCode: offering.termCode,
      // *Fall 2025* out of the two columns that make it, through the label
      // builder both sides of a refusal already read (issues/38). `term_code` is
      // a join key and *20253* is not a thing to put in front of a reader.
      termYear: term.year,
      termSemester: term.semester,

      ...OFFERING_CHILDREN,
    })
    .from(offering)
    .innerJoin(
      course,
      and(eq(course.courseId, offering.courseId), eq(course.programCode, offering.programCode)),
    )
    .innerJoin(term, eq(term.code, offering.termCode))
    .where(
      and(
        eq(offering.offeringId, id),
        // **The tier, in the query.** A class outside it is not a row this
        // module then withholds — it is a row that was never read, which is the
        // same shape the Lineup and the Course page narrow with, and therefore
        // the same predicate that thins the sibling list this page is reached
        // from (issues/9, issues/28, issues/41).
        inArray(offering.status, [...visibleOfferingStates(facts)]),
      ),
    );

  if (!record) return { visible: false };

  const status = record.status as OfferingState;

  // **Tier 2's boundary, asked once.** It gates the actions, the edit
  // affordance, the *last changed* stamp and the history together — and the log
  // query with them — because they are one class of fact: *if you can do
  // nothing, you may not see the record of who did* (issues/28, issues/41).
  const mayAct = canEverAct(facts);

  const moves = mayAct
    ? await classesDb()
        .select({
          event: offeringTransition.event,
          fromState: offeringTransition.fromState,
          toState: offeringTransition.toState,
          actorNetid: offeringTransition.actorNetid,
          subjectNetid: offeringTransition.subjectNetid,
          reason: offeringTransition.reason,
          at: offeringTransition.at,
        })
        .from(offeringTransition)
        .where(eq(offeringTransition.offeringId, id))
        // Oldest first — a history is read forwards — and the key breaks ties,
        // because two moves in one transaction share a timestamp and an
        // arbitrary order would be a different story on every render.
        .orderBy(asc(offeringTransition.at), asc(offeringTransition.offeringTransitionId))
    : [];

  // **The stitch's one query**, over every netid this page will display: the
  // roster, the granter of every seat-sharing tag, and — for a reader with a
  // history section — whoever created the class, whoever last changed it, and
  // **both** the actor and the subject of every logged move. Gathered and asked
  // once, never one lookup per row.
  const directory = await stitchPeople([
    ...netidsOn([record]),
    ...(mayAct
      ? [
          record.createdBy,
          ...(record.updatedBy ? [record.updatedBy] : []),
          ...moves.flatMap((move) =>
            move.subjectNetid ? [move.actorNetid, move.subjectNetid] : [move.actorNetid],
          ),
        ]
      : []),
  ]);

  const named = (netid: Netid): StitchedName => {
    const person = directory(netid);
    return { netid: person.netid, displayName: person.displayName };
  };

  /**
   * **The roster in `position` order, each row carrying its own `position`**
   * (issues/61). The order is the aggregate's — `OFFERING_CHILDREN` sorts by
   * position in SQL — and the gap at 0 is preserved rather than closed, because
   * `decline` and `withdraw` each `DELETE` position 0 and leave everything below
   * it. **Pronouns show here**: this is one of the two places a person is
   * presented as a person rather than as the subject of a timestamp (issues/40).
   */
  const roster: readonly OfferingRosterEntry[] = record.roster.map((entry) => ({
    position: entry.position,
    ...directory(entry.netid),
  }));

  // **The lead is whoever holds position 0, never `roster[0]`** (issues/61), and
  // the same call answers both questions the page has: who scopes the lead-only
  // permissions, and whether there is anybody there at all.
  const lead = leadOf(roster)?.netid ?? null;

  return {
    visible: true,
    page: {
      offeringId: String(record.offeringId),
      course: {
        courseId: String(record.courseId),
        courseNumber: record.courseNumber,
        title: record.title,
        credits: record.credits,
        programCode: record.programCode,
      },
      termCode: record.termCode,
      termLabel: termLabel({ year: record.termYear, semester: record.termSemester }),
      sectionNumber: record.sectionNumber,
      status,
      roster,
      meetings: record.meetings.map(asMeeting),
      mode: record.mode,
      enrollmentLimit: record.enrollmentLimit,
      callNumber: record.callNumber,
      sisClassNumber: record.sisClassNumber,
      url: record.url,
      foreignTags: record.foreignTags.map((tag) => ({
        programCode: tag.programCode,
        name: tag.name,
        grantedBy: named(tag.grantedBy),
        grantedAt: tag.grantedAt,
      })),
      actions: mayAct
        ? offeringActionsFor(
            status,
            { programCode: record.programCode, courseStatus: record.courseStatus },
            lead,
            facts,
          )
        : null,
      edit: mayAct
        ? editAffordanceFor(
            "offering",
            facts,
            {
              offering: { programCode: record.programCode, lead },
              tagProgramCode: aTagThisActorCouldWrite(facts, record.programCode),
            },
            { offering: status },
          )
        : null,
      lastChanged:
        mayAct && record.updatedBy && record.updatedAt
          ? { by: named(record.updatedBy), at: record.updatedAt.toISOString() }
          : null,
      history: mayAct
        ? {
            creation: { by: named(record.createdBy), at: record.createdAt.toISOString() },
            moves: moves.map(
              (move): HistoryLine => ({
                event: move.event,
                fromState: move.fromState,
                toState: move.toState,
                actor: named(move.actorNetid),
                // **The person the act was about** (issues/41). Present on
                // `staff`, `unstaff`, `offer`, `accept`, `decline` and
                // `withdraw`, and `null` on everything else — which is a fact
                // about the event and not a gap in the log.
                subject: move.subjectNetid ? named(move.subjectNetid) : null,
                reason: move.reason,
                at: move.at.toISOString(),
              }),
            ),
          }
        : null,
    },
  };
}

/**
 * A record's address: the digits of its id and nothing else — no sign, no space,
 * no leading zero. `0` is allowed through and simply names nothing, both id
 * columns being `GENERATED ALWAYS AS IDENTITY` from 1; a pattern that special-
 * cased it would be refusing a row on arithmetic rather than on addressing.
 */
const CLASS_ID = /^(?:0|[1-9][0-9]*)$/;

/**
 * **The one field class whose scope points away from the record, answered at the
 * record's level** (issues/25, issues/30, issues/62, issues/84).
 *
 * Every other class on a rail is a question about *this record*, so the subject
 * is the record's and `editAffordanceFor` asks once. **Seat-sharing tags is a
 * question about a row that does not exist yet**: the scope comes from the tag's
 * own program, because whoever authors the claim writes the row, and
 * `writeFields` therefore evaluates the arm **once per row against that row's
 * program**. A record page has no row in hand, and the naive reading — pass no
 * `tagProgramCode` and let both routes fail — states a refusal the writer would
 * not throw: IMA's director opening ITP's class is told the tags are not theirs,
 * and `writeFields` would accept exactly that write from them. That is the
 * read/write drift `EditAffordance` exists to prevent, arriving through the one
 * class shaped differently from the other thirteen.
 *
 * So the question the rail can honestly ask is **is there any tag this actor
 * could write here**, and the answer is *any program they direct that is not
 * this class's own* — the writer refuses a class sharing seats with its own
 * program, so the record's program is not a candidate however senior the reader.
 *
 * Which candidate is picked never reaches a reader: where one exists the class
 * is **open** and no sentence is rendered, and where none does the refusal falls
 * back to `describe`'s program-less wording. It is sorted anyway, because a
 * refusal that varied with `Set` iteration order would be a different page on
 * two renders.
 *
  * The chair needs none of this — `permitted()`'s own clause sits ahead of the
  * routes — so where the chair bypass applies, `tagProgramCode` is ignored and the
  * class is open regardless.
 */
function aTagThisActorCouldWrite(facts: ActorFacts, ownProgramCode: string): string | undefined {
  return [...facts.directorOf].filter((code) => code !== ownProgramCode).sort()[0];
}

// ---------------------------------------------------------------------------
// The composed page
// ---------------------------------------------------------------------------

/**
 * One class, as its own page renders it.
 *
 * It carries **more of `offering` than a section row does** and that is the
 * whole difference between the two: `db/read/offering-rows.ts` holds what
 * differs between sibling sections in a list, and `call_number`,
 * `sis_class_number` and `url` are facts nobody scans a list for. The course's
 * own facts are here for the same reason they are on the Lineup's group header
 * and not on its rows — stated once, at the top, with a link up to the course.
 */
export type OfferingPage = {
  offeringId: string;
  /** Course facts and the link up to the Course page (issues/41). */
  course: {
    courseId: string;
    courseNumber: string;
    title: string;
    credits: number;
    programCode: string;
  };
  termCode: string;
  /**
   * *Fall 2025*, built by `termLabel` in `db/write/rules.ts` — the one place the
   * pair of columns becomes a sentence, so a refusal listing a term and a page
   * heading naming one read the same. It rides on the page rather than being
   * looked up by the renderer, which is what keeps this read at two `classes`
   * statements.
   */
  termLabel: string;
  sectionNumber: string;
  status: OfferingState;
  /**
   * **Rows carrying their own `position`, in position order** (issues/61). The
   * lead is whoever holds 0, which may be nobody while rows sit below — the
   * shape `decline` and `withdraw` produce, and the one the renderer reads
   * through `rosterShape` rather than through `roster[0]`.
   */
  roster: readonly OfferingRosterEntry[];
  meetings: readonly Meeting[];
  mode: string | null;
  enrollmentLimit: number | null;
  callNumber: string | null;
  sisClassNumber: number | null;
  url: string | null;
  /** *Also counts toward* — the one place a program other than the record's own appears (issues/25, issues/30). */
  foreignTags: readonly ForeignTag[];
  /** **Absent — not empty — for an actor who can never act** (issues/37, issues/38). */
  actions: readonly PermittedAction<OfferingEventName>[] | null;
  /** Absent with `actions`, and for the same reason: a refusal with no control is dead text. */
  edit: EditAffordance | null;
  /**
   * *Last changed*, and **`null` carries two facts the page tells apart by
   * looking at `history`** (issues/41): with a history section it means *never
   * changed since it was created*, which the page states in words; for a
   * `student` or an `advisor` the box is not rendered at all.
   */
  lastChanged: LastChanged;
  /** **Absent, not empty**, for `student` and `advisor` — Tier 2's boundary (issues/41). */
  history: History | null;
};

/**
 * A roster entry, and **pronouns show here** — one of the two places a person is
 * presented as a person rather than as a fact about a record (issues/40). The
 * other is the area head on a Course page; the Lineup's `LineupRosterEntry` is
 * the same row without them, because a list is not one of the two.
 */
export type OfferingRosterEntry = { position: number } & StitchedPerson;
