import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { createActor, type AnyStateMachine } from "xstate";

import {
  course,
  courseArea,
  courseProposal,
  courseProposalReview,
  courseProposalReviewArea,
  courseProposalReviewTransition,
  courseTransition,
  offering,
  offeringInstructor,
  offeringTransition,
} from "@/db/classes/schema";
import { peopleDb } from "@/db/handles";
import { person } from "@/db/people/schema";
import { machine as courseMachine } from "@/lib/machines/course.machine";
import type { LiveOffering } from "@/lib/machines/course.machine";
import { machine as reviewMachine } from "@/lib/machines/course-proposal-review.machine";
import {
  LIVE_STATES,
  machine as offeringMachine,
  type LiveState,
} from "@/lib/machines/offering.machine";
import { MATRICES, NOBODY, type MachineName, type Route } from "@/lib/permissions";

import { refuse, WriteRefused } from "./refusal";
import {
  holdsRole,
  notYours,
  peopleKnows,
  permitted,
  readActorFacts,
  type ActorFacts,
  type Subject,
} from "./rules";
import { moment, type At, type ClassesTx, type Id, type Netid } from "./transaction";

// ---------------------------------------------------------------------------
// The events
// ---------------------------------------------------------------------------

/**
 * The three event unions as `applyTransition` accepts them: the machines' own
 * event types, plus the payloads a *transition* carries that a *lifecycle* does
 * not.
 *
 * Three of those payloads exist, and each is forced by something outside the
 * machines:
 *
 *   * `staff` carries the netid being seated. The roster is relational and the
 *     machine cannot write to it (issues/15), so the writer needs the subject the
 *     event is about — which is also the log row's `subject_netid`.
 *   * the review's `approve` carries the `course_number` its mint will use. Each
 *     approving program mints its own number (issues/7) and `course.course_number`
 *     is `NOT NULL` from the moment a course exists, so there is nowhere else for
 *     it to come from — the proposal deliberately has no number.
 *   * **any** event may carry a free-text `reason`, which is the schema's own
 *     sentence — *optional, on all three logs* (issues/10, parked there by
 *     issues/19). Enumerating the events that may is a second copy of a rule the
 *     column already states, and it is wrong in the fixtures: the seed's histories
 *     put reasons on a review's `develop` and `reject` and on an offering's
 *     `defer`, `withdraw` and `decline` as well as on `cancel`. Which controls
 *     offer a reason box is the action layer's question (issues/37). Structured
 *     reason codes are out of scope.
 *
 * `retire` does **not** carry its `liveOfferings`, though the machine's guard
 * reads them: the writer runs that query itself, inside the transaction that
 * locks the course row (issues/14). A caller cannot hand in a stale answer.
 */
type Explained = { reason?: string };

export type CourseEvent = ({ type: "revise" } | { type: "approve" } | { type: "retire" }) &
  Explained;

export type ReviewEvent = (
  | { type: "develop" }
  | { type: "approve"; courseNumber: string }
  | { type: "reject" }
) &
  Explained;

export type OfferingEvent = (
  | { type: "staff"; netid: Netid }
  | { type: "unstaff" }
  | { type: "offer" }
  | { type: "accept" }
  | { type: "decline" }
  | { type: "defer" }
  | { type: "withdraw" }
  | { type: "cancel" }
  | { type: "schedule" }
  | { type: "publish" }
  | { type: "list" }
  | { type: "run" }
  | { type: "evaluate" }
  | { type: "conclude" }
  | { type: "retry" }
  | { type: "kill" }
) &
  Explained;

/**
 * **The narrower union the action layer exposes** (issues/15, issues/28).
 *
 * `staff` and `unstaff` are never user-facing, and that is **non-exposure rather
 * than a check**: there is no branch anywhere refusing them, because a Server
 * Action cannot name them. One writer inserts the `offering_instructor` row and
 * sends the event in the same transaction, so a roster that disagrees with the
 * machine state has no code path. Stated here, at the type level, so the action
 * layer inherits it rather than restating it.
 */
