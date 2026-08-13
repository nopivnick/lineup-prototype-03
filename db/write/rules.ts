import "server-only";

import { and, asc, eq, inArray, ne } from "drizzle-orm";

import { course, offering, offeringInstructor, programDirector, term, userRole } from "@/db/classes/schema";
import { peopleDb } from "@/db/handles";
import { person } from "@/db/people/schema";
import { LIVE_STATES } from "@/lib/machines/offering.machine";
import {
  FIELD_CLASSES,
  MATRICES,
  NOBODY,
  type ClassifiedField,
  type FieldClass,
  type MachineName,
  type Role,
  type Route,
} from "@/lib/permissions";

import { refusal, type Refusal } from "./refusal";
import type { ClassesTx, Netid } from "./transaction";

/**
 * **What the writer knows about the actor, read inside the locking transaction**
 * (issues/28, confirming issues/11).
 *
 * `actor` is a bare netid end to end. Roles are never carried in from request
 * scope: `getActor()` runs before the transaction opens, and a role set resolved
 * there would be stale by the time a writer used it — the chair may have revoked
 * a grant in between, and the whole point of the lock is that the row and the
 * rules are read together.
 *
 * The **enforcement read is subject to no tier** (issues/34): it happens before
 * authorization exists and cannot be gated by a rule that depends on its own
 * result.
 */
export type ActorFacts = {
  netid: Netid;
  roles: ReadonlySet<Role>;
  /** Every `program_director(program_code, netid)` row naming this netid. */
  directorOf: ReadonlySet<string>;
};

export async function readActorFacts(tx: ClassesTx, netid: Netid): Promise<ActorFacts> {
  // Sequentially, not in parallel: a postgres.js transaction is one connection,
  // and two statements racing on it is not a thing a transaction can do.
  const roles = await tx.select({ role: userRole.role }).from(userRole).where(eq(userRole.netid, netid));
  const directorships = await tx
    .select({ programCode: programDirector.programCode })
    .from(programDirector)
    .where(eq(programDirector.netid, netid));

  return {
    netid,
    roles: new Set(roles.map((row) => row.role as Role)),
    directorOf: new Set(directorships.map((row) => row.programCode)),
  };
}

/**
 * Whether a **subject** holds a role — standing principle 6's half of the model
 * (issues/34): the writer of a relationship refuses a subject who does not hold
 * the role that relationship scopes. Read inside the transaction like everything
 * else, and used by `applyTransition`'s `staff` and by the field writer's roster
 * and assignment classes.
 */
export async function holdsRole(tx: ClassesTx, netid: Netid, role: Role): Promise<boolean> {
  const rows = await tx
    .select({ role: userRole.role })
    .from(userRole)
    .where(eq(userRole.netid, netid));
  return rows.some((row) => row.role === role);
}

/**
 * **The one read in a write path that leaves the `classes` project** (issues/9,
 * issues/61, issues/69).
 *
 * A **check, not a constraint**, and it has to be described that way: it cannot
 * join the transaction, because the transaction is on the other database, so a
 * window exists between check and write. Against a recovery path of reseed that
 * is the right trade. On the way **out** the read tolerates and never hides — a
 * roster entry is never dropped for want of a name.
 */
export async function peopleKnows(netid: Netid): Promise<boolean> {
  const rows = await peopleDb()
    .select({ netid: person.netid })
    .from(person)
    .where(eq(person.netid, netid));
  return rows.length > 0;
}

/**
 * The record a permission is scoped **to** — the relationship half of issues/4's
 * conjunction, loaded from the row the writer has already locked.
 *
 * Every field is optional because the routes that read it are: a Course act never
 * asks about an offering's roster, and a review act never asks about a course's
 * area head. A route whose subject is absent is simply not satisfied.
 */
export type Subject = {
  offering?: { programCode: string; lead: Netid | null };
  course?: { programCode: string; areaHead: Netid | null };
  review?: { programCode: string; areaHead: Netid | null; state: string };
  proposal?: { createdBy: Netid };
  /** A seat-sharing tag's **own** program — the one scope that points away from the record (issues/25, issues/30). */
  tagProgramCode?: string;
};

