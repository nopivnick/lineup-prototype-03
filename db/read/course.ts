import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import {
  course,
  courseProposal,
  courseProposalReview,
  courseTransition,
  offering,
} from "@/db/classes/schema";
import { classesDb } from "@/db/handles";
import type { ActorFacts } from "@/db/write/rules";
import type { Netid } from "@/db/write/transaction";
import type { Actor } from "@/lib/auth/actor";
import type { CourseState } from "@/lib/machines/course.machine";
import { LIVE_STATES } from "@/lib/machines/offering.machine";

import { getActorFacts } from "./actor-facts";
import {
  COURSE_TAGS,
  courseActionsFor,
  notOfferableYet,
  type CourseEventName,
  type NotOfferableYet,
} from "./course-rows";
import {
  asLineupRow,
  netidsOn,
  OFFERING_CHILDREN,
  visibleOfferingStates,
  type LineupRow,
  type OfferingRowSource,
} from "./offering-rows";
import {
  canEverAct,
  editAffordanceFor,
  type EditAffordance,
  type History,
  type HistoryLine,
  type LastChanged,
  type OwnTag,
  type PermittedAction,
  type Visible,
} from "./shape";
import {
  stitchPeople,
  type Directory,
  type StitchedName,
  type StitchedPerson,
} from "./stitch";

/**
 * **The Course page — and with it the page conventions every later detail page
 * inherits wholesale** (issues/41, issues/42, issues/62, issues/83).
 *
 * The shape is one sentence: **the record on the left, what you may do about it
 * on the right in a sticky rail, and its history in sentences at the bottom.**
 * The rail is the only shape in which refusals-in-the-open stay in view while the
 * record is read, which is issues/40's reason for buying a page rather than a
 * drawer, taken literally.
 *
 * Four things about this module are structural rather than conventional.
 *
 * **`Visible` is used for a course that does not exist, and never for a course
 * you may not see.** `course` is Tier 1 — readable by any signed-in netid — so
 * there is nothing here for the tier to hide. A page still has a URL and still
 * has to answer, so the shape is the same as the Offering page's, and the answer
 * a reader gets **names no state**: saying `Declined` would leak exactly what
 * hiding it is for. The wording lives in the page, per `RENDERED_ELSEWHERE`.
 *
 * **The sections are the Lineup's rows, term-grouped, newest first.** They are
 * assembled by `db/read/offering-rows.ts` and not here: a second assembly would
 * be a second intersection of machine legality, invariants and permissions, and
 * two screens offering different moves on one class is the drift issues/14
 * exists to prevent. The page stays **term-less** — the grouping displays the
 * offerings' own key and is not a term selector, because issues/3 deferred term
 * dates and *current* is therefore not computable.
 *
 * **`getCoursePage` computes the edit affordance, and there is no read module
 * for `/courses/:id/edit`** (issues/62). The record page is what needs it — the
 * `Edit` control with its count, and where nothing is yours every class's
 * refusal instead — so an edit module would return a subset of what this one
 * already returns.
 *
 * **Three `classes` statements and one `people` statement**, none of them per
 * row: the course with its two tag sets and the proposal it was minted from; its
 * sections with their children aggregated as JSON; its transition log; and then
 * every netid the page will display, resolved together. `db/read/course.test.ts`
 * counts them. The log is **not read at all** for a reader who has no history
 * section, which is issues/38's *a refusal with no control is dead text* applied
 * to a query.
 */