export type ExposedOfferingEvent = Exclude<OfferingEvent, { type: "staff" } | { type: "unstaff" }>;

export type EventFor<M extends MachineName> = M extends "course"
  ? CourseEvent
  : M extends "offering"
    ? OfferingEvent
    : ReviewEvent;

// ---------------------------------------------------------------------------
// applyTransition
// ---------------------------------------------------------------------------

/**
 * **Every lifecycle move in the system, on all three machines** (issues/6,
 * issues/13, issues/28).
 *
 * One plain function, called by the Server Action **and** by the seed script —
 * which is why the transaction is a parameter and the check is inside rather than
 * in the wrapper. An unchecked seed is the one caller with unlimited licence to
 * write lies into the transition log.
 *
 * It locks the row, re-reads the relationships that authorize the move, rehydrates
 * the persisted snapshot, asserts that the event actually moves it, and writes the
 * new snapshot together with the log row — and with the side effects, where there
 * are any — in the one transaction.
 *
 * Every write is `machine legality AND invariants AND (permissions OR chair)`, in
 * that order. The chair's clause is ahead of the permission term **only**: it
 * never reaches machine legality and it never reaches an invariant (issues/34).
 */
export async function applyTransition<M extends MachineName>(
  tx: ClassesTx,
  entity: { machine: M; id: Id },
  event: EventFor<M>,
  actor: Netid,
  at?: At,
): Promise<void> {
  const facts = await readActorFacts(tx, actor);

  // The switch narrows `entity.machine`, which is `M` rather than a literal, so
  // the event is re-asserted against the branch it selected. The three signatures
  // below are what the caller was type-checked against.
  switch (entity.machine as MachineName) {
    case "course":
      return moveCourse(tx, entity.id, event as CourseEvent, actor, facts, at);
    case "offering":
      return moveOffering(tx, entity.id, event as OfferingEvent, actor, facts, at);
    case "course_proposal_review":
      return moveReview(tx, entity.id, event as ReviewEvent, actor, facts, at);
  }
}

// ---------------------------------------------------------------------------
// Course
// ---------------------------------------------------------------------------

async function moveCourse(
  tx: ClassesTx,
  id: Id,
  event: CourseEvent,
  actor: Netid,
  facts: ActorFacts,
  at: At,
): Promise<void> {
  const [row] = await tx
    .select({
      snapshot: course.snapshot,
      programCode: course.programCode,
      areaHead: course.areaHead,
    })
    .from(course)
    .where(eq(course.courseId, id))
    .for("update");
  if (!row) throw new Error(`No course ${id}.`);

  const subject: Subject = { course: { programCode: row.programCode, areaHead: row.areaHead } };

  // The guard is a predicate over a list it is handed, and the caller of the
  // machine is this writer — so the query runs here, inside the lock (issues/14).
  const live = event.type === "retire" ? await liveOfferingsOf(tx, id) : [];
  const machineEvent = event.type === "retire" ? { type: "retire" as const, liveOfferings: live } : event;

  const move = transitionOf(courseMachine, row.snapshot, machineEvent);
  if (!move) {
    if (event.type === "retire" && live.length > 0) {
      // Clause 3: name the dependency and list it (issues/38).
      refuse(
        `This course has ${live.length} ${live.length === 1 ? "class that has" : "classes that have"} not finished teaching.`,
        live.map((offered) => `${offered.termCode} — ${offered.status}`),
      );
    }
    refuseAsIllegal("course", event.type, currentState(courseMachine, row.snapshot));
  }

  requirePermission("course", event.type, "this course", facts, subject);

  await tx
    .update(course)
    .set({
      snapshot: move.snapshot,
      // **`approve` bumps the edition, and it is the only thing that does**
      // (issues/10). A stored copy of a fact `course_transition` already holds,
      // legal under standing principle 1 by the exemption route: one transaction
      // writes both.
      ...(event.type === "approve" ? { edition: sql`${course.edition} + 1` } : {}),
    })
    .where(eq(course.courseId, id));

  await tx.insert(courseTransition).values({
    courseId: id,
    event: event.type,
    fromState: move.from,
    toState: move.to,
    actorNetid: actor,
    subjectNetid: null,
    reason: event.reason ?? null,
    at: moment(at),
  });
}