/**
 * **Each `(role, relationship)` conjunction is evaluated independently**
 * (issues/8). Never union the roles first and then check a single scope: a
 * director of ITP who is also area head of an IMA course may re-approve that
 * course by the area-head route, and must not be able to cancel an IMA offering
 * by borrowing the director role's scope.
 */
export function satisfies(route: Route, actor: ActorFacts, subject: Subject): boolean {
  if ("row" in route) {
    // The one arm that is not a role at all — a comparison against a column on
    // the record itself (issues/8, issues/65).
    return subject.proposal?.createdBy === actor.netid;
  }

  if (!actor.roles.has(route.role)) return false;

  switch (route.via) {
    case "flat":
      return true;
    case "offering_instructor position 0 of this offering":
      return subject.offering?.lead === actor.netid;
    case "program_director(offering.program_code)":
      return subject.offering !== undefined && actor.directorOf.has(subject.offering.programCode);
    case "program_director(course.program_code)":
      return subject.course !== undefined && actor.directorOf.has(subject.course.programCode);
    case "program_director(course_proposal_review.program_code)":
      return subject.review !== undefined && actor.directorOf.has(subject.review.programCode);
    case "program_director(course_proposal_review.program_code) of a review that is `Developing`":
      return (
        subject.review !== undefined &&
        subject.review.state === "Developing" &&
        actor.directorOf.has(subject.review.programCode)
      );
    case "program_director(requirement_category.program_code)":
    case "program_director(area.program_code)":
      return subject.tagProgramCode !== undefined && actor.directorOf.has(subject.tagProgramCode);
    case "course.area_head":
      return subject.course?.areaHead === actor.netid;
    case "course_proposal_review.area_head":
      return subject.review?.areaHead === actor.netid;
    case "course_proposal_review.area_head of a review that is `Developing`":
      return subject.review?.areaHead === actor.netid && subject.review.state === "Developing";
  }
}

/**
 * **The chair is one OR-clause ahead of the permission term and of nothing else**
 * (issues/34, issues/42, issues/62).
 *
 * A clause rather than a seventh column of every matrix: a column is a
 * hand-maintained restatement of the word *all*, re-broken by every event added
 * later, where a clause covers new events by construction. It is called at each
 * permission check rather than short-circuiting the writer, so that machine
 * legality, invariants and field-class state gates all run first and all still
 * bind.
 */
export function isChair(actor: ActorFacts): boolean {
  return actor.roles.has("chair");
}

/**
 * The routes one act on one machine reaches, off `MATRICES` rather than out of a
 * `switch` a fourth machine would silently outgrow.
 *
 * **It lives here and not in `apply-transition.ts` because it has two callers.**
 * The writer asks it at the moment of the click; `db/read/catalog.ts` asks it one
 * step earlier, to say ahead of the click what this actor may do — and the two
 * answers being the same function is the whole of what makes the `⋯ n` menu
 * honest (issues/28's *the server computes the set and ships it as data*).
 *
 * An act no row covers reaches `NOBODY`, which is a refusal in its own right.
 */
export function routesFor(machine: MachineName, act: string): readonly Route[] {
  const row = MATRICES[machine].find((entry) => (entry.acts as readonly string[]).includes(act));
  return row?.routes ?? NOBODY;
}

/**
 * **`retire` refused because the course is still being taught** — clause 3 of the
 * refusal wording, *name the dependency and list it* (issues/14, issues/38).
 *
 * The machine's `noLiveOfferings` guard is a predicate over a list it is handed,
 * and this is that same list rendered as the reason. It is shared for the reason
 * the guard's own comment gives: the rule and its explanation must not drift
 * apart, and the read side renders this sentence under a greyed `retire` in the
 * `⋯ n` menu while the writer throws it at whoever clicks anyway.
 */
export function stillTeaching(live: readonly { termCode: string; status: string }[]): Refusal {
  const one = live.length === 1;
  return refusal(
    `This course has ${live.length} ${one ? "class that has" : "classes that have"} not finished teaching.`,
    live.map((offered) => `${offered.termCode} — ${offered.status}`),
  );
}

