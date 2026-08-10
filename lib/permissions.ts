/**
 * **The permission model** — the three transition matrices, the thirteen field
 * classes, the three read tiers, the fourth page-level read predicate, the chair
 * bypass and the invariant list, in one module.
 *
 * `docs/permissions/permissions.ts` is authoritative and
 * `docs/permissions/README.md` carries the reasoning and the history; this file
 * states the same rules as code the application runs (issues/76). Where the two
 * ever disagree the spec wins. Every claim below names the ticket that settled
 * it — `issues/n` is
 * https://github.com/nopivnick/lineup-prototype-03/issues/n throughout.
 *
 * **One module is deliberate** (issues/28), so that *what may a `student` do* is
 * one file. That is the same "where would a reader find it" ground on which the
 * map rejected database triggers, rejected RLS, and rejected splitting the model
 * along the read/write axis.
 *
 * Where the checks physically run:
 *
 *     permitted(actor, write) =
 *         machineLegality(write)                    // the machine offers this edge
 *       AND invariants(write)                       // actorless; binds the seed too
 *       AND (permissions(actor, write) OR holds(actor, "chair"))
 *
 * with the permission check **inside** each single writer rather than beside it
 * — inside `applyTransition` for transitions, inside the field writer for field
 * writes, inside the create path for creation (issues/77 builds all four). The
 * Server Action is an actor-resolution wrapper, not an auth wrapper, and the
 * seed script is checked like anyone else. `actor` is a bare netid end to end:
 * every relationship is re-read inside the locking transaction, so a role set
 * resolved at request scope would be stale by the time it was used (issues/28,
 * confirming issues/11).
 *
 * The server computes, per row, the set of actions this actor may fire — the
 * three terms above already intersected — and ships it as data. The client
 * renders from that set and computes nothing; the machine is never imported
 * client-side (issues/28, amending issues/6). The refused thing and its
 * explanation are one value (issues/14), so a refusal and its reason cannot
 * drift apart.
 *
 * **This module is server-only**, and the `import` below is what makes that
 * structural rather than a convention: a Client Component that reaches for it
 * fails the build rather than shipping the rules to the browser.
 */
import "server-only";

import type { EventFromLogic } from "xstate";

import type { machine as courseMachine } from "./machines/course.machine";
import type { machine as reviewMachine } from "./machines/course-proposal-review.machine";
import type { machine as offeringMachine } from "./machines/offering.machine";
import { COMMITTED_STATES, LIVE_STATES, type OfferingState } from "./machines/offering.machine";

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/**
 * The seven values of `user_role.role`. Charting settled four; issues/4 renamed
 * "Admin" to `program_director` and added `area_head`, issues/8 added
 * `coordinator` for the department's operational seat, issues/34 added `chair`
 * to author the table itself.
 */
export type Role =
  | "student"
  | "instructor"
  | "advisor"
  | "coordinator"
  | "program_director"
  | "area_head"
  | "chair";

/**
 * issues/34's split of what `user_role` holds. Not decoration — it is what
 * decides whether the chair's bypass reaches a rule.
 *
 * - **capability** — flat, actor-side, fully subsumed by `chair`. `coordinator`,
 *   and nothing else.
 * - **qualification** — subject-side. Gates whether a *relationship row may name
 *   you*, and is subsumed by nothing: the bypass covers what a person may
 *   **do**, never what may be **done to** them. A chair who does not hold
 *   `instructor` cannot be staffed on an offering.
 * - **superuser** — `chair`, the first role that is its own scope.
 *
 * `student` is placed in neither: its content is registration, which is out of
 * scope, so it has no relationship to be the subject of.
 */
export type RoleKind = "capability" | "qualification" | "superuser" | "unclassified";

export const ROLE_KIND: Readonly<Record<Role, RoleKind>> = {
  student: "unclassified",
  instructor: "qualification",
  advisor: "qualification",
  coordinator: "capability",
  program_director: "qualification",
  area_head: "qualification",
  chair: "superuser",
};

// ---------------------------------------------------------------------------
// Routes — how a role is scoped
// ---------------------------------------------------------------------------

/**
 * The relationship half of a permission. issues/4 made a permission a
 * conjunction of a flat role and a relationship; the role is never scoped by
 * itself. `"flat"` means department-wide, no relationship to check.
 *
 * issues/30 collapsed two of these: *director of the offering's program* and
 * *director of the course's program* are provably the same set, since
 * `offering (course_id, program_code)` is a composite foreign key into `course`
 * and the create path derives `program_code` from the course rather than taking
 * it as an argument.
 *
 * **Two of them carry a state** (issues/65), and they are the first that do. A
 * relationship used to be a row that either exists or does not; the two
 * `… of a review that is Developing` arms hold a row that exists and stops
 * conferring anything when the review moves off `Developing`. The condition
 * rides here rather than in a `StateGate` because *whose own review is
 * `Developing`* is a state whose answer depends on who is asking, and a
 * `StateGate` names no actor by construction.
 */
export type Relationship =
  | "flat"
  | "offering_instructor position 0 of this offering"
  | "program_director(offering.program_code)"
  | "program_director(course.program_code)"
  | "program_director(course_proposal_review.program_code)"
  | "program_director(course_proposal_review.program_code) of a review that is `Developing`"
  | "program_director(requirement_category.program_code)"
  | "program_director(area.program_code)"
  | "course.area_head"
  | "course_proposal_review.area_head"
  | "course_proposal_review.area_head of a review that is `Developing`";

/**
 * One arm of a permission.
 *
 * **Each `(role, relationship)` conjunction is evaluated independently and the
 * results OR'd. Never union the roles first and then check a single scope**
 * (issues/8). A director of ITP who is also area head of an IMA course may
 * re-approve that course by the area-head route, and must not be able to cancel
 * an IMA offering by borrowing the director role's scope.
 *
 * `{ row: … }` is the one arm that is not a role at all — a comparison against a
 * column on the record itself.
 */
export type Route =
  | { role: Role; via: Relationship }
  | { row: "course_proposal.created_by" };