// ---------------------------------------------------------------------------
// Offering
// ---------------------------------------------------------------------------

async function moveOffering(
  tx: ClassesTx,
  id: Id,
  event: OfferingEvent,
  actor: Netid,
  facts: ActorFacts,
  at: At,
): Promise<void> {
  const [row] = await tx
    .select({
      snapshot: offering.snapshot,
      programCode: offering.programCode,
      courseId: offering.courseId,
    })
    .from(offering)
    .where(eq(offering.offeringId, id))
    .for("update");
  if (!row) throw new Error(`No offering ${id}.`);

  const lead = await leadOf(tx, id);
  const subject: Subject = { offering: { programCode: row.programCode, lead } };

  const move = transitionOf(offeringMachine, row.snapshot, { type: event.type });
  if (!move) refuseAsIllegal("class", event.type, currentState(offeringMachine, row.snapshot));

  // --- Invariants: actorless, so they bind the chair and the seed alike -----

  if (event.type === "retry") {
    // The one constraint the Offering lifecycle cannot express (issues/14). Its
    // other door — creating a fresh offering of a retired course — is refused in
    // the create path (issues/43).
    const [parent] = await tx
      .select({ status: course.status })
      .from(course)
      .where(eq(course.courseId, row.courseId));
    if (parent?.status === "Retired") {
      refuse("This class cannot be revived, because its course has been retired.");
    }
  }

  if (event.type === "staff") {
    // **Standing principle 6** (issues/34): the writer of a relationship refuses
    // a subject who does not hold the role that relationship scopes. It binds
    // every roster row, not only position 0 — position is scope for *events*, the
    // role is the qualification to teach. It names no actor, so the chair is
    // bound by it too, and a chair who does not hold `instructor` cannot be
    // staffed on a class.
    if (!(await holdsRole(tx, event.netid, "instructor"))) {
      refuse(`${event.netid} cannot be given a class to teach without the instructor role.`);
    }
    // **A check, not a constraint** (issues/9, issues/61, issues/69): the netid
    // lives in the other project, so it cannot join this transaction and a window
    // exists between check and write. Against a recovery path of reseed that is
    // the right trade.
    if (!(await peopleKnows(event.netid))) {
      refuse(`${event.netid} is not a person the directory knows.`);
    }
  }

  requirePermission("offering", event.type, "this class", facts, subject);

  // --- The side effects, in the same transaction as the snapshot ------------

  if (event.type === "staff") {
    await tx.insert(offeringInstructor).values({
      offeringId: id,
      position: 0,
      netid: event.netid,
      grantedBy: actor,
      grantedAt: moment(at),
    });
  }

  if (event.type === "unstaff" || event.type === "decline" || event.type === "withdraw") {
    // **DELETE position 0 and leave everything below it** (issues/15, issues/19,
    // issues/61). A section may legally hold co-instructors and no lead —
    // `Declined.retry` produces exactly that shape.
    await tx
      .delete(offeringInstructor)
      .where(and(eq(offeringInstructor.offeringId, id), eq(offeringInstructor.position, 0)));
  }

  await tx.update(offering).set({ snapshot: move.snapshot }).where(eq(offering.offeringId, id));

  await tx.insert(offeringTransition).values({
    offeringId: id,
    event: event.type,
    fromState: move.from,
    toState: move.to,
    actorNetid: actor,
    subjectNetid: subjectOf(event, lead),
    reason: event.reason ?? null,
    at: moment(at),
  });
}

/**
 * **`actor_netid` records who clicked; `subject_netid` records who it was done
 * to** (issues/15, issues/19, issues/41).
 *
 * `staff` and `unstaff` need it because a swap inside `Staffed` fires nothing at
 * all, so the original name would otherwise simply be gone. `decline` and
 * `withdraw` need it because the roster row is deleted in the same transaction.
 * `offer` and `accept` need it because the roster survives the *event* but not the
 * *offering*: a log read after a withdraw-and-re-offer would have an `offer` row
 * attributable to nobody and an `accept` row attributable to whoever holds
 * position 0 now.
 *
 * `defer` carries none: the roster row survives it and position 0 is frozen from
 * `Offered` onward, so the roster still answers who was asked.
 */