export async function getCoursePage(
  courseId: string,
  actor: Actor,
): Promise<Visible<CoursePage>> {
  const id = Number(courseId);
  // A URL is a public input. A course id that is not a number is not a course
  // that is hidden — it is a course that does not exist, which is the same
  // answer, in the same words, and it is reached without a query.
  if (!Number.isSafeInteger(id)) return { visible: false };

  const facts = await getActorFacts(actor.netid);

  // **Each statement takes the handle for itself**, as `db/read/lineup.ts` does
  // and `db/read/catalog.ts` does not. It is free — `classesDb()` memoises the
  // one instance — and it is what makes `db/read/course.test.ts`'s round-trip
  // count a count of *statements* rather than of how many local variables this
  // module happens to keep.
  const [record] = await classesDb()
    .select({
      courseId: course.courseId,
      courseNumber: course.courseNumber,
      title: course.title,
      description: course.description,
      credits: course.credits,
      url: course.url,
      edition: course.edition,
      status: course.status,
      programCode: course.programCode,
      areaHead: course.areaHead,
      createdBy: course.createdBy,
      createdAt: course.createdAt,
      updatedBy: course.updatedBy,
      updatedAt: course.updatedAt,

      // issues/42's provenance column. `NOT NULL` since issues/49 — every course
      // is minted through a proposal and an approving review, so this join can
      // never drop the row it is reading.
      reviewId: courseProposalReview.courseProposalReviewId,
      reviewProgramCode: courseProposalReview.programCode,

      // The shared body, read so the drift line below can compare it. The mint
      // **copies** (issues/7), so these three columns and the course's own three
      // are free to disagree, and nothing else in the system records that they do.
      proposalTitle: courseProposal.title,
      proposalDescription: courseProposal.description,
      proposalCredits: courseProposal.credits,

      // The course's own two tag sets, read the way the Lineup's group header
      // reads them, because they are the same two lists.
      ...COURSE_TAGS,
    })
    .from(course)
    .innerJoin(
      courseProposalReview,
      eq(courseProposalReview.courseProposalReviewId, course.mintedFromReviewId),
    )
    .innerJoin(
      courseProposal,
      eq(courseProposal.courseProposalId, courseProposalReview.courseProposalId),
    )
    .where(eq(course.courseId, id));

  if (!record) return { visible: false };

  const status = record.status as CourseState;

  // **The tier narrows in the query**, as it does on the Lineup, so invisibility
  // is never something this page has to remember to honour (issues/9). A
  // `student` therefore sees a course's committed sections and nothing of the
  // staffing process behind them — and a course whose every section is outside
  // the tier reads as *never offered*, which is issues/28's requirement that
  // *never offered* and *offered and killed* stay indistinguishable, arrived at
  // from the other side.
  const sectionRows = await classesDb()
    .select({
      offeringId: offering.offeringId,
      sectionNumber: offering.sectionNumber,
      status: offering.status,
      mode: offering.mode,
      enrollmentLimit: offering.enrollmentLimit,
      programCode: offering.programCode,
      termCode: offering.termCode,
      ...OFFERING_CHILDREN,
    })
    .from(offering)
    .where(
      and(
        eq(offering.courseId, id),
        inArray(offering.status, [...visibleOfferingStates(facts)]),
      ),
    )
    // **Newest term first**, which `term_code` sorts by directly: issues/3
    // deferred term dates, and the code's own CHECK ties it to `year` and
    // `semester`, so a lexical descending sort **is** chronological. Sections
    // within a term stay in section-number order, as they are everywhere else.
    .orderBy(desc(offering.termCode), asc(offering.sectionNumber));

  const speaks = canEverAct(facts);

  // **The log is read only for a reader who has a history section** (issues/28's
  // Tier 2, issues/38's conditional dependency reads). A `student` and an
  // `advisor` get no history at all — absent, not empty — so a query issued for
  // them would buy a round trip to build something nobody may read.
  const moves = speaks
    ? await classesDb()
        .select({
          event: courseTransition.event,
          fromState: courseTransition.fromState,
          toState: courseTransition.toState,
          actorNetid: courseTransition.actorNetid,
          subjectNetid: courseTransition.subjectNetid,
          reason: courseTransition.reason,
          at: courseTransition.at,
        })
        .from(courseTransition)
        .where(eq(courseTransition.courseId, id))
        // Oldest first — a history is read forwards — and the key breaks ties,
        // because two moves in one transaction share a timestamp and an
        // arbitrary order would be a different story on every render.
        .orderBy(asc(courseTransition.at), asc(courseTransition.courseTransitionId))
    : [];

  // **The stitch's one query**, over every netid this page will display: the area
  // head, every roster row and seat-sharing granter on every section, and the
  // actor and subject of every history line plus whoever created the course.
  // Gathered and asked once — one extra query per page, never one per row.
  const directory = await stitchPeople([
    ...(record.areaHead ? [record.areaHead] : []),
    ...netidsOn(sectionRows),
    ...(speaks
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

  const areas = record.areas;

  return {
    visible: true,
    page: {
      courseId: String(record.courseId),
      courseNumber: record.courseNumber,
      title: record.title,
      programCode: record.programCode,
      credits: record.credits,
      edition: record.edition,
      description: record.description,
      url: record.url,
      areas,
      requirementCategories: record.requirementCategories,
      areaHead: record.areaHead ? directory(record.areaHead) : null,
      notOfferableYet: notOfferableYet(areas.length, record.areaHead),
      status,
      sections: byTerm(sectionRows, record.status, named, facts),
      mintedFrom: {
        reviewId: String(record.reviewId),
        programCode: record.reviewProgramCode,
        bodyHasDriftedSince:
          record.proposalTitle !== record.title ||
          record.proposalDescription !== record.description ||
          record.proposalCredits !== record.credits,
      },
      actions: speaks
        ? courseActionsFor(
            status,
            { programCode: record.programCode, areaHead: record.areaHead },
            liveOf(sectionRows),
            facts,
          )
        : null,
      edit: speaks
        ? editAffordanceFor(
            "course",
            facts,
            { course: { programCode: record.programCode, areaHead: record.areaHead } },
            { course: record.status },
          )
        : null,
      lastChanged:
        speaks && record.updatedBy && record.updatedAt
          ? { by: named(record.updatedBy), at: record.updatedAt.toISOString() }
          : null,
      history: speaks
        ? {
            creation: { by: named(record.createdBy), at: record.createdAt.toISOString() },
            moves: moves.map(
              (move): HistoryLine => ({
                event: move.event,
                fromState: move.fromState,
                toState: move.toState,
                actor: named(move.actorNetid),
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

// ---------------------------------------------------------------------------
// The composed page
// ---------------------------------------------------------------------------

/**
 * **The page is term-less and its sections are term-grouped** — the grouping is a
 * display of the offerings' own key, not a term selector (issues/41). *Current
 * and next term only* was rejected on a fact the map has hit twice: issues/3
 * deferred term dates, so **"current" is not computable**.
 */
export type CoursePage = {
  courseId: string;
  courseNumber: string;
  title: string;
  programCode: string;
  credits: number;
  /**
   * Restored to a reader here. issues/10 stored `edition` against the
   * recommendation, at the requester's direction, because *the number is read by
   * people*; issues/37 then dropped it from the one view where people would have
   * read it. It sits beside the approval history that explains it, which is
   * closer to the original argument than a Catalog row ever was.
   */
  edition: number;
  description: string | null;
  url: string | null;
  areas: readonly OwnTag[];
  requirementCategories: readonly OwnTag[];
  /**
   * **One of the two places a person is presented as a person**, so it carries
   * pronouns (issues/40). The other is the roster on an Offering page; a history
   * line is not one, where pronouns would read as noise.
   */
  areaHead: StitchedPerson | null;
  notOfferableYet: NotOfferableYet;
  status: CourseState;
  /**
   * Grouped by term, newest first, reusing the Lineup's grouping device so the
   * two views rhyme. Each row carries the same `↗`, so the Course page is the
   * second place a class page is reached from.
   */
  sections: readonly CourseSectionGroup[];
  /**
   * The review whose `approve` minted this course, and whether the shared
   * proposal body still says what the course says (issues/42, issues/49).
   *
   * **The drift line is the half that matters.** The body can be edited
   * legitimately after one program has already minted from it, because the mint
   * **copies** (issues/7) — and whoever is about to schedule or teach the course
   * is never on the proposal screen. It is reachable at all only because
   * issues/42 added `course.minted_from_review_id`.
   */
  mintedFrom: { reviewId: string; programCode: string; bodyHasDriftedSince: boolean };
  /** **Absent — not empty — for an actor who can never act** (issues/37, issues/38). */
  actions: readonly PermittedAction<CourseEventName>[] | null;
  /** Absent with `actions`, and for the same reason: a refusal with no control is dead text. */
  edit: EditAffordance | null;
  /**
   * *Last changed*, and **`null` carries two facts the page tells apart by
   * looking at `history`**: for a reader with a history section it means *never
   * changed since it was created*, which the page states in words rather than as
   * an empty box; for a `student` or an `advisor` the box is not rendered at all,
   * being the same class of fact as the history and hidden with it (issues/28's
   * Tier 2). Nothing about `updated_by` reaches such a reader.
   */
  lastChanged: LastChanged;
  /** **Absent, not empty**, for `student` and `advisor` — Tier 2's boundary (issues/41). */
  history: History | null;
};

/**
 * One term's sections. A group with no sections cannot occur — the group is built
 * from the rows, so a term the tier hides entirely is simply not a term this page
 * mentions, which is the Lineup's *no empty groups* rule arriving by the same
 * construction rather than by a second check.
 */
export type CourseSectionGroup = { termCode: string; offerings: readonly LineupRow[] };

// ---------------------------------------------------------------------------
// The pieces
// ---------------------------------------------------------------------------

type SectionRow = Omit<OfferingRowSource, "courseStatus"> & { termCode: string };

function byTerm(
  rows: readonly SectionRow[],
  courseStatus: string | null,
  directory: Directory,
  facts: ActorFacts,
): readonly CourseSectionGroup[] {
  const groups = new Map<string, LineupRow[]>();

  for (const row of rows) {
    // The course's own state, which the `retry` invariant is a predicate over
    // (issues/14). It is the same value for every section here, so it is carried
    // in rather than joined per row.
    const offerings = groups.get(row.termCode) ?? [];
    groups.set(row.termCode, offerings);
    offerings.push(asLineupRow({ ...row, courseStatus }, directory, facts));
  }

  return [...groups].map(([termCode, offerings]) => ({ termCode, offerings }));
}

/**
 * The classes the `retire` invariant is a predicate over, **read off the sections
 * this page already has** rather than asked for a second time.
 *
 * It is only ever consulted for a reader whose `actions` exist, and such a reader
 * is outside no tier, so the rows here are every offering of the course — the
 * same set `db/read/catalog.ts` asks its own question of, and the same set the
 * machine's `noLiveOfferings` guard is handed at the moment of the click.
 *
 * **Sorted by term**, because the list *is* the refusal's content and the Catalog
 * states it in that order: two orderings of the same rows are two refusals as far
 * as a reader is concerned (issues/38).
 */
function liveOf(rows: readonly SectionRow[]): readonly { termCode: string; status: string }[] {
  const live: readonly string[] = LIVE_STATES;
  return rows
    .filter((row) => live.includes(row.status ?? ""))
    .map((row) => ({ termCode: row.termCode, status: row.status ?? "" }))
    .sort((left, right) => left.termCode.localeCompare(right.termCode));
}