/**
 * Nobody. Distinct from an unwritten rule: an empty route list is a **refusal**,
 * and under issues/28's *a column with no class is unwritable* it is also the
 * default for anything the map never classified — see `UNCLASSIFIED` below.
 */
export const NOBODY: readonly Route[] = [];

/**
 * The chair sits **one OR-clause ahead of the whole matrix**, and in the
 * permission term only (issues/34, confirmed by issues/42). A clause rather than
 * a seventh column with every cell filled: a column is a hand-maintained
 * restatement of the word *all*, re-broken by every event the map adds, where a
 * clause covers new events by construction.
 *
 * So the chair **cannot** fire an event the machine does not offer, violate an
 * invariant — including the immutable Structural class, which issues/28
 * reclassified from a permission on the test that it names no actor — or be
 * named as the subject of a relationship they are not qualified for. That
 * reclassification is the whole of what makes a superuser safe to add.
 *
 * On a field write the chair is ahead of the **role** predicate and never the
 * **state** predicate (issues/62): a chair gets the Edit control on an
 * `Approved` course and the body section is still absent from the form.
 */
export const CHAIR_BYPASS = {
  clause: "holds(actor, 'chair')",
  bypasses: "permissions",
  neverBypasses: ["machine legality", "invariants", "field-class state gates"],
  settledBy: ["issues/34", "issues/42", "issues/62"],
} as const;

// ---------------------------------------------------------------------------
// The transition matrices
// ---------------------------------------------------------------------------

/**
 * The event names each machine offers, taken off the machines rather than
 * restated, plus `"create"` for the acts issues/13 ruled are acts and not
 * transitions. A renamed or deleted event is a compiler error in the matrices
 * below rather than a row that quietly grants nothing.
 */
export type OfferingAct = EventFromLogic<typeof offeringMachine>["type"] | "create";
export type CourseAct = EventFromLogic<typeof courseMachine>["type"] | "create";
export type ReviewAct = EventFromLogic<typeof reviewMachine>["type"] | "create";

/**
 * One row of a matrix: the acts it covers and the routes that reach them.
 * `routes` are OR'd, and `acts` share a row exactly when they share routes.
 *
 * These tables hold **transitions and creation acts only**. Field writes live in
 * `FIELD_CLASSES` below — keeping a field rule in both places would be the
 * second copy rule 3 of `docs/agents/spec-packages.md` forbids.
 */
export type Act<TAct extends string> = {
  acts: readonly TAct[];
  routes: readonly Route[];
  settledBy: readonly string[];
  note?: string;
};

/**
 * **CourseProposalReview** — scoped by the review's own `program_code`.
 *
 * The review *is* a program by construction (issues/7 made it one actor per
 * `(proposal, program)`), which is why issues/8 overturned issues/4's
 * flat-approval rule: flat approval would let an ITP director dispose of the IMA
 * review of the same proposal, emptying out the whole reason for splitting the
 * machine. Disagreement requires two different people.
 *
 * **Proposing confers nothing** — no ownership, no later `revise` right
 * (issues/8). The minted course copies the proposal's body rather than
 * referencing it, so there is no link from a course back to its proposer.
 */
export const COURSE_PROPOSAL_REVIEW_MATRIX = [
  {
    acts: ["create"],
    routes: [
      { role: "instructor", via: "flat" },
      { role: "program_director", via: "flat" },
      { role: "area_head", via: "flat" },
    ],
    settledBy: ["issues/8", "issues/65"],
    note: "Creating a proposal mints one review per requested program, in one transaction — a review row *is* the request, so there is no requested-programs table (issues/10, issues/43). **All three arms are flat because the act is flat by construction**: at create time there is no proposal, no review and no course, so nothing exists for any relationship to scope to. issues/65 restored the two arms issues/43 and issues/42 had narrowed away without a ruling behind it. Every ITP/IMA/LowRes director teaches today, so the added arms grant nobody — an empty set is a fixture fact rather than a rule.",
  },
  {
    acts: ["develop", "approve", "reject"],
    routes: [
      { role: "program_director", via: "program_director(course_proposal_review.program_code)" },
      { role: "area_head", via: "course_proposal_review.area_head" },
    ],
    settledBy: ["issues/8", "issues/32", "issues/7", "issues/13"],
    note: "issues/32 resolved issues/8's own prose-versus-table contradiction in favour of the table: the prose dropped the area-head route for want of a subject, and that reason is false, because a director may assign the head on the review before approving. The route is contingent rather than arbitrary — a review with no assigned head has nobody holding it. **`approve` is the seam**: the same routes, and one transaction moves the review and mints the `course`, copying the body and the area assignment forward. `course.created_by` is the approving actor, which may be the area head rather than a director (issues/32 amending issues/13).",
  },
] as const satisfies readonly Act<ReviewAct>[];

/**
 * **Course** — scoped by `course.program_code` and `course.area_head`.
 *
 * The narrowest of the options issues/8 weighed, and a strict subset of them. An
 * instructor route on `revise` was seriously considered — the person likeliest
 * to notice a wrong description is whoever is teaching it — and declined on
 * reversibility: **under-grants are loud and over-grants are silent.** Strict
 * separation of duties was rejected on a firmer ground, that it is the only
 * option creating a new dependency, since `approve` would have to read the
 * transition log for who last revised.
 */
export const COURSE_MATRIX = [
  {
    acts: ["create"],
    routes: NOBODY,
    settledBy: ["issues/7", "issues/8", "issues/43", "issues/49"],
    note: "Minted by an approving review and by nothing else. The create forms make no course directly, which is what let issues/49 tighten `course.minted_from_review_id` to `NOT NULL`.",
  },
  {
    acts: ["revise", "approve"],
    routes: [
      { role: "program_director", via: "program_director(course.program_code)" },
      { role: "area_head", via: "course.area_head" },
    ],
    settledBy: ["issues/8", "issues/4"],
    note: "The half of issues/4's original rule that survived issues/8's overturning of flat approval — a director or that course's own area head — on the machine where `course.area_head` exists to be checked.",
  },
  {
    acts: ["retire"],
    routes: [{ role: "program_director", via: "program_director(course.program_code)" }],
    settledBy: ["issues/8"],
    note: "Director only. Gated additionally by the machine's `noLiveOfferings` guard over `LIVE_STATES` (issues/14), which is legality and not permission.",
  },
] as const satisfies readonly Act<CourseAct>[];