/**
 * **`retry` refused because the Course has been retired** — the one constraint the
 * Offering lifecycle cannot express (issues/14).
 *
 * Here for the reason `stillTeaching` is here: it has two callers. `applyTransition`
 * throws it at whoever clicks, and `db/read/lineup.ts` renders it under a greyed
 * `retry` in the `⋯ n` menu one step earlier. A second copy of the sentence is how a
 * rule and its explanation drift apart, which is the thing issues/14 exists to
 * prevent.
 *
 * It names **no dependency**, unlike `stillTeaching`: the course is one record and
 * the reader is looking at its own section, so *which* course is not in doubt. It
 * also names no actor, being an invariant — a director cannot revive it either, and
 * neither can the chair.
 */
export function courseRetired(): Refusal {
  return refusal("This class cannot be revived, because its course has been retired.");
}

/**
 * **A class cannot be slated from a retired course** (issues/14, issues/43,
 * issues/89) — `courseRetired`'s sibling, one act along.
 *
 * Here for the reason `stillTeaching` and `courseRetired` are here: **two
 * callers**. `createOffering` throws it at whoever posts the slating form anyway,
 * and the form's course picker states it on the line one step earlier, under an
 * option nobody can choose.
 *
 * It is **not** `courseRetired()` reworded. That one refuses a `retry` on an
 * existing class and says *this class cannot be revived*; this one refuses a
 * class that does not exist yet. A reader meeting them in the two places they
 * appear is looking at two different records, so one sentence covering both would
 * be wrong about whichever it was not written for.
 *
 * It names **no actor**, being an invariant: the chair is refused it too, which
 * `db/write/create-paths.test.ts` asserts of its sibling below.
 */
export function retiredCourseCannotBeOffered(): Refusal {
  return refusal("This course has been retired, so no new class can be scheduled from it.");
}

/**
 * **No area and no area head → no offering** (issues/32, issues/43, issues/89).
 *
 * issues/32 made the two assignments **separate**, so *half missing* is a real
 * state with a sentence of its own — which is the whole reason this takes two
 * booleans rather than one. The Catalog and the Course page already render the
 * same fact as `notOfferableYet`, a marker rather than a refusal; this is the
 * sentence, and it is here for `stillTeaching`'s reason: `createOffering` throws
 * it, and the slating form's course picker carries it on the refused line one step
 * earlier.
 *
 * It names **no actor** and no fix. The assignment is monotone — areas and heads
 * may be swapped but never emptied — which is what makes a create-time check
 * sufficient forever, and it is also why the refusal does not read *yet* as a
 * promise: whether anybody will assign the missing half is not a fact this
 * sentence has.
 */
export function missingAssignments(missingArea: boolean, missingAreaHead: boolean): Refusal {
  const missing = [missingArea ? "area" : null, missingAreaHead ? "area head" : null].filter(
    (absent): absent is string => absent !== null,
  );
  if (missing.length === 0) {
    throw new Error(
      "missingAssignments was asked for the sentence of a course that has both its area and its head (issues/32).",
    );
  }
  return refusal(`This course cannot be scheduled yet: it has no ${missing.join(" and no ")}.`);
}

/**
 * **A proposal asking nobody** — the one rule the propose form's program section
 * is about (issues/43, issues/88).
 *
 * Here for the reason `stillTeaching` and `courseRetired` are here: **two
 * callers**. `createProposal` throws it at whoever posts an empty set anyway, and
 * the form states it under a disabled submit one step earlier — where it is not
 * a validation message but the reason the section exists, since there is no
 * requested-programs table and a proposal with no reviews is a record nothing in
 * the skeleton can reach again.
 *
 * It names **no actor**, being an invariant rather than a permission: the chair
 * is refused it too, which `db/write/create-paths.test.ts` asserts.
 */
export function noProgramsRequested(): Refusal {
  return refusal("A proposal has to ask at least one program to review it.");
}

