import "server-only";

import { and, eq, getTableColumns, inArray, ne, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import {
  area,
  course,
  courseArea,
  courseProposal,
  courseProposalReview,
  courseProposalReviewArea,
  courseRequirementCategory,
  offering,
  offeringArea,
  offeringInstructor,
  offeringMeeting,
  offeringRequirementCategory,
  programDirector,
  requirementCategory,
  userRole,
} from "@/db/classes/schema";
import { peopleDb } from "@/db/handles";
import { person } from "@/db/people/schema";
import { LIVE_STATES } from "@/lib/machines/offering.machine";
import {
  fieldClassFor,
  FIELD_CLASSES,
  UNCLASSIFIED,
  type FieldClass,
  type MachineName,
  type Role,
} from "@/lib/permissions";

import { refusal, refuse, refuseAll, type Refusal } from "./refusal";
import {
  holdsRole,
  notYours,
  peopleKnows,
  permitted,
  readActorFacts,
  type ActorFacts,
  type Subject,
} from "./rules";
import { moment, type At, type ClassesTx, type Id, type Netid, type OpenTransaction } from "./transaction";

// ---------------------------------------------------------------------------
// What a field write is
// ---------------------------------------------------------------------------

/**
 * The record being edited. The three machines, or the authorization tables —
 * which belong to no record, being the chair's page rather than anyone's rail
 * (issues/34, issues/38).
 */
export type FieldWriteRecord = { machine: MachineName; id: Id } | { authorization: true };

export type FieldRowWrite =
  | { table: string; op: "insert"; values: Readonly<Record<string, unknown>> }
  | { table: string; op: "delete"; key: Readonly<Record<string, unknown>> };

export type FieldWrite = {
  record: FieldWriteRecord;
  /**
   * Qualified column names, exactly the strings `FIELD_CLASSES` lists. **A column
   * in no class is unwritable** (issues/28), so an unknown key is a refusal
   * rather than a silent no-op — which is what makes default-deny structural
   * rather than disciplinary as the schema grows.
   */
  columns?: Readonly<Record<string, unknown>>;
  /**
   * The row-shaped classes. issues/10 turned issues/8's *meeting pattern* from a
   * column into rows, and issues/62 refused to make that a separate question: the
   * two classes that are **mixed** prove the field class and not the field is the
   * unit.
   */
  rows?: readonly FieldRowWrite[];
};

// ---------------------------------------------------------------------------
// writeFields
// ---------------------------------------------------------------------------

/**
 * **Every field write in the system** (issues/28, issues/61, issues/62).
 *
 * One call commits every field class open to the actor, in one transaction: the
 * edit page is one page and one Save per record. Each class is checked
 * **separately**, and each carries **two predicates, ANDed**:
 *
 *   * a **state** predicate — an invariant. It names no actor, so it binds the
 *     chair and the seed script alike.
 *   * a **role** predicate — a permission. The chair's clause sits ahead of this
 *     one and never the other (issues/62).
 *
 * They are checked separately rather than merged so that **both can fail at once
 * and both can be reported**: an `Approved` course read by another program's
 * director refuses its body on both counts, and stating one hides the wall the
 * reader walks into next. That is why a field refusal is sometimes two sentences
 * where a transition refusal is always one.
 *
 * It writes `updated_at` / `updated_by` itself, **never a trigger** (issues/10,
 * on issues/13's and issues/30's *where would a reader find it*), and it writes
 * **no log row at all** — issues/17 deleted the transition a field write used to
 * fire, which is why the stamp is the only trace.
 */
export async function writeFields(
  open: OpenTransaction,
  write: FieldWrite,
  actor: Netid,
): Promise<void> {
  const { tx, at } = open;
  const columns = write.columns ?? {};
  const rows = write.rows ?? [];
  if (Object.keys(columns).length === 0 && rows.length === 0) return;

  // **The field writer refuses any write naming position 0, in every state**
  // (issues/61). It is an **invariant** and not a permission — it names no actor
  // — so it is checked here rather than as the position-0 class's empty writer
  // list, which the chair's clause would clear: the chair bypasses the
  // permission term and nothing else. *Renumbering an existing row into position
  // 0 is not a field write. It is `staff`, and it goes through `applyTransition`
  // or it does not happen.*
  for (const row of rows) {
    if (row.table === "offering_instructor" && Number(positionOf(row)) === 0) {
      refuse(
        "Position 0 is not a field. Naming a lead instructor is `staff`, which goes through the transition writer so that the roster and the class's state cannot disagree.",
      );
    }
  }

  // A write may only name tables belonging to the record it opened. Naming
  // another is a caller's mistake and not a rule anybody hit, so it throws
  // rather than refusing.
  for (const table of [...Object.keys(byTable(columns)), ...rows.map((row) => row.table)]) {
    const owner = OWNED_BY[table];
    if (owner && owner !== kindOf(write.record)) {
      throw new Error(`A field write on ${kindOf(write.record)} may not name ${table}.`);
    }
  }

  const facts = await readActorFacts(tx, actor);
  const context = await load(tx, write.record);
  context.tagPrograms = await loadTagPrograms(tx, rows);

  const byClass = group(columns, rows);

  // --- The two predicates, per class, checked separately --------------------

  const refusals: Refusal[] = [];
  for (const [fieldClass, work] of byClass) {
    if (fieldClass.stateGate.gate === "no-field-write") {
      // Structural, Machine-owned, Creation, Timestamps, the position-0 roster
      // and anything the map never classified. Both halves say the same thing —
      // there is no writer and no state in which there is one — so this is one
      // refusal rather than two.
      refusals.push(
        refusal(
          `${fieldClass.name} is not editable anywhere in the system.`,
          [...Object.keys(work.columns), ...work.rows.map((row) => row.table)],
        ),
      );
      continue;
    }

    const notNow = await stateRefusal(tx, fieldClass, context);
    if (notNow) refusals.push(notNow);

    const notYoursRefusal = roleRefusal(fieldClass, facts, context, work);
    if (notYoursRefusal) refusals.push(notYoursRefusal);
  }
  if (refusals.length > 0) refuseAll(refusals);

  // --- The actorless refusals this writer carries beyond the two predicates --

  for (const [fieldClass, work] of byClass) {
    await furtherInvariants(tx, fieldClass, work, context, actor);
  }

  // --- The writes ------------------------------------------------------------

  const touched = new Set<string>();

  for (const [table, values] of Object.entries(byTable(columns))) {
    const target = updateTarget(table, context);
    await tx.update(target.table).set(named(target.table, values)).where(target.where);
    touched.add(table);
  }

  for (const row of rows) {
    const table = tableNamed(row.table);
    // The parent key is **derived from the record, never taken from the
    // caller** — issues/30's move on `offering.program_code`, applied to the
    // other half of the same problem. Without it the two predicates are checked
    // against the record the actor opened while the row lands on whichever one
    // its payload names: IMA's director, editing her own class, could write a
    // meeting onto ITP's.
    const parent = parentKey(row.table, context);
    if (row.op === "insert") {
      await tx
        .insert(table)
        .values(named(table, { ...row.values, ...parent, ...provenance(row.table, actor, at) }));
    } else {
      await tx.delete(table).where(keyMatch(table, { ...row.key, ...parent }));
    }
    touched.add(row.table);
  }

  await stamp(tx, touched, context, actor, at);
}

// ---------------------------------------------------------------------------
// Grouping — the field class, not the field, is the unit
// ---------------------------------------------------------------------------

type Work = { columns: Record<string, unknown>; rows: FieldRowWrite[] };

/** The tables a field class claims wholesale, indexed off `FIELD_CLASSES` rather than restated. */
const CLASS_BY_ROW_TABLE = new Map<string, FieldClass>(
  (FIELD_CLASSES as readonly FieldClass[]).flatMap((fieldClass) =>
    (fieldClass.rows ?? [])
      // `offering_instructor` appears in two classes, split at position 0, and is
      // resolved per row below rather than by table name.
      .filter((entry) => !entry.includes(" "))
      .map((entry) => [entry, fieldClass] as const),
  ),
);

const ROSTER_BELOW = (FIELD_CLASSES as readonly FieldClass[]).find(
  (fieldClass) => fieldClass.name === "Roster — positions 1..n",
)!;

function group(
  columns: Readonly<Record<string, unknown>>,
  rows: readonly FieldRowWrite[],
): Map<FieldClass, Work> {
  const grouped = new Map<FieldClass, Work>();
  const into = (fieldClass: FieldClass): Work => {
    const work = grouped.get(fieldClass) ?? { columns: {}, rows: [] };
    grouped.set(fieldClass, work);
    return work;
  };

  for (const [column, value] of Object.entries(columns)) {
    into(fieldClassFor(column)).columns[column] = value;
  }
  for (const row of rows) {
    into(classOfRow(row)).rows.push(row);
  }
  return grouped;
}

function classOfRow(row: FieldRowWrite): FieldClass {
  // Position 0 has already been refused above, unconditionally, so every roster
  // row that reaches here is one of the co-instructors below it (issues/61).
  if (row.table === "offering_instructor") return ROSTER_BELOW;
  return CLASS_BY_ROW_TABLE.get(row.table) ?? unclassifiedTable(row.table);
}

/**
 * The row-shaped half of **a column with no class is unwritable** (issues/28): a
 * table no field class claims has no writer either. Cached per table name so that
 * two rows of the same unclassified table group together and refuse once.
 */
const UNCLASSIFIED_TABLES = new Map<string, FieldClass>();

function unclassifiedTable(table: string): FieldClass {
  const known = UNCLASSIFIED_TABLES.get(table);
  if (known) return known;
  const made: FieldClass = { ...UNCLASSIFIED, name: `\`${table}\` — unwritable`, rows: [table] };
  UNCLASSIFIED_TABLES.set(table, made);
  return made;
}

function positionOf(row: FieldRowWrite): unknown {
  return row.op === "insert" ? row.values.position : row.key.position;
}

// ---------------------------------------------------------------------------
// The state predicate — an invariant, so it binds the chair and the seed
// ---------------------------------------------------------------------------

async function stateRefusal(
  tx: ClassesTx,
  fieldClass: FieldClass,
  context: Context,
): Promise<Refusal | null> {
  const gate = fieldClass.stateGate;
  if (gate.gate !== "states") return null;

  // The Proposal body's gate is the one that is not a state of the record being
  // edited: the body is shared, so it is open while **any** of the proposal's
  // reviews is `Developing` (issues/65). The per-review condition that decides
  // *whose* `develop` opened it rides in the relationship instead.
  if (gate.states.some((state) => state.startsWith("Developing —"))) {
    const developing = context.siblingReviewStates.includes("Developing");
    return developing
      ? null
      : refusal("The proposal body can only be changed while a program has it under development.");
  }

  const current = stateOf(gate.machine, context);
  if (current !== null && gate.states.includes(current)) return null;

  return refusal(
    `${fieldClass.name} can only be changed while the ${noun(gate.machine)} is ${gate.states.join(" or ")}; this one is ${current ?? "not loaded"}.`,
  );
}

function stateOf(machine: MachineName, context: Context): string | null {
  switch (machine) {
    case "course":
      return context.course?.status ?? null;
    case "offering":
      return context.offering?.status ?? null;
    case "course_proposal_review":
      return context.review?.status ?? null;
  }
}

function noun(machine: MachineName): string {
  return machine === "course_proposal_review" ? "review" : machine === "offering" ? "class" : "course";
}

// ---------------------------------------------------------------------------
// The role predicate — a permission, and the chair sits one clause ahead of it
// ---------------------------------------------------------------------------

function roleRefusal(
  fieldClass: FieldClass,
  facts: ActorFacts,
  context: Context,
  work: Work,
): Refusal | null {
  // Seat-sharing tags are the sole scope in the model that points **away** from
  // the record's own program (issues/25, issues/30): the scope comes from the
  // category, because whoever authors the claim writes the row. So the arm is
  // evaluated once per row, against that row's program.
  if (fieldClass.name === "Seat-sharing tags") {
    for (const row of work.rows) {
      const tagProgramCode = context.tagPrograms.get(rowTagKey(row));
      const subject: Subject = { ...context.subject, tagProgramCode };
      if (!permitted(fieldClass.writers, facts, subject)) {
        return notYours("change", "this class's seat sharing", fieldClass.writers, subject);
      }
    }
    return null;
  }

  return permitted(fieldClass.writers, facts, context.subject)
    ? null
    : notYours("change", `this record's ${fieldClass.name.toLowerCase()}`, fieldClass.writers, context.subject);
}

// ---------------------------------------------------------------------------
// The actorless refusals this writer carries — `FIELD_WRITER_REFUSALS`
// ---------------------------------------------------------------------------

async function furtherInvariants(
  tx: ClassesTx,
  fieldClass: FieldClass,
  work: Work,
  context: Context,
  actor: Netid,
): Promise<void> {
  if (fieldClass.name === "Roster — positions 1..n") {
    for (const row of work.rows) {
      if (row.op !== "insert") continue;
      const netid = String(row.values.netid ?? "");
      // Standing principle 6 binds **every** roster row, not only position 0:
      // position is scope for events, the role is the qualification to teach.
      if (!(await holdsRole(tx, netid, "instructor"))) {
        refuse(`${netid} cannot be seated on a class without the instructor role.`);
      }
      // A check, not a constraint — the netid is in the other project (issues/9).
      if (!(await peopleKnows(netid))) {
        refuse(`${netid} is not a person the directory knows.`);
      }
    }
  }

  if (fieldClass.name === "Seat-sharing tags") {
    for (const row of work.rows) {
      const tagProgramCode = context.tagPrograms.get(rowTagKey(row));
      if (tagProgramCode !== undefined && tagProgramCode === context.offering?.programCode) {
        refuse(
          "A class cannot share seats with its own program — a seat-sharing tag is another program's claim.",
        );
      }
    }
  }

  if (fieldClass.name === "Course assignment") {
    const existing = await tx
      .select({ areaId: courseArea.areaId })
      .from(courseArea)
      .where(eq(courseArea.courseId, expect(context.recordId, "course")));
    await monotoneAssignment(tx, work, {
      column: "course.area_head",
      existing: existing.map((row) => row.areaId),
      what: "course",
    });
  }

  if (fieldClass.name === "Review assignment") {
    const existing = await tx
      .select({ areaId: courseProposalReviewArea.areaId })
      .from(courseProposalReviewArea)
      .where(eq(courseProposalReviewArea.courseProposalReviewId, expect(context.recordId, "review")));
    await monotoneAssignment(tx, work, {
      column: "course_proposal_review.area_head",
      existing: existing.map((row) => row.areaId),
      what: "review",
    });
  }

  if (fieldClass.name === "Authorization") {
    await authorizationInvariants(tx, work);
  }
}

/**
 * **The assignment is monotone** (issues/32): areas and heads may be swapped but
 * never emptied, and there is no unassign operation. That is what makes the
 * create-time gate on offerings sufficient forever — a cascade would violate it
 * later, which is why revoking `area_head` refuses instead of cascading.
 */
async function monotoneAssignment(
  tx: ClassesTx,
  work: Work,
  assignment: { column: string; existing: readonly number[]; what: string },
): Promise<void> {
  if (assignment.column in work.columns) {
    const head = work.columns[assignment.column];
    if (head === null) {
      refuse(`A ${assignment.what}'s area head can be swapped but never removed.`);
    }
    // Standing principle 6 again, on the other relationship it binds
    // (issues/32, issues/34): a `course.area_head` naming someone without the
    // role is inert — it looks like an assignment, confers nothing, and reports
    // nothing.
    if (typeof head === "string" && !(await holdsRole(tx, head, "area_head"))) {
      refuse(`${head} cannot head an area without the area head role.`);
    }
  }

  const after = new Set(assignment.existing);
  for (const row of work.rows) {
    const values = row.op === "insert" ? row.values : row.key;
    const areaId = Number(values.area_id);
    if (row.op === "insert") after.add(areaId);
    else after.delete(areaId);
  }
  if (assignment.existing.length > 0 && after.size === 0) {
    refuse(`A ${assignment.what}'s areas can be swapped but never emptied.`);
  }
}

async function authorizationInvariants(tx: ClassesTx, work: Work): Promise<void> {
  for (const row of work.rows) {
    if (row.table === "program_director" && row.op === "insert") {
      // Appointing a director is **two writes**, the role then this row, and the
      // second refuses a netid without the first (standing principle 6).
      const netid = String(row.values.netid ?? "");
      if (!(await holdsRole(tx, netid, "program_director"))) {
        refuse(`${netid} cannot direct a program without the program director role.`);
      }
    }

    if (row.table !== "user_role") continue;

    if (row.op === "insert") continue;

    const netid = String(row.key.netid ?? "");
    const role = String(row.key.role ?? "") as Role;

    if (role === "chair") {
      const chairs = await tx.select({ netid: userRole.netid }).from(userRole).where(eq(userRole.role, "chair"));
      if (chairs.length <= 1) {
        // Or the system has no one who may grant anything (issues/34).
        refuse("The last chair cannot be removed.");
      }
    }

    // **Refuse while dependent**, and the predicate is over **live** dependencies
    // rather than all of them (issues/34): a `Concluded` offering keeps its
    // roster rows forever, so *any roster row* would mean nobody who ever taught
    // can be un-instructored. Read backwards, this is standing principle 6 —
    // revocation reaches the same inert pair through the other door.
    if (role === "instructor") {
      const live = await tx
        .select({ offeringId: offeringInstructor.offeringId, status: offering.status })
        .from(offeringInstructor)
        .innerJoin(offering, eq(offering.offeringId, offeringInstructor.offeringId))
        .where(and(eq(offeringInstructor.netid, netid), inArray(offering.status, [...LIVE_STATES])));
      if (live.length > 0) {
        refuse(
          `${netid} is on the roster of ${live.length} ${live.length === 1 ? "class" : "classes"} that ${live.length === 1 ? "has" : "have"} not finished.`,
          live.map((row) => `${row.offeringId} — ${row.status}`),
        );
      }
    }

    if (role === "area_head") {
      const headed = await tx
        .select({ courseNumber: course.courseNumber, status: course.status })
        .from(course)
        .where(and(eq(course.areaHead, netid), ne(course.status, "Retired")));
      if (headed.length > 0) {
        refuse(
          `${netid} heads the area of ${headed.length} ${headed.length === 1 ? "course" : "courses"} that ${headed.length === 1 ? "has" : "have"} not been retired.`,
          headed.map((row) => `${row.courseNumber} — ${row.status}`),
        );
      }
    }

    if (role === "program_director") {
      const directed = await tx
        .select({ programCode: programDirector.programCode })
        .from(programDirector)
        .where(eq(programDirector.netid, netid));
      if (directed.length > 0) {
        refuse(
          `${netid} still directs ${directed.length} ${directed.length === 1 ? "program" : "programs"}.`,
          directed.map((row) => row.programCode),
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The record, loaded once and locked
// ---------------------------------------------------------------------------

type Context = {
  recordId: Id | null;
  subject: Subject;
  course?: { programCode: string; areaHead: Netid | null; status: string | null };
  offering?: { programCode: string; status: string | null };
  review?: { programCode: string; areaHead: Netid | null; status: string | null; proposalId: Id };
  proposalId: Id | null;
  siblingReviewStates: readonly string[];
  /** A seat-sharing row's program, keyed by `table:id`, read from the tag's own table. */
  tagPrograms: Map<string, string>;
};

async function load(tx: ClassesTx, record: FieldWriteRecord): Promise<Context> {
  const empty: Context = {
    recordId: null,
    subject: {},
    proposalId: null,
    siblingReviewStates: [],
    tagPrograms: new Map(),
  };

  if ("authorization" in record) return empty;

  if (record.machine === "course") {
    const [row] = await tx
      .select({ programCode: course.programCode, areaHead: course.areaHead, status: course.status })
      .from(course)
      .where(eq(course.courseId, record.id))
      .for("update");
    if (!row) throw new Error(`No course ${record.id}.`);
    return {
      ...empty,
      recordId: record.id,
      course: row,
      subject: { course: { programCode: row.programCode, areaHead: row.areaHead } },
    };
  }

  if (record.machine === "offering") {
    const [row] = await tx
      .select({ programCode: offering.programCode, status: offering.status })
      .from(offering)
      .where(eq(offering.offeringId, record.id))
      .for("update");
    if (!row) throw new Error(`No offering ${record.id}.`);
    const [lead] = await tx
      .select({ netid: offeringInstructor.netid })
      .from(offeringInstructor)
      .where(and(eq(offeringInstructor.offeringId, record.id), eq(offeringInstructor.position, 0)));
    return {
      ...empty,
      recordId: record.id,
      offering: row,
      subject: { offering: { programCode: row.programCode, lead: lead?.netid ?? null } },
    };
  }

  const [row] = await tx
    .select({
      programCode: courseProposalReview.programCode,
      areaHead: courseProposalReview.areaHead,
      status: courseProposalReview.status,
      proposalId: courseProposalReview.courseProposalId,
    })
    .from(courseProposalReview)
    .where(eq(courseProposalReview.courseProposalReviewId, record.id))
    .for("update");
  if (!row) throw new Error(`No review ${record.id}.`);

  const siblings = await tx
    .select({ status: courseProposalReview.status })
    .from(courseProposalReview)
    .where(eq(courseProposalReview.courseProposalId, row.proposalId));
  const [proposal] = await tx
    .select({ createdBy: courseProposal.createdBy })
    .from(courseProposal)
    .where(eq(courseProposal.courseProposalId, row.proposalId));

  return {
    ...empty,
    recordId: record.id,
    review: row,
    proposalId: row.proposalId,
    siblingReviewStates: siblings.map((sibling) => sibling.status ?? ""),
    subject: {
      review: { programCode: row.programCode, areaHead: row.areaHead, state: row.status ?? "" },
      ...(proposal ? { proposal: { createdBy: proposal.createdBy } } : {}),
    },
  };
}

/** Resolve every seat-sharing row's own program before the role gate needs it. */
async function loadTagPrograms(tx: ClassesTx, rows: readonly FieldRowWrite[]): Promise<Map<string, string>> {
  const programs = new Map<string, string>();
  for (const row of rows) {
    if (row.table === "offering_area") {
      const areaId = Number(row.op === "insert" ? row.values.area_id : row.key.area_id);
      const [found] = await tx
        .select({ programCode: area.programCode })
        .from(area)
        .where(eq(area.areaId, areaId));
      if (found) programs.set(`offering_area:${areaId}`, found.programCode);
    }
    if (row.table === "offering_requirement_category") {
      const categoryId = Number(
        row.op === "insert" ? row.values.requirement_category_id : row.key.requirement_category_id,
      );
      const [found] = await tx
        .select({ programCode: requirementCategory.programCode })
        .from(requirementCategory)
        .where(eq(requirementCategory.requirementCategoryId, categoryId));
      if (found) programs.set(`offering_requirement_category:${categoryId}`, found.programCode);
    }
  }
  return programs;
}

function rowTagKey(row: FieldRowWrite): string {
  const values = row.op === "insert" ? row.values : row.key;
  const id = row.table === "offering_area" ? values.area_id : values.requirement_category_id;
  return `${row.table}:${Number(id)}`;
}

// ---------------------------------------------------------------------------
// Tables, columns and the stamp
// ---------------------------------------------------------------------------

const TABLES: Readonly<Record<string, PgTable>> = {
  course,
  course_area: courseArea,
  course_proposal: courseProposal,
  course_proposal_review: courseProposalReview,
  course_proposal_review_area: courseProposalReviewArea,
  course_requirement_category: courseRequirementCategory,
  offering,
  offering_area: offeringArea,
  offering_instructor: offeringInstructor,
  offering_meeting: offeringMeeting,
  offering_requirement_category: offeringRequirementCategory,
  program_director: programDirector,
  user_role: userRole,
};

function tableNamed(table: string): PgTable {
  const found = TABLES[table];
  if (!found) throw new Error(`No table ${table}.`);
  return found;
}

/**
 * Which record each table hangs off. `course_proposal` belongs to the review
 * because the body is shared and the edit page is the review's (issues/62); the
 * two authorization tables belong to no record at all (issues/34).
 */
const OWNED_BY: Readonly<Record<string, "a course" | "a class" | "a review" | "the roles page">> = {
  course: "a course",
  course_area: "a course",
  course_proposal: "a review",
  course_proposal_review: "a review",
  course_proposal_review_area: "a review",
  course_requirement_category: "a course",
  offering: "a class",
  offering_area: "a class",
  offering_instructor: "a class",
  offering_meeting: "a class",
  offering_requirement_category: "a class",
  program_director: "the roles page",
  user_role: "the roles page",
};

function kindOf(record: FieldWriteRecord): string {
  if ("authorization" in record) return "the roles page";
  return record.machine === "course" ? "a course" : record.machine === "offering" ? "a class" : "a review";
}

/**
 * The parent key a row write inherits from its record, overwriting whatever the
 * caller passed. `program_code` rides along on the three tables whose composite
 * foreign key checks it against both ends (issues/25, issues/30), so a caller
 * cannot claim one program's area for another's course, nor — on
 * `course_requirement_category` — one program's requirement category for
 * another's course (issues/106).
 */
function parentKey(table: string, context: Context): Record<string, unknown> {
  switch (table) {
    case "course_area":
    case "course_requirement_category":
      return {
        course_id: expect(context.recordId, "course"),
        program_code: context.course?.programCode,
      };
    case "course_proposal_review_area":
      return {
        course_proposal_review_id: expect(context.recordId, "review"),
        program_code: context.review?.programCode,
      };
    case "offering_area":
    case "offering_instructor":
    case "offering_meeting":
    case "offering_requirement_category":
      return { offering_id: expect(context.recordId, "class") };
    default:
      return {};
  }
}

function byTable(columns: Readonly<Record<string, unknown>>): Record<string, Record<string, unknown>> {
  const grouped: Record<string, Record<string, unknown>> = {};
  for (const [qualified, value] of Object.entries(columns)) {
    const dot = qualified.lastIndexOf(".");
    if (dot <= 0 || dot === qualified.length - 1) {
      throw new Error(`Field write column keys must be qualified as "table.column"; got "${qualified}".`);
    }
    const table = qualified.slice(0, dot);
    const column = qualified.slice(dot + 1);
    (grouped[table] ??= {})[column] = value;
  }
  return grouped;
}

/** Column names arrive as the schema spells them; Drizzle wants its own property names. */
function named(table: PgTable, values: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const columns = getTableColumns(table);
  const byDatabaseName = new Map(Object.entries(columns).map(([key, column]) => [column.name, key]));
  const translated: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(values)) {
    const key = byDatabaseName.get(name);
    if (!key) throw new Error(`No column ${name} on this table.`);
    translated[key] = value;
  }
  return translated;
}

function keyMatch(table: PgTable, key: Readonly<Record<string, unknown>>): SQL | undefined {
  const columns = getTableColumns(table);
  const byDatabaseName = new Map(Object.entries(columns).map(([, column]) => [column.name, column]));
  const clauses = Object.entries(key).map(([name, value]) => {
    const column = byDatabaseName.get(name);
    if (!column) throw new Error(`No column ${name} on this table.`);
    return eq(column, value);
  });
  return and(...clauses);
}

/**
 * The Creation class, supplied by the writer rather than accepted from the caller
 * (issues/13, issues/61). Position-0 roster rows take `granted_by` / `granted_at`
 * redundantly with the log's `subject_netid`, because a conditional column is
 * worse than a redundant one.
 */
function provenance(table: string, actor: Netid, at: At | undefined): Record<string, unknown> {
  const granted = ["user_role", "program_director", "offering_instructor", "offering_area", "offering_requirement_category"];
  if (granted.includes(table)) return { granted_by: actor, granted_at: moment(at) };
  const created = ["offering_meeting"];
  if (created.includes(table)) return { created_by: actor, created_at: moment(at) };
  return {};
}

function updateTarget(table: string, context: Context): { table: PgTable; where: SQL | undefined } {
  switch (table) {
    case "course":
      return { table: course, where: eq(course.courseId, expect(context.recordId, "course")) };
    case "offering":
      return { table: offering, where: eq(offering.offeringId, expect(context.recordId, "offering")) };
    case "course_proposal_review":
      return {
        table: courseProposalReview,
        where: eq(courseProposalReview.courseProposalReviewId, expect(context.recordId, "review")),
      };
    case "course_proposal":
      // The body lives on the proposal and the edit page is the review's, so the
      // record is the review and the write lands one row up (issues/62).
      return {
        table: courseProposal,
        where: eq(courseProposal.courseProposalId, expect(context.proposalId, "proposal")),
      };
    default:
      throw new Error(`${table} has no columns a field write may name.`);
  }
}

function expect(id: Id | null, what: string): Id {
  if (id === null) throw new Error(`This write names no ${what}.`);
  return id;
}

/**
 * **`updated_at` / `updated_by`, written here and never by a trigger** (issues/10).
 *
 * It is the only trace a field write leaves — issues/17 deleted the transition
 * one used to fire — which is sharpest for exactly the historical corrections you
 * would most want attributable. `user_role` and `program_director` have no such
 * columns: a revoked grant leaves no trace at all, which issues/34 accepted
 * rather than overlooked.
 */
async function stamp(
  tx: ClassesTx,
  touched: ReadonlySet<string>,
  context: Context,
  actor: Netid,
  at: At | undefined,
): Promise<void> {
  const now = moment(at);
  const stampable: Record<string, () => Promise<unknown>> = {
    course: () =>
      tx
        .update(course)
        .set({ updatedAt: now, updatedBy: actor })
        .where(eq(course.courseId, expect(context.recordId, "course"))),
    offering: () =>
      tx
        .update(offering)
        .set({ updatedAt: now, updatedBy: actor })
        .where(eq(offering.offeringId, expect(context.recordId, "offering"))),
    course_proposal_review: () =>
      tx
        .update(courseProposalReview)
        .set({ updatedAt: now, updatedBy: actor })
        .where(eq(courseProposalReview.courseProposalReviewId, expect(context.recordId, "review"))),
    course_proposal: () =>
      tx
        .update(courseProposal)
        .set({ updatedAt: now, updatedBy: actor })
        .where(eq(courseProposal.courseProposalId, expect(context.proposalId, "proposal"))),
  };

  // A row write stamps the record it hangs off, not the child table: a meeting
  // pattern changing is the class changing.
  const owner: Readonly<Record<string, string>> = {
    course: "course",
    course_area: "course",
    course_proposal: "course_proposal",
    course_proposal_review: "course_proposal_review",
    course_proposal_review_area: "course_proposal_review",
    course_requirement_category: "course",
    offering: "offering",
    offering_area: "offering",
    offering_instructor: "offering",
    offering_meeting: "offering",
    offering_requirement_category: "offering",
  };

  const targets = new Set<string>();
  for (const table of touched) {
    const stampTarget = owner[table];
    if (stampTarget) targets.add(stampTarget);
  }
  for (const target of targets) {
    await stampable[target]!();
  }
}

// ---------------------------------------------------------------------------
// Shared reads
// ---------------------------------------------------------------------------