/**
 * **Offering** — scoped by `offering.program_code`; the lead is roster position
 * 0.
 *
 * The line between `coordinator` and `program_director` is **decision versus
 * execution**, and it is load-bearing for issues/4's central finding that
 * program scope applies to Offerings rather than Courses. `coordinator` is flat;
 * if it held the decisions too, a flat role could do everything to every
 * program's offerings and program scoping would be decorative. So everything
 * that commits the department, retracts something a person was told, or destroys
 * data is reserved to the offering's own program director.
 *
 * A vacancy is legal: nothing requires a sitting director (issues/51). The cost
 * is that the program freezes for new work while nothing running breaks.
 */
export const OFFERING_MATRIX = [
  {
    acts: ["create"],
    routes: [{ role: "program_director", via: "program_director(offering.program_code)" }],
    settledBy: ["issues/8", "issues/30", "issues/13"],
    note: "Creating an Offering commits the program to running a class, so it is a decision. Creation is an act but not a transition, so it needs a permission with no event to hang it on. The program is checked against the value being written — which issues/30 made unforgeable by having the create path derive it from the course inside the transaction: `program_code` never appears in the create signature.",
  },
  {
    acts: ["staff", "unstaff"],
    routes: [{ role: "program_director", via: "program_director(offering.program_code)" }],
    settledBy: ["issues/8", "issues/15", "issues/28"],
    note: "The position-0 roster write, which fires these two events. The **pick** is this write; `offer` is the separate act of asking. Never user-facing: the Server Actions expose a narrower event union than `applyTransition` accepts, so divergence between the roster row and the machine state has no code path. Renumbering an existing row into position 0 is not a field write — it is `staff`.",
  },
  {
    acts: ["offer"],
    routes: [
      { role: "coordinator", via: "flat" },
      { role: "program_director", via: "program_director(offering.program_code)" },
    ],
    settledBy: ["issues/8", "issues/15"],
    note: "On the coordinator's side because the decision was already recorded when the roster was written.",
  },
  {
    acts: ["accept", "decline", "defer"],
    routes: [
      { role: "instructor", via: "offering_instructor position 0 of this offering" },
      { role: "coordinator", via: "flat" },
      { role: "program_director", via: "program_director(offering.program_code)" },
    ],
    settledBy: ["issues/8", "issues/15", "issues/21"],
    note: "Not scoped to the lead alone: `actor_netid` records who clicked, and a decline is routinely an admin taking a refusal by email. Extending the proxy from `decline` to all three fixes an arbitrary asymmetry — acceptances arrive by email exactly as refusals do — and inverts the risk in the right direction, `decline` being the one with a contractual cost under ACT-UAW Art. VI(B). Recording proxy as an explicit *acted as* was rejected: it needs a column issues/19 declined to add.",
  },
  {
    acts: ["withdraw", "cancel", "retry", "kill"],
    routes: [{ role: "program_director", via: "program_director(offering.program_code)" }],
    settledBy: ["issues/8", "issues/19", "issues/21"],
    note: "Director only — retraction and destruction. `retry` carries an invariant beside the permission: refused when the Course is `Retired` (issues/14).",
  },
  {
    acts: ["schedule", "publish", "list", "run", "evaluate", "conclude"],
    routes: [
      { role: "coordinator", via: "flat" },
      { role: "program_director", via: "program_director(offering.program_code)" },
    ],
    settledBy: ["issues/8"],
    note: "The forward path is departmental bookkeeping, not faculty judgement, and it cannot be automated away: issues/3 deferred term dates, so nothing in the schema can compute when a class starts and fire `run`. Every one of these is a human clicking a button — the vacancy that made `coordinator` the sixth role.",
  },
] as const satisfies readonly Act<OfferingAct>[];

/**
 * The three machines, named. `MATRICES` is keyed by it and a `StateGate` names
 * one, so the two cannot disagree about how many machines there are — issues/7
 * added the third, and a fourth would break both places at once rather than one
 * of them silently.
 */
export type MachineName = "course" | "offering" | "course_proposal_review";

/**
 * The three matrices by machine, so a writer holding a machine name can find the
 * rules without a `switch` a fourth machine would silently outgrow. **New in the
 * conversion** (issues/76): the artifact exports the three tables and nothing
 * that indexes them, because nothing there had to look one up.
 */
export const MATRICES = {
  course: COURSE_MATRIX,
  offering: OFFERING_MATRIX,
  course_proposal_review: COURSE_PROPOSAL_REVIEW_MATRIX,
} as const satisfies Record<MachineName, readonly Act<string>[]>;

/**
 * `student` and `advisor` hold nothing across all three matrices and across
 * every field class — **confirmed, not assumed** (issues/8).
 *
 * The advisor's real right, approving an advisee's wishlist before the lottery,
 * is out of scope, and there is no advisee table to scope one by. The student's
 * interest is registration, also out of scope. issues/34 retro-explained why
 * these two rows are **complete rather than incomplete**: a qualification's
 * entire content sits on the subject side of a relationship, and theirs are
 * registration and the advisee link. That completeness is what issues/28 needed
 * when it landed the Tier 2 boundary on exactly these two.
 *
 * They are no longer twins in what they may **see**: issues/38 gave `advisor`
 * its first permission anywhere in the map, a page-level read.
 */
export const HOLD_NOTHING_IN_THE_MATRIX: readonly Role[] = ["student", "advisor"];

// ---------------------------------------------------------------------------
// The field-class map
// ---------------------------------------------------------------------------