// ---------------------------------------------------------------------------
// The four revocation refusals — one sentence each, shared by both sides
// ---------------------------------------------------------------------------
//
// `REVOCATION_REFUSALS` in `lib/permissions.ts` states the four predicates;
// these are their wording, and they are here for the reason `stillTeaching` and
// `courseRetired` are here: two callers (issues/34, issues/38, issues/81).
// `db/read/roles.ts` renders them under a control the chair cannot use, and
// `writeFields` throws them at whoever clicks anyway, so a second copy of the
// sentence is how a rule and its explanation drift apart.
//
// **`who` is the caller's best name for the person**, which is the only thing
// that differs between the two: the writer has no directory to resolve a netid
// with — `people` is the other project and no transaction spans the two — so it
// passes the netid, and the read module, which runs the stitch, passes the name.
// That is clause 2 of the refusal wording (*name the person or the role, never
// the rule*) at the two fidelities the two sides can afford.
//
// All four state their **fix** in the second sentence, and none of them names a
// control: *hand those courses to another area head* is a thing to do to the
// world, and whether this skeleton yet has a screen for it is not what the
// refusal is about.

/** One live class blocking an `instructor` revoke. `term` is the reader's label, not the code. */
export type LiveSeat = {
  courseNumber: string;
  sectionNumber: string;
  term: string;
  status: string;
  /** Position 0 — said out loud, because a lead is what the class is waiting on. */
  lead: boolean;
};

/** One non-`Retired` course blocking an `area_head` revoke. */
export type HeadedCourse = { courseNumber: string; title: string; status: string };

/**
 * **The evidence itself is shared too, and not only the sentence** (issues/38).
 *
 * The two queries below are what the three data-backed refusals above are *about*,
 * and both sides ask them: the field writer for the one netid somebody is trying to
 * revoke, inside its locking transaction, and `db/read/roles.ts` for the whole
 * holder set at request scope. A second copy of the projection is how the two lists
 * drift — which is not hypothetical, since the first version of this pair differed
 * by an `ORDER BY` and produced two orderings of the same dependencies.
 *
 * They take **whatever can run a `select`**, which is the one thing a transaction
 * and a handle have in common here: the writer must ask inside its own transaction
 * and a read module must not open one.
 */
type Reader = Pick<ClassesTx, "select">;

/**
 * The live classes each of these netids is on the roster of, keyed by netid.
 *
 * *Live* is `LIVE_STATES` — from `Slated` onward, not *teaching right now*. **Set-
 * based over whatever it is given**, so the roles page's cost does not grow with
 * the number of role-holders, and one round trip either way.
 */
export async function liveSeatsOf(
  read: Reader,
  netids: readonly Netid[],
): Promise<ReadonlyMap<Netid, readonly LiveSeat[]>> {
  if (netids.length === 0) return new Map();

  const rows = await read
    .select({
      netid: offeringInstructor.netid,
      position: offeringInstructor.position,
      courseNumber: course.courseNumber,
      sectionNumber: offering.sectionNumber,
      semester: term.semester,
      year: term.year,
      status: offering.status,
    })
    .from(offeringInstructor)
    .innerJoin(offering, eq(offering.offeringId, offeringInstructor.offeringId))
    .innerJoin(course, eq(course.courseId, offering.courseId))
    .innerJoin(term, eq(term.code, offering.termCode))
    .where(and(inArray(offeringInstructor.netid, [...netids]), inArray(offering.status, [...LIVE_STATES])))
    // Ordered, because the list **is** the refusal's content: two orderings of the
    // same rows are two refusals as far as a reader is concerned.
    .orderBy(asc(course.courseNumber), asc(offering.termCode), asc(offering.sectionNumber));

  return gathered(rows, (row) => ({
    courseNumber: row.courseNumber,
    sectionNumber: row.sectionNumber,
    term: termLabel(row),
    status: row.status ?? "",
    lead: row.position === 0,
  }));
}