function subjectOf(event: OfferingEvent, lead: Netid | null): Netid | null {
  switch (event.type) {
    case "staff":
      return event.netid;
    case "unstaff":
    case "offer":
    case "accept":
    case "decline":
    case "withdraw":
      return lead;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Course-proposal review
// ---------------------------------------------------------------------------

async function moveReview(
  tx: ClassesTx,
  id: Id,
  event: ReviewEvent,
  actor: Netid,
  facts: ActorFacts,
  at: At,
): Promise<void> {
  const [row] = await tx
    .select({
      snapshot: courseProposalReview.snapshot,
      programCode: courseProposalReview.programCode,
      areaHead: courseProposalReview.areaHead,
      status: courseProposalReview.status,
      courseProposalId: courseProposalReview.courseProposalId,
    })
    .from(courseProposalReview)
    .where(eq(courseProposalReview.courseProposalReviewId, id))
    .for("update");
  if (!row) throw new Error(`No review ${id}.`);

  const subject: Subject = {
    review: { programCode: row.programCode, areaHead: row.areaHead, state: row.status ?? "" },
  };

  const move = transitionOf(reviewMachine, row.snapshot, { type: event.type });
  if (!move) refuseAsIllegal("review", event.type, currentState(reviewMachine, row.snapshot));

  requirePermission("course_proposal_review", event.type, "this review", facts, subject);

  // **The seam** (issues/7, issues/32): one transaction moves the review to
  // `Approved` and mints a `course` in this program's catalog, copying the body
  // and the area assignment forward. The mint **copies** rather than references,
  // because variants in different programs are meant to diverge.
  if (event.type === "approve") {
    await mint(tx, { reviewId: id, ...row }, event.courseNumber, actor, at);
  }

  await tx
    .update(courseProposalReview)
    .set({ snapshot: move.snapshot })
    .where(eq(courseProposalReview.courseProposalReviewId, id));

  await tx.insert(courseProposalReviewTransition).values({
    courseProposalReviewId: id,
    event: event.type,
    fromState: move.from,
    toState: move.to,
    actorNetid: actor,
    subjectNetid: null,
    reason: event.reason ?? null,
    at: moment(at),
  });
}

async function mint(
  tx: ClassesTx,
  review: { reviewId: Id; programCode: string; areaHead: Netid | null; courseProposalId: Id },
  courseNumber: string,
  actor: Netid,
  at: At,
): Promise<void> {
  const [body] = await tx
    .select({
      title: courseProposal.title,
      description: courseProposal.description,
      credits: courseProposal.credits,
    })
    .from(courseProposal)
    .where(eq(courseProposal.courseProposalId, review.courseProposalId));
  if (!body) throw new Error(`No proposal ${review.courseProposalId}.`);

  const [minted] = await tx
    .insert(course)
    .values({
      programCode: review.programCode,
      courseNumber,
      title: body.title,
      description: body.description,
      credits: body.credits,
      // Copied forward with the body, and for the same reason: areas are
      // program-scoped, so three approving programs mint three courses that may
      // sit in three different areas under three different heads (issues/25,
      // issues/32).
      areaHead: review.areaHead,
      mintedFromReviewId: review.reviewId,
      snapshot: initialSnapshot(courseMachine),
      // The approving **actor**, which may be the area head rather than a
      // director (issues/32 amending issues/13).
      createdBy: actor,
      createdAt: moment(at),
    })
    .returning({ courseId: course.courseId });
  if (!minted) throw new Error("The mint wrote no course.");

  const areas = await tx
    .select({
      areaId: courseProposalReviewArea.areaId,
      programCode: courseProposalReviewArea.programCode,
    })
    .from(courseProposalReviewArea)
    .where(eq(courseProposalReviewArea.courseProposalReviewId, review.reviewId));

  if (areas.length > 0) {
    await tx.insert(courseArea).values(
      areas.map((assigned) => ({
        courseId: minted.courseId,
        areaId: assigned.areaId,
        programCode: assigned.programCode,
      })),
    );
  }
}

// ---------------------------------------------------------------------------
// The machinery the three paths share
// ---------------------------------------------------------------------------

type Move = { from: string; to: string; snapshot: unknown };

/**
 * **Machine legality, and the movement assertion** (issues/6, issues/13).
 *
 * The persisted snapshot is rehydrated rather than trusted: XState validates its
 * `value` against the machine's state nodes, so a snapshot naming a state the
 * machine no longer has throws here rather than half-transitioning. `null` means
 * the machine offers no such edge from this state — which binds **everyone**,
 * chair included, because the chair's clause is in the permission term only.
 */
function transitionOf(machine: AnyStateMachine, snapshot: unknown, event: { type: string }): Move | null {
  const running = createActor(machine, { snapshot: snapshot as never });
  running.start();
  try {
    const from = String(running.getSnapshot().value);
    if (!running.getSnapshot().can(event as never)) return null;
    running.send(event as never);
    const to = String(running.getSnapshot().value);
    if (to === from) {
      // Every edge in all three machines targets a different state, so a
      // self-transition means the snapshot and the machine disagree about what
      // this event does. Refusing to record a move that did not happen.
      throw new Error(`${event.type} left this record in ${from}.`);
    }
    return { from, to, snapshot: running.getPersistedSnapshot() };
  } finally {
    running.stop();
  }
}

function currentState(machine: AnyStateMachine, snapshot: unknown): string {
  const running = createActor(machine, { snapshot: snapshot as never });
  running.start();
  try {
    return String(running.getSnapshot().value);
  } finally {
    running.stop();
  }
}

/** The initial persisted snapshot, for the two paths that create a record at rest. */
export function initialSnapshot(machine: AnyStateMachine): unknown {
  const running = createActor(machine);
  running.start();
  try {
    return running.getPersistedSnapshot();
  } finally {
    running.stop();
  }
}

function refuseAsIllegal(noun: string, event: string, state: string): never {
  refuse(`This ${noun} is ${state}, so it cannot be ${pastTense(event)}.`);
}

/** Enough of a verb list to read like a sentence; the log stores the event, never this. */
function pastTense(event: string): string {
  const irregular: Record<string, string> = { run: "run", defer: "deferred" };
  if (event in irregular) return irregular[event]!;
  if (event.endsWith("e")) return `${event}d`;
  if (event.endsWith("y")) return `${event.slice(0, -1)}ied`;
  return `${event}ed`;
}

function routesFor(machine: MachineName, act: string): readonly Route[] {
  const row = MATRICES[machine].find((entry) => (entry.acts as readonly string[]).includes(act));
  return row?.routes ?? NOBODY;
}

function requirePermission(
  machine: MachineName,
  act: string,
  noun: string,
  facts: ActorFacts,
  subject: Subject,
): void {
  const routes = routesFor(machine, act);
  if (!permitted(routes, facts, subject)) {
    throw new WriteRefused([notYours(act, noun, routes, subject)]);
  }
}

async function liveOfferingsOf(tx: ClassesTx, courseId: Id): Promise<LiveOffering[]> {
  const rows = await tx
    .select({
      offeringId: offering.offeringId,
      termCode: offering.termCode,
      status: offering.status,
    })
    .from(offering)
    .where(and(eq(offering.courseId, courseId), inArray(offering.status, [...LIVE_STATES])));

  return rows.map((row) => ({
    id: String(row.offeringId),
    termCode: row.termCode,
    status: row.status as LiveState,
  }));
}

async function leadOf(tx: ClassesTx, offeringId: Id): Promise<Netid | null> {
  const [row] = await tx
    .select({ netid: offeringInstructor.netid })
    .from(offeringInstructor)
    .where(and(eq(offeringInstructor.offeringId, offeringId), eq(offeringInstructor.position, 0)));
  return row?.netid ?? null;
}