/**
 * A field class carries **two predicates, ANDed and checked separately**
 * (issues/28):
 *
 * - a **state** predicate — an invariant. It names no actor, so it binds the
 *   chair and the seed script alike.
 * - a **role** predicate — a permission. The chair's clause sits ahead of this
 *   one and never the other.
 *
 * Checked separately rather than merged, which is why a field refusal is
 * sometimes two sentences where a transition refusal is always one (issues/62):
 * view an `Approved` course as another program's director and the body is
 * refused both because she is not its director and because the course is not
 * `Revising`. Stating one hides the wall the reader walks into next.
 */
export type StateGate =
  /** Writable in every state, `Concluded` / `Canceled` / `Dead` included. */
  | { gate: "state-blind" }
  /** Writable only while the record is in one of these states. */
  | { gate: "states"; machine: MachineName; states: readonly string[] }
  /** No field-write path exists at all. */
  | { gate: "no-field-write" };

export type FieldClass = {
  name: string;
  writers: readonly Route[];
  stateGate: StateGate;
  /** Fully qualified `table.column`. */
  columns: readonly string[];
  /**
   * Columns this class claims by bare name in **every** table — the operative
   * form of the artifact's *every `created_at` / `created_by`* (issues/76).
   * Consulted after `columns`, so a qualified name always wins and a table that
   * ever needs its own rule for one of these can have it.
   */
  columnNames?: readonly string[];
  /**
   * Child **rows** rather than columns, written by a row writer and not by the
   * field writer. Split out of the artifact's `columns`, which mixes the two in
   * prose (issues/76), so that `fieldClassFor` indexes only things that are
   * actually columns.
   */
  rows?: readonly string[];
  settledBy: readonly string[];
  note?: string;
};

/**
 * **Every column gets a field class, and a column with no class is unwritable**
 * (issues/28). Declaring the map as *data* buys default-deny by construction:
 * adding a column later forces someone to classify it rather than leaving an
 * open door — issues/30's structural-over-disciplinary move applied to the
 * schema's growth. `fieldClassFor` below is what makes that true in code rather
 * than in prose.
 *
 * issues/8 named seven columns before most of these tables existed; issues/10
 * completed the map, the one place that ticket adds a rule rather than applying
 * one; issues/61 split the Roster class in two, taking the count to thirteen.
 * issues/62 gave seven of these classes a screen and added nobody to them.
 *
 * `updated_at` / `updated_by` are deliberately **not** a class anyone chooses to
 * write — they are a side effect of the writer — but they are listed at the end
 * so that no column is unclassified.
 */