/**
 * The non-`Retired` courses each of these netids heads the area of, keyed by netid.
 *
 * A `Retired` course does not block, which is the whole of what makes the
 * assignment's monotonicity survivable: the head can be revoked once the courses
 * they hold are out of the catalog's forward path.
 */
export async function headedCoursesOf(
  read: Reader,
  netids: readonly Netid[],
): Promise<ReadonlyMap<Netid, readonly HeadedCourse[]>> {
  if (netids.length === 0) return new Map();

  const rows = await read
    .select({
      netid: course.areaHead,
      courseNumber: course.courseNumber,
      title: course.title,
      status: course.status,
    })
    .from(course)
    .where(and(inArray(course.areaHead, [...netids]), ne(course.status, "Retired")))
    .orderBy(asc(course.courseNumber));

  return gathered(rows, (row) => ({
    courseNumber: row.courseNumber,
    title: row.title,
    status: row.status ?? "",
  }));
}

/**
 * Rows to *this netid's rows*, in the order they arrived. The `netid` column is
 * nullable on one of the two queries — `course.area_head` is — and the `WHERE`
 * has already excluded nulls, so this narrows the type rather than restating a
 * predicate somebody could disagree with.
 */
function gathered<TRow extends { netid: Netid | null }, TOut>(
  rows: readonly TRow[],
  shape: (row: TRow) => TOut,
): ReadonlyMap<Netid, readonly TOut[]> {
  const found = new Map<Netid, TOut[]>();
  for (const row of rows) {
    if (row.netid === null) continue;
    const already = found.get(row.netid) ?? [];
    already.push(shape(row));
    found.set(row.netid, already);
  }
  return found;
}

/**
 * *Fall 2025* out of the two columns that make it. `term.code` is what a query
 * joins on and *20253* is not a thing to put in front of a reader, so the label is
 * built in one place and both sides of a refusal read the same.
 */
export function termLabel(term: { semester: string; year: number }): string {
  return `${term.semester} ${term.year}`;
}

/** One `program_director` relationship row blocking the role's revoke. */
export type DirectedProgram = { code: string; name: string };

/**
 * **`chair` refused because it is the last one** (issues/34).
 *
 * The one refusal of the four that names no dependency: the blocking fact is the
 * absence of a second chair, and there is nothing to list. It is also the one
 * whose fix is a control on this very page — grant `chair` to somebody else and
 * the lock lifts, live, because the rule is *never empty* and not *never
 * revocable*.
 */
export function lastChair(who: string): Refusal {
  return refusal(
    `${who} is the only chair. Nobody else can grant a role, so removing this one would leave the department with no way to appoint anyone. Grant chair to somebody else first.`,
  );
}

/**
 * **`instructor` refused while the netid is on a live roster** (issues/34).
 *
 * *Live* is `LIVE_STATES` — from `Slated` onward, not *teaching right now* — and
 * the distinction is the whole rule: a `Concluded` offering keeps its roster rows
 * forever, so *any roster row* would mean nobody who ever taught can be
 * un-instructored.
 */
export function stillOnLiveRosters(who: string, live: readonly LiveSeat[]): Refusal {
  const one = live.length === 1;
  return refusal(
    `${who} is on the roster of ${live.length} ${one ? "class that has" : "classes that have"} not finished teaching. Take them off those rosters first, or wait until those classes conclude.`,
    live.map(
      (seat) =>
        `${seat.courseNumber} sec ${seat.sectionNumber}, ${seat.term} — ${seat.status}${seat.lead ? " (lead)" : ""}`,
    ),
  );
}

/**
 * **`area_head` refused while the netid heads a non-`Retired` course** (issues/34,
 * issues/32).
 *
 * The refusal issues/38 quotes in full, and the reason the third clause of the
 * wording exists at all: the courses are data the chair cannot see from a
 * person-centric page, so naming the person is not enough.
 */
export function stillHeadsCourses(who: string, headed: readonly HeadedCourse[]): Refusal {
  const one = headed.length === 1;
  return refusal(
    `${who} heads the area of ${headed.length} ${one ? "course that has" : "courses that have"} not been retired. Hand those courses to another area head first.`,
    headed.map((course) => `${course.courseNumber} — ${course.title} (${course.status})`),
  );
}