export const FIELD_CLASSES = [
  {
    name: "Structural",
    writers: NOBODY,
    stateGate: { gate: "no-field-write" },
    columns: [
      "offering.course_id",
      "offering.term_code",
      "offering.program_code",
      "course.program_code",
    ],
    settledBy: ["issues/8", "issues/28", "issues/30"],
    note: "*Nobody — immutable* names no actor, which is why issues/28 reclassified this from a permission to an **invariant**, and why it is the one class enforceable twice: stated here and enforced in the schema, where the database copy is strictly more restrictive and fails loudly. issues/30 bought `ON UPDATE NO ACTION` on the composite foreign key, so Postgres refuses any update to `course.program_code` while offerings exist. Changing one of these means `kill` and recreate. The filing is load-bearing: it is what stops the chair re-homing a course (issues/34).",
  },
  {
    name: "Machine-owned",
    writers: NOBODY,
    stateGate: { gate: "no-field-write" },
    columns: ["course.edition"],
    columnNames: ["snapshot", "status"],
    settledBy: ["issues/6", "issues/10", "issues/13"],
    note: "Written by `applyTransition` only. `status` is a generated column over `snapshot->>'value'` (issues/6), so the database refuses a direct write to it as well. `edition` is stored rather than derived, at the requester's direction, and bumps on `approve` — legal under standing principle 1 by the exemption route, one transaction writing both.",
  },
  {
    name: "Creation",
    writers: NOBODY,
    stateGate: { gate: "no-field-write" },
    columns: [],
    columnNames: ["created_at", "created_by", "granted_at", "granted_by"],
    settledBy: ["issues/13", "issues/25", "issues/34", "issues/61"],
    note: "Written once, by the creating path — whichever path that is. Position-0 roster rows take `granted_by` / `granted_at` redundantly with the log's `subject_netid`, because a conditional column is worse than a redundant one (issues/61).",
  },
  {
    name: "Course body",
    writers: [
      { role: "program_director", via: "program_director(course.program_code)" },
      { role: "area_head", via: "course.area_head" },
    ],
    stateGate: { gate: "states", machine: "course", states: ["Revising"] },
    columns: [
      "course.title",
      "course.description",
      "course.credits",
      "course.course_number",
      "course.url",
    ],
    settledBy: ["issues/8", "issues/10", "issues/28"],
    note: "The load-bearing case for issues/8's rule that **a field write is state-gated exactly where a state asserts something about that field's content**: `Approved` asserts the course body was approved, so editing that body must be confined to `Revising` — otherwise `revise` asserts nothing and `Approved` is a lie. issues/28 then found the gate names no actor, making it an invariant that binds the chair and the seed rather than a permission.",
  },
  {
    name: "Course assignment",
    writers: [{ role: "program_director", via: "program_director(course.program_code)" }],
    stateGate: { gate: "state-blind" },
    columns: ["course.area_head"],
    rows: ["course_area"],
    settledBy: ["issues/32", "issues/4", "issues/10"],
    note: "State-blind, and the first Course field that is: `Approved` asserts nothing whatever about the area, because **proposers never requested one** (issues/32). Director alone — an area-head route was rejected structurally, since a course with no head has no such actor, so the route could only ever apply to *re*assignment, which is the incumbent naming their own successor. The writer also refuses a netid not holding the `area_head` role (standing principle 6) and refuses any write that would leave the area set empty or the head null: assignment is monotone, which is what makes the create-time gate on offerings sufficient forever.",
  },
  {
    name: "Offering operational",
    writers: [
      { role: "coordinator", via: "flat" },
      { role: "program_director", via: "program_director(offering.program_code)" },
    ],
    stateGate: { gate: "state-blind" },
    columns: [
      "offering.section_number",
      "offering.call_number",
      "offering.sis_class_number",
      "offering.url",
      "offering.mode",
      "offering.enrollment_limit",
    ],
    rows: ["offering_meeting"],
    settledBy: ["issues/8", "issues/10", "issues/17"],
    note: "No Offering state asserts anything about a room, so this is blind to lifecycle state — `Concluded` included, on purpose. **The published-means-cancel rule is dead** (issues/8): it was an artifact of where `revise` happened to be wired, never a stated policy, and a freeze at `Published` would force a `Canceled` row for a typo and forbid the exact case issues/17 opened with. A director gate on operational edits after publication was rejected as unrealistic: rooms get reassigned after publication as routine, and the coordinator is who does it. issues/10 moved `room` onto `offering_meeting`, turning issues/8's *meeting pattern* class from a column into rows.",
  },
  {
    name: "Seat-sharing tags",
    writers: [
      { role: "program_director", via: "program_director(requirement_category.program_code)" },
      { role: "program_director", via: "program_director(area.program_code)" },
    ],
    stateGate: { gate: "state-blind" },
    columns: [],
    rows: ["offering_area", "offering_requirement_category"],
    settledBy: ["issues/25", "issues/30", "issues/10"],
    note: "**The sole exception to issues/4's rule that program scope applies to Offerings** (issues/25, made sole by issues/30). The scope comes from the category rather than from the offering: IMA's director writes IMA's tag onto ITP's offering, because whoever authors the claim writes the row. ITP's own director writing it was rejected — it would let one program unilaterally declare that its course satisfies another program's requirements. A new route, not a union of roles across scopes, which issues/8 forbade. This is the only refusal in the skeleton that points **away** from the record's own program (issues/62), so its wording names the other program outright rather than reading as a bug.",
  },
  {
    name: "Roster — position 0",
    writers: NOBODY,
    stateGate: { gate: "states", machine: "offering", states: ["Slated", "Staffed"] },
    columns: [],
    rows: ["offering_instructor at position 0"],
    settledBy: ["issues/15", "issues/28", "issues/61"],
    note: "**Not a field class** — `staff` / `unstaff` non-exposure. The row is written by the machine path (see `OFFERING_MATRIX`), never by the field writer, and the guarantee is a narrower event union at the action layer rather than a check. Frozen everywhere but `Slated` and `Staffed`, with `decline` and `withdraw` the only things that vacate it from `Offered` onward: a silently rewritten position 0 would leave the log saying one person was offered the class the roster says belongs to another.",
  },
  {
    name: "Roster — positions 1..n",
    writers: [{ role: "program_director", via: "program_director(offering.program_code)" }],
    stateGate: { gate: "state-blind" },
    columns: [],
    rows: ["offering_instructor below position 0"],
    settledBy: ["issues/61", "issues/8", "issues/15"],
    note: "**Narrowed by issues/61** from issues/8's *coordinator or director* to the offering's program director alone, on issues/8's own decision-versus-execution axis: seating a second paid instructor commits the department to an appointment in the way reassigning a room does not. State-blind in every state, `Concluded` included — `Staffed` asserts *position 0 is occupied* and nothing else, so no Offering state says anything about the rows below it. Order below 0 is a bare key: no promotion, no reorder, gaps legal. The writer refuses a netid not holding `instructor` (standing principle 6) and a netid the `people` project does not know (issues/9). A section may legally hold co-instructors and **no lead** — `Declined.retry` produces exactly that shape.",
  },
  {
    name: "Proposal body",
    writers: [
      { row: "course_proposal.created_by" },
      {
        role: "program_director",
        via: "program_director(course_proposal_review.program_code) of a review that is `Developing`",
      },
      {
        role: "area_head",
        via: "course_proposal_review.area_head of a review that is `Developing`",
      },
    ],
    stateGate: {
      gate: "states",
      machine: "course_proposal_review",
      states: ["Developing — on at least one of the proposal's reviews"],
    },
    columns: [
      "course_proposal.title",
      "course_proposal.description",
      "course_proposal.credits",
    ],
    settledBy: ["issues/8", "issues/10", "issues/32", "issues/65"],
    note: "**Neither issues/8's table nor the narrow `created_by`-only form — issues/65 took a third shape.** Pure `created_by` has a hole: a director fires `develop` and can then edit nothing, so the job issues/8 gave `develop` shrinks to *hand it back to the proposer*. issues/8's flat-across-every-requested-program reading has the opposite hole, reaching further than disposing of one review because it changes what all of them are reading. So each route is scoped to the review that opened the edit — ITP cannot rewrite the body merely because IMA asked for changes; ITP must `develop` its own review first. **The `Developing` condition rides in the relationship and not in the `stateGate`**, which keeps the weaker actorless floor that `created_by` writes under. The body is shared across every review, so one program's `develop` opens an edit that changes what every other program is reading — and it can change after another program has approved and minted from it, since the mint copies (issues/7). Cost accepted, not overlooked: an assigned head may now edit a body and then approve it.",
  },
  {
    name: "Review assignment",
    writers: [
      { role: "program_director", via: "program_director(course_proposal_review.program_code)" },
    ],
    stateGate: {
      gate: "states",
      machine: "course_proposal_review",
      states: ["Proposed", "Developing"],
    },
    columns: ["course_proposal_review.area_head"],
    rows: ["course_proposal_review_area"],
    settledBy: ["issues/32", "issues/10"],
    note: "The one field-write row issues/8 never listed. It lives on the review rather than the proposal because issues/25 made `area` program-scoped and a program-scoped assignment cannot sit on a body shared across programs. `approve` copies it forward onto the minted course. Not a state gate in issues/8's sense but a consequence of where the value goes: `Rejected` mints nothing, and after `Approved` the write lands on the course instead.",
  },
  {
    name: "Authorization",
    writers: [{ role: "chair", via: "flat" }],
    stateGate: { gate: "state-blind" },
    columns: [],
    rows: ["user_role", "program_director"],
    settledBy: ["issues/34", "issues/51", "issues/10"],
    note: "Chair alone, with no value-gated split. The tempting seam — qualifications are onboarding and therefore `coordinator`'s half, appointments are decision — was declined on both of the map's standing axes: under-grants are loud (*I can't onboard, ask the chair*) and adding the route later is additive where removing it takes a capability off someone who has it. Appointing a director is **two writes** and must not read as two acts. A director may not appoint a co-director for their own program, on circularity. See `REVOCATION_REFUSALS`. This is the one class that got a control before issues/62, and it got a dedicated page (issues/38).",
  },
  {
    name: "Timestamps",
    writers: NOBODY,
    stateGate: { gate: "no-field-write" },
    columns: [],
    columnNames: ["updated_at", "updated_by"],
    settledBy: ["issues/10"],
    note: "Written by the field writer alongside any write above, never by a trigger — issues/13 and issues/30 both rejected triggers on *where would a reader find it*, and issues/28 had already put the field writer in one place, which is what makes this nearly free. Not a class anyone chooses to write, listed so no column is unclassified. `person` has no `created_by` / `updated_by` at all: both name an actor, and nothing in the skeleton writes a person.",
  },
] as const satisfies readonly FieldClass[];

/**
 * **The default, and the whole of issues/28's *a column with no class is
 * unwritable*.**
 *
 * `fieldClassFor` is total and returns this for anything the map never
 * classified, so a writer asking about an unknown column gets a refusal with a
 * reason rather than `undefined` and a branch someone has to remember to write.
 * Adding a column to the schema without adding it here therefore fails closed
 * and loudly, which is the shape issues/30 called structural rather than
 * disciplinary.
 */
export const UNCLASSIFIED = {
  name: "Unclassified — unwritable",
  writers: NOBODY,
  stateGate: { gate: "no-field-write" },
  columns: [],
  settledBy: ["issues/28"],
  note: "No field class names this column, so nothing may write it. Classify it in `FIELD_CLASSES` — and in `docs/permissions/permissions.ts`, which is authoritative — behind a closed ticket.",
} as const satisfies FieldClass;

/** The same thirteen, widened off their literal types so they can be indexed. */
const CLASSES: readonly FieldClass[] = FIELD_CLASSES;

function indexBy(keysOf: (fieldClass: FieldClass) => readonly string[]) {
  return new Map<string, FieldClass>(
    CLASSES.flatMap((fieldClass) => keysOf(fieldClass).map((key) => [key, fieldClass] as const)),
  );
}

const CLASS_BY_COLUMN = indexBy((fieldClass) => fieldClass.columns);
const CLASS_BY_COLUMN_NAME = indexBy((fieldClass) => fieldClass.columnNames ?? []);

/**
 * The field class governing one column, named `table.column`. **Total by
 * design**: an unclassified column resolves to `UNCLASSIFIED`, whose writers are
 * `NOBODY` and whose gate is `no-field-write`.
 *
 * A qualified name wins over a bare one, so a table that ever needs its own rule
 * for a `created_by` can have one without disturbing the sweeping classes.
 */