/**
 * **`program_director` refused while a `program_director` row names the netid** —
 * standing principle 6 run backwards (issues/34, issues/51).
 *
 * The relationship is the thing that has to go, and the qualification survives it:
 * removing somebody from a program is a different act with no refusal at all.
 */
export function stillDirects(who: string, programs: readonly DirectedProgram[]): Refusal {
  const one = programs.length === 1;
  return refusal(
    `${who} still directs ${one ? "a program" : `${programs.length} programs`}. Hand ${one ? "it" : "them"} to another director first.`,
    programs.map((program) => `${program.code} — ${program.name}`),
  );
}

/** `machine legality AND invariants AND (permissions OR chair)` — this is the third term. */
export function permitted(
  routes: readonly Route[],
  actor: ActorFacts,
  subject: Subject,
): boolean {
  return isChair(actor) || routes.some((route) => satisfies(route, actor, subject));
}

/**
 * **The two routes whose `Developing` condition rides in the relationship**
 * (issues/65), said out loud (issues/86).
 *
 * `describe` used to drop the qualifier and answer for these two exactly as it
 * answers for their unconditioned siblings, which made the Proposal body's
 * refusal read *"Only … ITP's program director … can change this record's
 * proposal body"* **to ITP's program director** — a sentence naming a role its
 * reader holds, which is clause 2 of the wording (*name the person or the role*)
 * arriving as a claim the reader can disprove by looking at their own dev bar. It
 * is reachable because the class's **state** gate is satisfied by **any** sibling
 * being `Developing` while each **route** is scoped to its own review, so an
 * `Approved` ITP review of a proposal IMA has sent back refuses its own director
 * on the role half alone, with no *Not now* beside it to explain the shape.
 *
 * The same move issues/84 made on `whoMay`, one route along: a rail is where a
 * route description is read at length, and both times the first record page to
 * render one found the sentence saying less than the rule.
 *
 * The two qualifiers are worded **differently on purpose**. A directorship is
 * scoped to a program, so the sentence can name which review has to have been
 * sent back — *once ITP has sent it back* — where an area headship is already an
 * assignment on this one review and *once it has been sent back* is unambiguous.
 * Identical qualifiers would also have read as one sentence saying one thing
 * twice, which is the fault issues/84 removed.
 */

/**
 * **Name the role, never the rule** (issues/37). The writer has no directory to
 * resolve a netid into a name with — `people` is the other project and no
 * transaction spans the two — so it names the role and its scope. The read
 * modules, which do run the stitch, name the person.
 */
function describe(route: Route, subject: Subject): string {
  if ("row" in route) return "whoever proposed it";

  switch (route.via) {
    case "flat":
      return route.role === "chair" ? "the department chair" : named(route.role.replace("_", " "));
    case "offering_instructor position 0 of this offering":
      return "the lead instructor";
    case "program_director(offering.program_code)":
      return director(subject.offering?.programCode);
    case "program_director(course.program_code)":
      return director(subject.course?.programCode);
    case "program_director(course_proposal_review.program_code)":
      return director(subject.review?.programCode);
    case "program_director(course_proposal_review.program_code) of a review that is `Developing`":
      return `${director(subject.review?.programCode)} once ${subject.review?.programCode ?? "that program"} has sent it back`;
    case "program_director(requirement_category.program_code)":
    case "program_director(area.program_code)":
      return director(subject.tagProgramCode);
    case "course.area_head":
      return "this course's area head";
    case "course_proposal_review.area_head":
      return "this review's area head";
    case "course_proposal_review.area_head of a review that is `Developing`":
      return "this review's area head once it has been sent back";
  }
}

function director(programCode: string | undefined): string {
  return programCode ? `${programCode}'s program director` : "the program's director";
}