export function fieldClassFor(column: string): FieldClass {
  const bare = column.slice(column.lastIndexOf(".") + 1);
  return CLASS_BY_COLUMN.get(column) ?? CLASS_BY_COLUMN_NAME.get(bare) ?? UNCLASSIFIED;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type ReadPredicate = {
  /** The predicate, in the words of the ticket that settled it. */
  rule: string;
  /** The arms, where the predicate has them. OR'd, evaluated independently. */
  routes?: readonly Route[];
};

export type ReadTier = {
  tier: 1 | 2 | 3;
  subjects: readonly string[];
  mayRead: ReadPredicate;
  mayAct: ReadPredicate;
  offeringStates?: readonly OfferingState[];
  settledBy: readonly string[];
  note?: string;
};

/**
 * **Reads are restricted, in three tiers** (issues/28, which found that
 * issues/8's matrix had no read rows at all).
 *
 * **Child rows inherit their parent's visibility**, so a hidden offering's
 * roster and log rows are hidden with it, and a review's log is Tier 3 rather
 * than Tier 2.
 *
 * **These tiers are a product rule, not a security boundary** — the finding that
 * ruled out RLS. issues/11 built impersonation deliberately, gated on
 * `ALLOW_DEV_ACTOR` *specifically so preview deploys carry it*, so anyone who
 * cannot see a `Declined` offering can see it two clicks later by becoming the
 * coordinator. RLS would be enforcing, at the one layer whose entire value
 * proposition is being un-bypassable, a rule that is bypassable by design.
 *
 * **may-read and may-act are two predicates, not one.** issues/28 wrote one per
 * tier; issues/42 split them and gave the split content on Tier 3 alone, because
 * a record you may reach is not necessarily a record you may act on.
 *
 * The **enforcement read is subject to no tier** (issues/34): the permission
 * check's own reads happen before authorization exists and cannot be gated by a
 * rule depending on their result. The tiers govern what a netid may **see**,
 * never what the server reads to decide.
 */
export const READ_TIERS = [
  {
    tier: 1,
    subjects: [
      "course",
      "term",
      "program",
      "requirement_category",
      "area",
      "offering (COMMITTED_STATES only)",
      "user_role",
      "program_director",
    ],
    mayRead: { rule: "any signed-in netid" },
    mayAct: { rule: "the matrix; the tier grants nothing" },
    offeringStates: COMMITTED_STATES,
    settledBy: ["issues/28", "issues/34"],
    note: "**Tier 1 is *signed in*, not *public*.** `getActor()` returns `{ netid } | null` and `null` sees nothing. Stated as *any actor with a netid* rather than *any role*, so a person holding zero `user_role` rows is not a second kind of `null`. `user_role` and `program_director` land here because a stricter tier would hide facts Tier 1 already announces: `instructor` is inferable from the roster on any committed offering, `area_head` from `course.area_head`. Two **anonymous** reads survive, both dev-only machinery the SSO swap deletes: the dev bar's user list and its role labels.",
  },
  {
    tier: 2,
    subjects: [
      "offering (outside COMMITTED_STATES)",
      "offering_transition rows",
      "course_transition rows",
    ],
    mayRead: {
      rule: "actor holds any acting role",
      routes: [
        { role: "instructor", via: "flat" },
        { role: "coordinator", via: "flat" },
        { role: "program_director", via: "flat" },
        { role: "area_head", via: "flat" },
        { role: "chair", via: "flat" },
      ],
    },
    mayAct: { rule: "the matrix; the tier grants nothing" },
    // `offeringStates` intentionally omitted here; Tier 2 covers offerings outside COMMITTED_STATES (see subjects/note).
    settledBy: ["issues/28", "issues/21", "issues/37"],
    note: "**The boundary is not arbitrary**: `student` and `advisor` are exactly issues/8's two empty rows, and the rule is *if you can do nothing, you may not see the record of who did*. The offering set is the complement of `COMMITTED_STATES` — six states that are the department's staffing process, which is the honest reason to hide `Declined`: internal work, not an embarrassing outcome. Hiding `Declined` alone was rejected for **announcing** the decline it hides. `Canceled` is deliberately visible: a class that was going to run and isn't is what a student most needs to see. issues/37 uses this predicate to decide whether a list's Actions column exists at all.",
  }
  {
    tier: 3,
    subjects: [
      "course_proposal",
      "course_proposal_review",
      "course_proposal_review_transition rows",
    ],
    mayRead: {
      rule: "you hold a may-act arm on **any** review of this proposal — the whole proposal and every sibling review then open read-only",
    },
    mayAct: {
      rule: "a may-act arm on this particular review",
      routes: [
        { role: "program_director", via: "program_director(course_proposal_review.program_code)" },
        { row: "course_proposal.created_by" },
        { role: "area_head", via: "course_proposal_review.area_head" },
        { role: "chair", via: "flat" },
      ],
    },
    settledBy: ["issues/28", "issues/32", "issues/42"],
    note: "Built up over three tickets: issues/28 wrote a deliberately narrow reversible default, issues/32 widened it with `review.area_head` once a review could carry an assigned head, issues/42 added the chair as the literal reading of a blanket clause. **issues/42 also widened reads past the arms entirely**: the reviews being independent and able to disagree is issues/7's whole reason for splitting the machine, and a screen that hides the disagreement hides the point. A review outside your arms opens **read-only** — body, assignment, siblings, and the history with its reasons. The middle option, naming the program but withholding the verdict, was rejected as the worst of the three.",
  },
] as const satisfies readonly ReadTier[];

/**
 * **A fourth read predicate, beside the tiers rather than inside them**
 * (issues/38). It governs a **page** rather than a table: `user_role` and
 * `program_director` stay at Tier 1, and what this decides is who may open the
 * roles page at all.
 *
 * Tier 2 would have cost nothing and was rejected at the requester's direction:
 * when advising arrives, an advisor is exactly the person who needs to know who
 * heads what. So `advisor` gains its first permission anywhere in the map.
 *
 * **The predicate is *holds any role other than `student`*, never *does not hold
 * `student`*.** ITP is full of graduate students who teach, and under the second
 * reading a student-instructor loses the page. issues/11 refuses role-narrowing,
 * so all of an actor's roles are always live and the distinction is not
 * academic. A `student` gets no page at all — no nav item, and the route
 * refuses.
 */
export const ROLES_PAGE = {
  mayRead: "holds any role other than `student`",
  mayWrite: "chair",
  settledBy: ["issues/38", "issues/34"],
  note: "A non-chair sees the same page with the controls **and** the refusals absent, not greyed — a refusal explains why a control will not fire, and a refusal with no control to refuse is dead text explaining a button that was never there. So a non-chair's page issues neither the dependency queries nor the refusal computation.",
} as const;

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

/**
 * **The test is whether the rule names an actor** (issues/28).
 *
 * - A **permission** is issues/4's conjunction — a role and a relationship. It
 *   always names who.
 * - An **invariant** holds regardless of who acts. It names nobody. A director
 *   cannot do it either, and neither can the chair, and neither can the seed.
 *
 * That test decides placement, **because the database has no actor**. With RLS
 * ruled out, Postgres cannot see who is acting, so exactly the actorless rules
 * are eligible for the schema and every actor-bearing rule must be in this
 * module. It also explains issues/8's instinct retroactively: *nobody —
 * immutable* names no actor, which is why immutability is the one field class
 * enforceable twice.
 *
 * The test turns on **expressibility and discoverability**, not on which project
 * a table lives in (issues/32): a conditional existence check across three
 * tables is intra-database and still stays out of the schema, because only a
 * trigger could express it and issues/13 and issues/30 both rejected triggers on
 * *where would a reader find it*.
 */
export type Invariant = {
  rule: string;
  where: string;
  settledBy: readonly string[];
  note?: string;
};

/** **issues/28's list, which had seven and now has eight** — the eighth is issues/61's. */
export const INVARIANTS = [
  {
    rule: "`retry` is refused when the Course is `Retired`",
    where: "inside `applyTransition`",
    settledBy: ["issues/14"],
  },
  {
    rule: "the seat-sharing tag writer refuses a category or area whose program equals the offering's",
    where: "inside that writer",
    settledBy: ["issues/30"],
  },
  {
    rule: "position 0 is writable only in `Slated` / `Staffed`",
    where: "field-class state gate",
    settledBy: ["issues/15"],
  },
  {
    rule: "the course body is writable only while `Revising`",
    where: "field-class state gate",
    settledBy: ["issues/8"],
  },
  {
    rule: "the proposal body is writable only while a review is `Developing`",
    where: "field-class state gate",
    settledBy: ["issues/8"],
    note: "**Kept in this weak, actorless form deliberately** (issues/65). The two routes issues/65 added are each confined to a review *of their own program* that is `Developing`, which is a state whose answer depends on who is asking — so it would make this invariant name an actor, and issues/28's separation is what stops the chair re-homing a course. The per-review condition lives in the `Relationship` instead. This floor is what `created_by` writes under, an author having no review of their own.",
  },
  {
    rule: "`offering (course_id, program_code)` matches its course",
    where: "**already in the schema** — a composite foreign key",
    settledBy: ["issues/30"],
  },
  {
    rule: "`staff` / `unstaff` are never user-facing",
    where: "not a check — a narrower event union at the action layer",
    settledBy: ["issues/15", "issues/28"],
  },
  {
    rule: "the field writer refuses any write naming position 0, in every state",
    where: "inside the field writer",
    settledBy: ["issues/61"],
  },
] as const satisfies readonly Invariant[];

/**
 * Actorless rules that landed after issues/28 wrote its list. Same class, same
 * test, same placement rule — kept separate only because issues/28's seven are
 * cited as a set.
 */
export const FURTHER_INVARIANTS = [
  {
    rule: "an Offering may not be created against a Course that has no area and no area head",
    where:
      "inside the offering create path, which already loads the course row to derive `program_code`",
    settledBy: ["issues/32", "issues/30"],
  },
  {
    rule: "an Offering may not be created against a `Retired` Course",
    where: "inside the offering create path — the second door onto `noLiveOfferings`",
    settledBy: ["issues/43", "issues/14"],
  },
  {
    rule: "the area and area-head assignment is monotone — no write may leave the area set empty or the head null, and there is no unassign operation",
    where: "non-exposure at the action layer, `staff`/`unstaff`'s shape borrowed",
    settledBy: ["issues/32"],
  },
  {
    rule: "standing principle 6 — when a role is scoped by a relationship, the writer of the relationship refuses a subject who does not hold the role",
    where:
      "inside each relationship writer: `offering_instructor` (every row, not only position 0), `course.area_head`, `program_director`",
    settledBy: ["issues/34", "issues/32", "issues/61"],
  },
  {
    rule: "a roster write refuses a netid the `people` project does not know",
    where: "inside the roster writer",
    settledBy: ["issues/9", "issues/61", "issues/69"],
  },
  {
    rule: "the `user_role` writer refuses to remove the last `chair` row",
    where: "inside the authorization writer",
    settledBy: ["issues/34"],
  },
] as const satisfies readonly Invariant[];

/**
 * Standing principle 6 forbids *creating* a role-less relationship. Revocation
 * reaches the identical state through the other door, and worse — nothing
 * happens at the moment of damage: revoke `area_head` from someone heading
 * twelve courses and every `course.area_head` points at a netid holding no role,
 * with the courses working until someone tries to approve a review (issues/34).
 *
 * **Refuse-while-dependent**, and the predicate is over **live** dependencies
 * rather than all of them. A `Concluded` offering keeps its roster rows forever,
 * so *any roster row* would mean nobody who ever taught can be un-instructored.
 * Cascade was rejected against issues/32's monotonicity; dangling was rejected as
 * principle 6 evaded rather than obeyed.
 *
 * A revoke is a `DELETE`, not a `revoked_at`: a soft delete is how `user_role`
 * would drift into the temporal table issues/4 refused, since every permission
 * check would gain a `WHERE revoked_at IS NULL` and the one that forgets it
 * silently restores a revoked director. The accepted cost is that **a revoked
 * grant leaves no trace at all**.
 *
 * `program_director` here is the *role*. Removing someone from a **program** is
 * a different act with no refusal at all: the relationship row goes and the
 * qualification stays (issues/51).
 */
export const REVOCATION_REFUSALS = [
  {
    role: "instructor",
    refusedWhile: "the netid holds a roster row on an offering in LIVE_STATES",
    liveStates: LIVE_STATES,
    settledBy: ["issues/34", "issues/14"],
  },
  {
    role: "area_head",
    refusedWhile: "the netid is `course.area_head` on a non-`Retired` course",
    settledBy: ["issues/34", "issues/32"],
  },
  {
    role: "program_director",
    refusedWhile:
      "any `program_director` relationship row names the netid — principle 6 run backwards",
    settledBy: ["issues/34", "issues/51"],
  },
  {
    role: "chair",
    refusedWhile: "it is the last `chair` row",
    settledBy: ["issues/34"],
  },
] as const satisfies readonly {
  role: Role;
  refusedWhile: string;
  liveStates?: readonly OfferingState[];
  settledBy: readonly string[];
}[];

// ---------------------------------------------------------------------------
// Two rules with no boolean form
// ---------------------------------------------------------------------------

/**
 * Two read rules settled by this map have a **predicate half and a rendering
 * half**, and the rendering half is not expressible here. The predicate is
 * stated above; the rendering lives in `docs/prototypes/`, where variant D of
 * each file already holds it. Stated rather than duplicated, per rule 3 of
 * `docs/agents/spec-packages.md`.
 *
 * The second one's rule is worth carrying in full, because a page has a URL and
 * has to answer: **the refusal names no state.** *"There is no section here —
 * ITPG-GT 2233 has no section 3 in Fall 2025 that you can see."* Saying
 * `Declined` leaks exactly what hiding it is for; *"not visible to you"* was
 * rejected for confirming a section exists at that number, which is half the
 * leak; a silent redirect was rejected on issues/9's rule that a cosmetic fault
 * must not masquerade as a broken link.
 */
export const RENDERED_ELSEWHERE = [
  {
    rule: "`getReviewPage` returns the same record at two fidelities",
    predicateHere: "READ_TIERS tier 3 — mayRead against mayAct",
    renderingIn: "docs/prototypes/proposals-review.html, variant D",
    settledBy: ["issues/42"],
  },
  {
    rule: "a record-level refusal on a detail page, naming no state",
    predicateHere: "READ_TIERS — the tier that hid the row",
    renderingIn: "docs/prototypes/course-offering-detail.html, variant D",
    settledBy: ["issues/41", "issues/28"],
  },
] as const;