/**
 * ***An* instructor**, not *a instructor* (issues/88).
 *
 * Three of the seven roles begin with a vowel — `instructor`, `area_head` and
 * `advisor` — and the flat arm's article was fixed at *a*. It went unseen for as
 * long as it did because a flat route only ever reached a reader through a
 * refusal nobody had a screen for: the `create` row's three arms are the widest
 * flat set in the map, and until the propose form there was no page to state them
 * on. The article is chosen off the word rather than off a list of roles, so a
 * role added to `ROLES` reads correctly without anybody remembering this.
 */
function named(role: string): string {
  return `${/^[aeiou]/i.test(role) ? "an" : "a"} ${role}`;
}

/**
 * *Only A, B or C can …* — and *nobody* where the route list is empty, which is a
 * refusal in its own right (issues/28).
 *
 * **De-duplicated, because two routes can describe the same person** (issues/84).
 * A route is a `(role, relationship)` conjunction and every one of them is
 * evaluated separately — that is issues/8's rule and nothing here weakens it —
 * but *Seat-sharing tags* names two of them, one through `area` and one through
 * `requirement_category`, and both describe **the program's director**. Without
 * this the class page's rail read *"Only the program's director or the program's
 * director can change this class's seat sharing"*, which is one sentence saying
 * one thing twice. Distinct descriptions are untouched, and the first occurrence
 * keeps its place, so no existing refusal changes a word.
 */
export function whoMay(routes: readonly Route[], subject: Subject): string {
  const named = [...new Set(routes.map((route) => describe(route, subject)))];
  if (named.length === 0) return "nobody";
  if (named.length === 1) return named[0]!;
  return `${named.slice(0, -1).join(", ")} or ${named.at(-1)!}`;
}

/**
 * The permission refusal, in the one shape every one of them takes: *only these
 * people can do this thing*.
 */
export function notYours(act: string, thing: string, routes: readonly Route[], subject: Subject): Refusal {
  return routes.length === 0
    ? refusal(`Nothing in the system can ${act} ${thing}.`)
    : refusal(`Only ${whoMay(routes, subject)} can ${act} ${thing}.`);
}

// ---------------------------------------------------------------------------
// A field class's two refusals — one sentence each, shared by both sides
// ---------------------------------------------------------------------------
//
// Here for the reason `stillTeaching`, `courseRetired` and the four revocation
// refusals are here: **two callers** (issues/14, issues/62, issues/83).
// `writeFields` throws these at whoever clicks anyway; `EditAffordance` states
// them in the record page's rail one step earlier, under an `Edit` control that
// is absent because nothing is yours. A second copy of either sentence is how a
// rule and its explanation drift apart.
//
// **Two refusals per class and not one**, because issues/28 ANDs a state
// predicate and a role predicate and checks them **separately**: an `Approved`
// course read by another program's director refuses its body on both counts,
// and stating one hides the wall the reader walks into next. That is why a field
// refusal is sometimes two sentences where a transition refusal is always one.

/**
 * Which record each table hangs off, and **the map both sides read** — the
 * writer to refuse a write naming another record's table, the record pages to
 * work out which field classes surface on them at all.
 *
 * `course_proposal` belongs to the review because the body is shared and the
 * edit page is the review's (issues/62); the two authorization tables belong to
 * no record at all, being the chair's page rather than anyone's rail
 * (issues/34).
 */
export type FieldWriteOwner = MachineName | "authorization";

export const OWNED_BY: Readonly<Record<string, FieldWriteOwner>> = {
  course: "course",
  course_area: "course",
  course_proposal: "course_proposal_review",
  course_proposal_review: "course_proposal_review",
  course_proposal_review_area: "course_proposal_review",
  course_requirement_category: "course",
  offering: "offering",
  offering_area: "offering",
  offering_instructor: "offering",
  offering_meeting: "offering",
  offering_requirement_category: "offering",
  program_director: "authorization",
  user_role: "authorization",
};

/** *a class*, in the department's words — and the noun both a refusal and a page use. */
export function recordNoun(machine: MachineName): string {
  return machine === "course_proposal_review" ? "review" : machine === "offering" ? "class" : "course";
}

/**
 * **The field classes that surface on one record's page**, derived from the map
 * rather than restated as a list per screen (issues/62, issues/106).
 *
 * A class surfaces on a record when it names a table that record owns. Two kinds
 * are dropped, and neither is a judgement about the screen:
 *
 * - `no-field-write` classes — Structural, Machine-owned, Creation, Timestamps —
 *   because there is no state in which anybody may write them, so an edit page
 *   listing them would be offering a section that can never open;
 * - classes whose writer list is `NOBODY` while their gate is a state, which is
 *   only *Roster — position 0*: **not a field class**, as the map says in its own
 *   note. Naming a lead is `staff` and goes through the transition writer.
 *
 * issues/106's arrival is what makes deriving worth the paragraph: it took the
 * course page from two sections to three without anybody editing a screen.
 */
export function fieldClassesOn(machine: MachineName): readonly ClassifiedField[] {
  return FIELD_CLASSES.filter(
    (fieldClass) =>
      fieldClass.stateGate.gate !== "no-field-write" &&
      fieldClass.writers.length > 0 &&
      tablesOf(fieldClass).some((table) => OWNED_BY[table] === machine),
  );
}

/**
 * The tables a class names, from both halves of the map. A `rows` entry may
 * qualify itself in prose — *offering_instructor below position 0* — so the
 * table is the first word of it.
 */
function tablesOf(fieldClass: FieldClass): readonly string[] {
  return [
    ...fieldClass.columns.map((column) => column.slice(0, column.lastIndexOf("."))),
    ...(fieldClass.rows ?? []).map((entry) => entry.split(" ")[0] ?? entry),
  ];
}

/**
 * The states a field class's gate is read against. Not one state, because the
 * gate names **its own** machine rather than the record's, and because one gate
 * is not a state of any single record: the Proposal body is open while **any**
 * of the proposal's reviews is `Developing` (issues/65), the per-review
 * condition riding in the relationship instead.
 */
export type GateStates = {
  course?: string | null;
  offering?: string | null;
  review?: string | null;
  siblingReviews?: readonly string[];
};

/**
 * **The state half of a field class's two predicates** — an invariant, so it
 * names no actor and the chair's clause never reaches it (issues/28, issues/34).
 * `null` when the gate is open.
 */
export function notNowField(fieldClass: FieldClass, states: GateStates): Refusal | null {
  const gate = fieldClass.stateGate;
  if (gate.gate !== "states") return null;

  if (gate.states.some((state) => state.startsWith("Developing —"))) {
    return (states.siblingReviews ?? []).includes("Developing")
      ? null
      : refusal("The proposal body can only be changed while a program has it under development.");
  }

  const current = stateIn(gate.machine, states);
  if (current !== null && gate.states.includes(current)) return null;

  return refusal(
    `${fieldClass.name} can only be changed while the ${recordNoun(gate.machine)} is ${gate.states.join(" or ")}; this one is ${current ?? "not loaded"}.`,
  );
}

function stateIn(machine: MachineName, states: GateStates): string | null {
  switch (machine) {
    case "course":
      return states.course ?? null;
    case "offering":
      return states.offering ?? null;
    case "course_proposal_review":
      return states.review ?? null;
  }
}

/**
 * **The role half** — a permission, and the chair sits one clause ahead of this
 * one and of nothing else (issues/34, issues/62). `null` when the actor may
 * write the class.
 *
 * The subject is the caller's: for every class but one it is the record's own,
 * and for **Seat-sharing tags** it is the *tag's* program, which is the sole
 * scope in the model that points away from the record (issues/25, issues/30).
 * The wording names that outright rather than reading as a bug.
 */
export function notYoursField(
  fieldClass: FieldClass,
  facts: ActorFacts,
  subject: Subject,
): Refusal | null {
  if (permitted(fieldClass.writers, facts, subject)) return null;
  return notYours("change", fieldThing(fieldClass), fieldClass.writers, subject);
}

function fieldThing(fieldClass: FieldClass): string {
  return fieldClass.name === "Seat-sharing tags"
    ? "this class's seat sharing"
    : `this record's ${fieldClass.name.toLowerCase()}`;
}
