// The permission model: the matrix, the read tiers, the field-class map and the
// invariant list, in one module.
//
// **Reference, not application code.** Nothing runs this and nothing imports it into
// a running system — see docs/README.md. The application's copy is lib/permissions.ts,
// converted by #76; this file stays authoritative, and where the two disagree the copy
// is wrong.
//
// One module is deliberate.
// https://github.com/nopivnick/lineup-prototype-03/issues/28 put the matrix and the
// read tiers together so that *what may a `student` do* is one file, on the same
// "where would a reader find it" ground that rejected RLS, database triggers and a
// split along the read/write axis. The field-class map arrives here from
// docs/schema/README.md by
// https://github.com/nopivnick/lineup-prototype-03/issues/50, which ruled it ticket
// 28's third ruling, homed in schema only because permissions had no directory yet.
//
// Every claim below names the ticket that settled it, per rule 2 of
// docs/agents/spec-packages.md. `#n` is
// https://github.com/nopivnick/lineup-prototype-03/issues/n throughout.
//
// Where the checks physically run (ticket 28):
//
//   permitted(actor, write) =
//       machineLegality(write)                     // the machine offers this edge
//     AND invariants(write)                        // actorless; binds the seed too
//     AND (permissions(actor, write) OR holds(actor, "chair"))
//
// with the permission check **inside** each single writer rather than beside it —
// inside `applyTransition` for transitions, inside the field writer for field
// writes, inside the create path for creation. The Server Action is an
// actor-resolution wrapper, not an auth wrapper, and the seed script is checked like
// anyone else. `actor` is a bare netid end to end: every relationship is re-read
// inside the locking transaction, so a role set resolved at request scope would be
// stale by the time it was used (#28, confirming #11).
//
// The server computes, per row, the set of actions this actor may fire — legality
// AND invariants AND permissions, already intersected — and ships it as data. The
// client renders from that set alone and computes nothing; the machine is never
// imported client-side (#28, amending #6). The refused thing and its explanation are
// one value (#14), so a refusal and its reason cannot drift.
//
// This module is server-only.

import type { OfferingState } from "../machines/offering.machine";
import { COMMITTED_STATES, LIVE_STATES } from "../machines/offering.machine";

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/**
 * The seven values of `user_role.role`.
 *
 * Charting settled four. #4 renamed "Admin" to `program_director` and added
 * `area_head`; #8 found that rename had left the department's operational seat
 * unoccupied and added `coordinator`; #34 added `chair` to author the table itself.
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
 * #34's split of what `user_role` holds. It is not decoration — it is what decides
 * whether the chair's bypass reaches a rule.
 *
 * - **capability** — flat, actor-side, fully subsumed by `chair`. `coordinator`, and
 *   nothing else.
 * - **qualification** — subject-side. Gates whether a *relationship row may name
 *   you*, and is subsumed by nothing: the bypass covers what a person may **do**,
 *   never what may be **done to** them. So a chair who does not hold `instructor`
 *   cannot be staffed on an offering, and grants themselves the role before teaching
 *   (#34).
 * - **superuser** — `chair`, the first role that is its own scope.
 *
 * `student` is the one value #34 placed in neither: its content is registration,
 * which is out of scope, so it has no relationship to be the subject of. Recorded as
 * unclassified rather than guessed at.
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
 * The relationship half of a permission. #4 made a permission a conjunction of a
 * flat role and a relationship; the role is never scoped by itself.
 *
 * `"flat"` means department-wide, no relationship to check.
 *
 * #30 collapsed two of these: *director of the offering's program* and *director of
 * the course's program* are provably the same set, since `offering (course_id,
 * program_code)` is a composite foreign key into `course` and the create path
 * derives `program_code` from the course rather than taking it as an argument. Only
 * `program_director(offering.program_code)` appears below.
 *
 * **Two of these carry a state, and they are the first that do** (#65). Until #65 a
 * relationship was a row that either exists or does not; #32 came closest with *a
 * review with no assigned head has nobody holding it*, but that is a row **missing**,
 * not a row **dormant**. The two `… of a review that is Developing` arms below hold a
 * row that exists and stops conferring anything when the review moves off
 * `Developing`.
 *
 * This is deliberate and it is where the condition had to go. #28 split a field rule
 * into a state predicate that **names no actor** and a role predicate that does, and
 * that filing is what stops the chair re-homing a course. *Whose own review is
 * `Developing`* is a state whose answer depends on who is asking, so it cannot sit in
 * a `StateGate` without making the actorless half name an actor. #4 already lets the
 * relationship vary by actor, so it rides here instead. The `StateGate` on the
 * Proposal body class keeps the weaker actorless floor — *at least one review is
 * `Developing`* — which is what `created_by` writes under, an author having no review
 * of their own.
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
 * results OR'd. Never union the roles first and then check a single scope** (#8).
 * The distinction is not pedantic: a director of ITP who is also area head of an IMA
 * course may re-approve that course by the area-head route, and must not be able to
 * cancel an IMA offering by borrowing the director role's scope. Unioning at the
 * role level dissolves #4's conjunction.
 *
 * `{ row: ... }` is the one arm that is not a role at all — a comparison against a
 * column on the record itself.
 */
export type Route =
  | { role: Role; via: Relationship }
  | { row: "course_proposal.created_by" };

/**
 * Nobody. Distinct from an unwritten rule: an empty route list is a **refusal**,
 * and under #28's *a column with no class is unwritable* it is also the default for
 * anything the map never classified.
 */
export const NOBODY: readonly Route[] = [];

/**
 * The chair sits **one OR-clause ahead of the whole matrix**, and in the permission
 * term only (#34, confirmed against curriculum approval by #42 at the requester's
 * direction).
 *
 * A clause rather than a seventh column with every cell filled: a column is a
 * hand-maintained restatement of the word *all*, re-broken by every event the map
 * adds, where a clause covers new events by construction (#13's *prefer the form
 * that cannot be forgotten*).
 *
 * So the chair **cannot**:
 * - fire an event the machine does not offer — `cancel` from `Slated` is refused for
 *   the chair as for anyone;
 * - violate an invariant — cannot create an offering whose course lacks an area and
 *   a head (#32), cannot create one against a `Retired` course (#43), cannot `retry`
 *   against a `Retired` course (#14) — the last two being **one contradiction guarded
 *   at two doors**, neither replacing the other, and creation the door a chair is
 *   likeliest to walk through, since #13 made it an act and not a transition, so it
 *   writes no log row at all — cannot write the immutable Structural class, which #28
 *   reclassified from a permission to an invariant on the test that it names no
 *   actor. That reclassification is the whole of what makes a superuser safe to add:
 *   #30's re-homing rule survives a chair *only because of where the rule was filed*;
 * - be named as the subject of a relationship they are not qualified for — standing
 *   principle 6 constrains the subject and names no actor, so it is an invariant too.
 *
 * On a field write the chair is ahead of the **role** predicate and never the
 * **state** predicate (#62): a chair gets the Edit control on an `Approved` course
 * and the body section is still absent from the form.
 */
export const CHAIR_BYPASS = {
  clause: "holds(actor, 'chair')",
  bypasses: "permissions",
  neverBypasses: ["machine legality", "invariants", "field-class state gates"],
  settledBy: ["#34", "#42", "#62"],
} as const;

// ---------------------------------------------------------------------------
// The transition matrix
// ---------------------------------------------------------------------------

/**
 * One act and the routes that reach it. `routes` are OR'd.
 *
 * These tables hold **transitions and creation acts only**. Field writes live in
 * FIELD_CLASSES below — #8 wrote both in one table per machine, and #10 then made
 * the field-class map the operative form for every column in the schema. Keeping a
 * field rule in both places would be the second copy rule 3 of
 * docs/agents/spec-packages.md forbids.
 */
export type Act = {
  act: string;
  routes: readonly Route[];
  settledBy: readonly string[];
  note?: string;
};

/**
 * **CourseProposalReview** — scoped by the review's own `program_code`.
 *
 * The review *is* a program by construction (#7 made it one actor per
 * `(proposal, program)`), which is why #8 overturned #4's flat-approval rule: flat
 * approval would let an ITP director dispose of the IMA review of the same proposal,
 * emptying out #7's whole reason for splitting the machine. Disagreement requires
 * two different people.
 *
 * **Proposing confers nothing** — no ownership, no later `revise` right (#8). #7
 * made the minted course *copy* the proposal's body rather than reference it, so
 * there is no link from a course back to its proposer, and the mint is ambiguous the
 * moment one proposal mints three courses in three catalogs. (#42 later added
 * `course.minted_from_review_id`, which references the **act** and not the text, and
 * does not disturb this.)
 */
export const COURSE_PROPOSAL_REVIEW_MATRIX = [
  {
    act: "create proposal — mints one review per requested program, in one transaction",
    routes: [
      { role: "instructor", via: "flat" },
      { role: "program_director", via: "flat" },
      { role: "area_head", via: "flat" },
    ],
    settledBy: ["#8", "#65"],
    note: "**#8's table, restored by #65** after #43 and #42 had narrowed it to `instructor` alone. The narrowing had no ruling behind it: #43's own body states *#8 already wrote both — proposing is the `instructor` role*, which is a misquote of the row, so its resolution's *directing is not a superset of teaching* is a sound derivation from a premise #8 never wrote. It never saw the wide reading and so never weighed it. **All three arms are flat because the act is flat by construction** — at create time there is no proposal, no review and no course, so nothing exists for any relationship to scope to. Under #34 all three are *qualifications*, normally scoped by a relationship; on create none of them can be, `instructor` included. Any objection to a flat director arm therefore applies word-for-word to the flat instructor arm nobody disputes. Third instance of #61's shape — a later package restating a #8 row narrower than #8 wrote it — and the third resolved for the table, after #61 and #32. **The requester confirmed every ITP/IMA/LowRes director teaches**, so the two added arms grant nobody today, and took them anyway: an empty set is a fixture fact rather than a rule, and #11 refuses role-narrowing. The chair already proposes by `CHAIR_BYPASS` without holding `instructor`, so *only teachers may propose* was never a live principle. There is no requested-programs table: a review row *is* the request (#10). The create form mints a proposal plus one review per program checked (#43).",
  },
  {
    act: "develop / approve / reject",
    routes: [
      { role: "program_director", via: "program_director(course_proposal_review.program_code)" },
      { role: "area_head", via: "course_proposal_review.area_head" },
    ],
    settledBy: ["#8", "#32"],
    note: "#32 resolved #8's own prose-versus-table contradiction in favour of the table. #8's prose dropped the area-head route for want of a subject — `approve` mints the course that carries `area_head` — and that reason is false, because a director may assign the head on the review before approving. The route is contingent rather than arbitrary: a review with no assigned head has nobody holding it. #42 later confirmed the chair reaches this too, by the blanket clause.",
  },
  {
    act: "approve — the seam that mints the course",
    routes: [
      { role: "program_director", via: "program_director(course_proposal_review.program_code)" },
      { role: "area_head", via: "course_proposal_review.area_head" },
    ],
    settledBy: ["#7", "#32", "#13"],
    note: "Not a separate permission — the same route as `approve` above, recorded separately because the act writes a second row. One transaction moves the review and creates the `course`, copying the body and the area assignment forward. `course.created_by` is the approving **actor** (#32 amending #13), which may be the area head rather than a director.",
  },
] as const satisfies readonly Act[];

/**
 * **Course** — scoped by `course.program_code` and `course.area_head`.
 *
 * The narrowest of the options #8 weighed, and a strict subset of them. An
 * instructor route on `revise` was seriously considered — the person likeliest to
 * notice a wrong description is whoever is teaching it — and declined on
 * reversibility: **under-grants are loud and over-grants are silent**. If
 * governance-only is too tight, an instructor hits a wall on day one and says so; if
 * the instructor route is too loose, nobody ever reports having been allowed to do
 * something they should not have been.
 *
 * Strict separation of duties (the reviser may never fire the matching `approve`)
 * was rejected on a firmer ground: it is the only option creating a **new
 * dependency**, since `approve` would have to read the transition log for who last
 * revised — putting the auth layer in the business of querying history that standing
 * principle 2 works to keep out.
 */
export const COURSE_MATRIX = [
  {
    act: "create",
    routes: NOBODY,
    settledBy: ["#7", "#8"],
    note: "Minted by an approving review and by nothing else. #43 confirmed the create forms make no course directly, which is what let #49 tighten `course.minted_from_review_id` to `NOT NULL`.",
  },
  {
    act: "revise / approve",
    routes: [
      { role: "program_director", via: "program_director(course.program_code)" },
      { role: "area_head", via: "course.area_head" },
    ],
    settledBy: ["#8", "#4"],
    note: "This is the half of #4's original rule that survived #8's overturning of flat approval — course approval by a director or by that course's own area head — on the machine where `course.area_head` exists to be checked.",
  },
  {
    act: "retire",
    routes: [{ role: "program_director", via: "program_director(course.program_code)" }],
    settledBy: ["#8"],
    note: "Director only. Gated additionally by the machine's `noLiveOfferings` guard over LIVE_STATES (#14), which is legality and not permission.",
  },
] as const satisfies readonly Act[];

/**
 * **Offering** — scoped by `offering.program_code`; the lead is roster position 0.
 *
 * The line between `coordinator` and `program_director` is **decision versus
 * execution**, and it is load-bearing for #4's central finding that program scope
 * applies to Offerings rather than Courses. `coordinator` is flat; if it held the
 * decisions too, a flat role could do everything to every program's offerings and
 * program scoping on offerings would be decorative. So everything that commits the
 * department, retracts something a person was told, or destroys data is reserved to
 * the offering's own program director.
 *
 * A vacancy is legal: nothing in the map requires a sitting director (#51). The cost
 * is that the program **freezes for new work** while nothing running breaks, since
 * `coordinator` holds the whole forward path department-wide.
 */
export const OFFERING_MATRIX = [
  {
    act: "create",
    routes: [{ role: "program_director", via: "program_director(offering.program_code)" }],
    settledBy: ["#8", "#30", "#13"],
    note: "Creating an Offering commits the program to running a class, so it is a decision. #13 made creation an act but not a transition, so it needs a permission with no event to hang it on. The program is checked against the value being written — which #30 then made unforgeable by having the create path derive it from the course inside the transaction: `program_code` never appears in the create signature.",
  },
  {
    act: "position-0 roster write — fires `staff` / `unstaff`",
    routes: [{ role: "program_director", via: "program_director(offering.program_code)" }],
    settledBy: ["#8", "#15"],
    note: "The **pick** is this write; `offer` is the separate act of asking (#15). Never user-facing: the Server Actions expose a narrower event union than `applyTransition` accepts, so divergence between the roster row and the machine state has no code path (#15, made structural at the type level by #28). Renumbering an existing row into position 0 is not a field write — it is `staff`.",
  },
  {
    act: "offer",
    routes: [
      { role: "coordinator", via: "flat" },
      { role: "program_director", via: "program_director(offering.program_code)" },
    ],
    settledBy: ["#8", "#15"],
    note: "On the coordinator's side because the decision was already recorded when the roster was written.",
  },
  {
    act: "accept / decline / defer",
    routes: [
      { role: "instructor", via: "offering_instructor position 0 of this offering" },
      { role: "coordinator", via: "flat" },
      { role: "program_director", via: "program_director(offering.program_code)" },
    ],
    settledBy: ["#8", "#15", "#21"],
    note: "Not scoped to the lead alone, which is what #8 expected before it read #15: `actor_netid` records who clicked, and a decline is routinely an admin taking a refusal by email. Extending the proxy from `decline` to all three fixes an arbitrary asymmetry — acceptances arrive by email exactly as refusals do — and inverts the risk in the right direction, `decline` being the one with a contractual cost under ACT-UAW Art. VI(B) (#21). No schema change: `defer` leaves the roster intact and the log stays honest under proxy without gaining a column (#19). Recording proxy as an explicit *acted as* was rejected — it needs a column #19 declined to add.",
  },
  {
    act: "withdraw / cancel / retry / kill",
    routes: [{ role: "program_director", via: "program_director(offering.program_code)" }],
    settledBy: ["#8", "#19", "#21"],
    note: "Director only — retraction and destruction. `retry` carries an invariant beside the permission: refused when the Course is `Retired` (#14).",
  },
  {
    act: "schedule / publish / list / run / evaluate / conclude",
    routes: [
      { role: "coordinator", via: "flat" },
      { role: "program_director", via: "program_director(offering.program_code)" },
    ],
    settledBy: ["#8"],
    note: "The forward path is departmental bookkeeping, not faculty judgement, and it cannot be automated away: #3 deferred term dates, so nothing in the schema can compute when a class starts and fire `run`. Every one of these is a human clicking a button — which is the vacancy that made `coordinator` the sixth role.",
  },
] as const satisfies readonly Act[];

/**
 * `student` and `advisor` hold nothing across all three matrices and across every
 * field class — **confirmed, not assumed** (#8).
 *
 * The advisor's real right, approving an advisee's wishlist before the lottery, is
 * out of scope, and #4 gave the skeleton no advisee table, so there is no
 * relationship to scope one by even if it were wanted. The student's interest is
 * registration, also out of scope.
 *
 * #34 retro-explained why these two rows are **complete rather than incomplete**: a
 * qualification's entire content sits on the subject side of a relationship, and
 * theirs are registration and the advisee link. That completeness is what #28 needed
 * when it landed the Tier 2 boundary on exactly these two — *if you can do nothing,
 * you may not see the record of who did*.
 *
 * `instructor` is nearly as thin: `accept` / `decline` / `defer` as the lead, plus
 * creating a proposal. Nothing else.
 *
 * They are kept as visible empty rows so the next reader can see they were
 * considered. Note that they are **no longer twins in what they may see** — #38 gave
 * `advisor` its first permission anywhere in the map, a page-level read.
 */
export const HOLD_NOTHING_IN_THE_MATRIX: readonly Role[] = ["student", "advisor"];

// ---------------------------------------------------------------------------
// The field-class map
// ---------------------------------------------------------------------------

/**
 * A field class carries **two predicates, ANDed and checked separately** (#28):
 *
 * - a **state** predicate — an invariant. It names no actor, so it binds the chair
 *   and the seed script alike.
 * - a **role** predicate — a permission. The chair's clause sits ahead of this one
 *   and never the other.
 *
 * Checked separately rather than merged, which is why a field refusal is sometimes
 * two sentences where a transition refusal is always one (#62): view an `Approved`
 * course as another program's director and the body is refused both because she is
 * not its director and because the course is not `Revising`. Stating one hides the
 * wall the reader walks into next.
 */
export type StateGate =
  /** Writable in every state, `Concluded` / `Canceled` / `Dead` included. */
  | { gate: "state-blind" }
  /** Writable only while the record is in one of these states. */
  | { gate: "states"; machine: "course" | "offering" | "course_proposal_review"; states: readonly string[] }
  /** No field-write path exists at all. */
  | { gate: "no-field-write" };

export type FieldClass = {
  name: string;
  writers: readonly Route[];
  stateGate: StateGate;
  columns: readonly string[];
  settledBy: readonly string[];
  note?: string;
};

/**
 * **Every column gets a field class, and a column with no class is unwritable**
 * (#28). Declaring the map as *data* buys default-deny by construction: adding a
 * column later forces someone to classify it rather than leaving an open door —
 * #30's structural-over-disciplinary move applied to the schema's growth.
 *
 * #8 named seven columns before most of these tables existed; #10 completed the map,
 * which is the one place that ticket adds a rule rather than applying one. #61 then
 * split the Roster class in two, taking the count to thirteen, and #106 classified
 * `course_requirement_category` — the growth case, arriving — taking it to fourteen.
 *
 * **This map lived in `docs/schema/README.md` until #50 moved it here**, on the
 * grounds that it is #28's third ruling and went to schema only because permissions
 * had no home. `docs/schema/README.md` keeps a link to it, because a schema reader
 * legitimately wants it.
 *
 * `updated_at` / `updated_by` are deliberately **not** their own class — they are a
 * side effect of the writer, not something anyone chooses to set — but they are
 * listed at the end so no column is unclassified.
 *
 * #62 gave seven of these classes a screen and added nobody to them: an edit page
 * per record, rendering only the classes open to you, with the rest stated as
 * refusals in the rail. #106's is the eighth, and it inherits that page by #62's
 * own rule rather than by a redraw.
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
    settledBy: ["#8", "#28", "#30"],
    note: "*Nobody — immutable* names no actor, which is why #28 reclassified this from a permission to an **invariant**, and why it is the one class enforceable twice: stated here and enforced in the schema, where the database copy is strictly more restrictive and fails loudly. #30 bought `ON UPDATE NO ACTION` on the composite foreign key, so Postgres refuses any update to `course.program_code` while offerings exist. Changing one of these means `kill` and recreate. The filing is load-bearing: it is what stops the chair re-homing a course (#34).",
  },
  {
    name: "Machine-owned",
    writers: NOBODY,
    stateGate: { gate: "no-field-write" },
    columns: ["every `snapshot` and `status`", "course.edition"],
    settledBy: ["#6", "#10", "#13"],
    note: "Written by `applyTransition` only. `status` is a generated column over `snapshot->>'value'` (#6). `edition` is stored rather than derived, at the requester's direction, and bumps on `approve` — legal under standing principle 1 by the exemption route, one transaction writing both.",
  },
  {
    name: "Creation",
    writers: NOBODY,
    stateGate: { gate: "no-field-write" },
    columns: [
      "every `created_at` / `created_by`",
      "every `granted_by` / `granted_at`",
    ],
    settledBy: ["#13", "#25", "#34", "#61"],
    note: "Written once, by the creating path — whichever path that is. Position-0 roster rows take `granted_by` / `granted_at` redundantly with the log's `subject_netid`, because a conditional column is worse than a redundant one (#61).",
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
    settledBy: ["#8", "#10", "#28"],
    note: "The state gate is the load-bearing case for #8's rule that **a field write is state-gated exactly where a state asserts something about that field's content**: `Approved` asserts the course body was approved, so editing that body must be confined to `Revising` — otherwise `revise` asserts nothing and `Approved` is a lie. #28 then found the gate names no actor, making it an invariant that binds the chair and the seed rather than a permission.",
  },
  {
    name: "Course assignment",
    writers: [{ role: "program_director", via: "program_director(course.program_code)" }],
    stateGate: { gate: "state-blind" },
    columns: ["course.area_head", "course_area rows"],
    settledBy: ["#32", "#4", "#10"],
    note: "State-blind, and the first Course field that is: `Approved` asserts nothing whatever about the area, because **proposers never requested one** (#32). That is what showed #8's per-artifact split was really the same field-class cut applied twice. Director alone — an area-head route was rejected structurally, since a course with no head has no such actor, so the route could only ever apply to *re*assignment, which is the incumbent naming their own successor. The writer also **refuses a netid not holding the `area_head` role** (standing principle 6) and refuses any write that would leave the area set empty or the head null: assignment is monotone, with no unassign operation, which is what makes the create-time gate sufficient forever. **What a course *counts toward* is not here** — same writer, different rule, and #106 gave it the class below.",
  },
  {
    name: "Course requirement categories",
    writers: [{ role: "program_director", via: "program_director(course.program_code)" }],
    stateGate: { gate: "state-blind" },
    columns: ["course_requirement_category rows"],
    settledBy: ["#106", "#25", "#28", "#32"],
    note: "**The table #28's growth case predicted, arriving** (#106). #25 put the course→category mapping in scope because the Catalog displays it, #74 asks each Catalog row to carry it, the table landed in `docs/schema/classes.sql` — and no field class ever claimed it, so *a column with no class is unwritable* made it unwritable. Correctly and loudly, which is the whole point of that rule: it surfaced when #78's seed had to write seventeen rows with no writer to write them through. The course's own program director, because **the seat-sharing question cannot arise on this table**: the composite foreign keys check `program_code` against the course on one side and the category on the other, so a course's categories are always its own program's, where an offering's are by definition another's (#30, #25). A **class of its own rather than a line added to Course assignment**, and the whole of the difference is monotonicity. #32's *no write may leave the area set empty* exists for one reason — the Offering create path refuses a course with no area and no head, so an emptied area set would break a gate the model relies on being sufficient forever. **No gate anywhere reads categories.** Carrying the rule across would be a refusal with no argument behind it, and it would refuse an ordinary curriculum revision that drops a requirement. An `area_head` route was declined on the area assignment's own ground and on one of its own: a head heads an *area*, and a category is what the **program's** degree requires. Two of the seventeen fixture courses carry a category and no head at all, so that route could never have been the only one. Under-grants are loud and over-grants are silent (#8).",
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
      "offering_meeting rows",
    ],
    settledBy: ["#8", "#10", "#17"],
    note: "No Offering state asserts anything about a room, so this is blind to lifecycle state — `Concluded` included, on purpose. **The published-means-cancel rule is dead** (#8): it was an artifact of where `revise` happened to be wired, never a stated policy, and a freeze at `Published` would force a `Canceled` row for a typo and forbid the exact case #17 opened with — *wrong room, wrong instructor credited, a call number keyed in wrong*. A director gate on operational edits after publication was rejected as unrealistic: rooms get reassigned after publication as routine, and the coordinator is who does it. #10 moved `room` onto `offering_meeting`, turning #8's *meeting pattern* class from a column into rows — same writers, different mechanism. #62 states `Concluded` on the edit page rather than refusing it.",
  },
  {
    name: "Seat-sharing tags",
    writers: [
      { role: "program_director", via: "program_director(requirement_category.program_code)" },
      { role: "program_director", via: "program_director(area.program_code)" },
    ],
    stateGate: { gate: "state-blind" },
    columns: ["offering_area rows", "offering_requirement_category rows"],
    settledBy: ["#25", "#30", "#10"],
    note: "**The sole exception to #4's rule that program scope applies to Offerings** (#25, made sole by #30). The scope comes from the category rather than from the offering: IMA's director writes IMA's tag onto ITP's offering, because whoever authors the claim writes the row. ITP's own director writing it was rejected — it would let one program unilaterally declare that its course satisfies another program's requirements. A new route, not a union of roles across scopes, which #8 forbade. State-blind, and the retroactive-credit case is reachable on purpose. The two-sidedness the single row conflates — *ITP decides to share the seats, IMA decides that it counts* — would be a negotiation with states, which is a machine and not a join table, and is beyond the skeleton. This is the only refusal in the skeleton that points **away** from the record's own program (#62), so its wording names the other program outright rather than reading as a bug.",
  },
  {
    name: "Roster — position 0",
    writers: NOBODY,
    stateGate: { gate: "states", machine: "offering", states: ["Slated", "Staffed"] },
    columns: ["the `offering_instructor` row at position 0"],
    settledBy: ["#15", "#28", "#61"],
    note: "**Not a field class** — `staff` / `unstaff` non-exposure. The row is written by the machine path (see the Offering matrix), never by the field writer, and the guarantee is a narrower event union at the action layer rather than a check (#15, #28). Frozen everywhere but `Slated` and `Staffed`, with `decline` and `withdraw` the only things that vacate it from `Offered` onward: a silently rewritten position 0 would leave the log saying one person was offered the class the roster says belongs to another.",
  },
  {
    name: "Roster — positions 1..n",
    writers: [{ role: "program_director", via: "program_director(offering.program_code)" }],
    stateGate: { gate: "state-blind" },
    columns: ["`offering_instructor` rows below position 0"],
    settledBy: ["#61", "#8", "#15"],
    note: "**Narrowed by #61** from #8's *coordinator or director* to the offering's program director alone, on #8's own decision-versus-execution axis: seating a second paid instructor commits the department to an appointment in the way reassigning a room does not. State-blind in every state, `Concluded` included — **re-grounded rather than re-decided**: #15's *positions 1..n stay non-gating and freely editable in any state* stands, but it hung on `revise`, which #17 deleted. The surviving ground is #8's field-class rule — `Staffed` asserts *position 0 is occupied* and nothing else, so no Offering state says anything about the rows below it. Order below 0 is a bare key: no promotion, no reorder, gaps legal, since legacy `section_x_instructor` had neither an order nor a lead to inherit. The writer refuses a netid not holding `instructor` (standing principle 6) and a netid the `people` project does not know (#9). A section may legally hold co-instructors and **no lead** — `Declined.retry` produces exactly that shape.",
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
    settledBy: ["#8", "#10", "#32", "#65"],
    note: "**Neither #8's table nor the narrow form — #65 took a third shape, and it is the one place that ticket did not simply restore #8.** #8's table reads `created_by`, a director of **any requested** program, or `area_head`; #10, #42 and #62 all read `created_by` alone. The table is residue: #8 overturned flat approval three lines above this row — *flat approval would let an ITP director dispose of the IMA review* — rewrote the `develop`/`approve`/`reject` row to be program-scoped, and left this one flat across every requested program, which reaches **further** than disposing of one review because it changes what all of them are reading. #32 read all three rows, program-scoped that one, and left this one behind. But pure `created_by` has a hole of its own: a director fires `develop` and can then edit nothing, so the job #8 gave `develop` shrinks to *hand it back to the proposer*. So the route is scoped to the review that opened the edit — ITP cannot rewrite the body merely because IMA asked for changes; ITP must `develop` its own review first. The area-head arm has a subject only because #32 invented `course_proposal_review.area_head`; before that it was subjectless, which is why #8's own line dropping area heads from the review *entirely* left it standing here unnoticed. **The `Developing` condition rides in the relationship and not in the `stateGate`** — see `Relationship`, and the amendment in the README. Gating on `Developing` gives `develop` a job exactly as `revise` has one: a typo fix after submission costs a `develop`, which is what *submitted for review* should mean (#8). The body is **shared across every review of the proposal**, so one program's `develop` opens an edit that changes what every other program is reading — and it can change after another program has already approved and minted from it, since the mint copies (#7). #42 made both pages state that drift; #62 made the review edit page name whose body it is about to rewrite. **Cost accepted, not overlooked**: #42 seeded *Critical Data Practice* as the fixture where a proposer who is also `review.area_head` writes and approves unsupervised; this makes that reachable **without being the proposer**, since an assigned head may now edit the body and then approve it.",
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
    columns: [
      "course_proposal_review.area_head",
      "course_proposal_review_area rows",
    ],
    settledBy: ["#32", "#10"],
    note: "The one field-write row #8 never listed. It lives on the review rather than the proposal because #25 made `area` program-scoped and a program-scoped assignment cannot sit on a body shared across programs — which is the definition of a review under #7. `approve` copies it forward onto the minted course. Not a state gate in #8's sense but a consequence of where the value goes: `Rejected` mints nothing, and after `Approved` the write lands on the course instead. Deliberately **not** modelled on the proposal-body confinement, which exists to give `develop` a job and applies to what proposers wrote — which this is not.",
  },
  {
    name: "Authorization",
    writers: [{ role: "chair", via: "flat" }],
    stateGate: { gate: "state-blind" },
    columns: ["user_role rows", "program_director rows"],
    settledBy: ["#34", "#51", "#10"],
    note: "Chair alone, with no value-gated split. The tempting seam — qualifications are onboarding and therefore `coordinator`'s half, appointments are decision — was declined on both of the map's standing axes: under-grants are loud (*I can't onboard, ask the chair*) and adding the route later is additive where removing it takes a capability off someone who has it. Appointing a director is **two writes** and must not read as two acts (#34, #38). A director may not appoint a co-director for their own program, on circularity. See REVOCATION_REFUSALS below. This is the one class that got a control before #62, and it got a dedicated page (#38).",
  },
  {
    name: "Timestamps",
    writers: NOBODY,
    stateGate: { gate: "no-field-write" },
    columns: ["every `updated_at` / `updated_by`"],
    settledBy: ["#10"],
    note: "Written by the field writer alongside any write above, never by a trigger — #13 and #30 both rejected triggers on *where would a reader find it*, and #28 had already put the field writer in one place, which is what makes this nearly free. Not a class anyone chooses to write, listed so no column is unclassified. `person` has no `created_by` / `updated_by` at all: both name an actor, and nothing in the skeleton writes a person.",
  },
] as const satisfies readonly FieldClass[];

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
 * **Reads are restricted, in three tiers** — #28, which found that #8's matrix had
 * no read rows at all. The only trace of a read rule anywhere in the map before it
 * was #4's parenthetical that co-instructors *carry permissions generally (catalog
 * visibility, editing)*, never cashed out.
 *
 * **Child rows inherit their parent's visibility**, so a hidden offering's roster and
 * log rows are hidden with it, and a review's log is Tier 3 rather than Tier 2.
 *
 * **These tiers are a product rule, not a security boundary** — the finding that
 * ruled out RLS. #11 built impersonation deliberately, gated on `ALLOW_DEV_ACTOR`
 * *specifically so preview deploys carry it*, so anyone who cannot see a `Declined`
 * offering can see it two clicks later by becoming the coordinator. RLS would be
 * enforcing, at the one layer whose entire value proposition is being un-bypassable,
 * a rule that is bypassable by design. The shape RLS *would* take is recorded on the
 * map for the effort that adds real authentication: three predicates, one per tier,
 * role-flat except a `created_by` comparison on proposals.
 *
 * **may-read and may-act are two predicates, not one.** #28 wrote one predicate per
 * tier; #42 split them, and gave the split content on Tier 3 alone — the finding it
 * called the one with the longest reach. On Tiers 1 and 2 the tier predicate governs
 * reading and the matrix above governs acting; on Tier 3 the tier itself has two
 * levels, because a record you may reach is not necessarily a record you may act on.
 *
 * The **enforcement read is subject to no tier** (#34). #28 made `actor` a bare
 * netid with relationships read *inside* the locking transaction; that read happens
 * before authorization exists and cannot be gated by a rule depending on its own
 * result. The tiers govern what a netid may **see**, never what the server reads to
 * decide.
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
    settledBy: ["#28", "#34"],
    note: "**Tier 1 is *signed in*, not *public*.** `getActor()` returns `{ netid } | null` and `null` sees nothing — the shape #11 chose, where SSO *replaces* the picker entirely. Stated as *any actor with a netid* rather than *any role*, so a person holding zero `user_role` rows is not a second kind of `null`. `user_role` and `program_director` land here (#34) because a stricter tier would hide facts Tier 1 already announces: `instructor` is inferable from the roster on any committed offering, `area_head` from `course.area_head`, `program_director` from the department's public existence. Two **anonymous** reads survive, both dev-only machinery the SSO swap deletes: the dev bar queries `person` for its user list (#11) and labels each fixture user with their roles (#34).",
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
    offeringStates: COMMITTED_STATES,
    settledBy: ["#28", "#21", "#37"],
    note: "**The boundary is not arbitrary**: `student` and `advisor` are exactly #8's two empty rows, and the rule is *if you can do nothing, you may not see the record of who did*. The offering set is the complement of COMMITTED_STATES — six states that are the department's staffing process, which is the honest reason to hide `Declined`: internal work, not an embarrassing outcome. Hiding `Declined` alone was rejected for **announcing** the decline it hides, an offering vanishing from `Offered` and reappearing in `Slated`. The boundary had to be *certifiable*, and *students see what has been published* is inexpressible under standing principle 3, since #21 gave `Canceled` five inbound edges, two of them pre-publication. `Canceled` is deliberately visible: a class that was going to run and isn't is what a student most needs to see. #37 uses this predicate to decide whether a list's Actions column exists at all.",
  },
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
    settledBy: ["#28", "#32", "#42"],
    note: "Built up over three tickets. #28 wrote `program_director` or `created_by` as an explicitly narrow reversible default so it could close; #32 widened it with `review.area_head` once a review could carry an assigned head; #42 added the chair as a fourth arm, confirmed at the requester's direction as the literal reading of a blanket clause, the alternative being a bypass with an exceptions list that grows. **#42 also widened reads past the arms entirely**, and recorded it as a widening rather than leaving it to look like an oversight: the reviews being independent and able to disagree is #7's whole reason for splitting the machine, and a screen that hides the disagreement hides the point. So every program's verdict shows on the proposal, and a review outside your arms opens **read-only** — body, assignment, siblings, and the history with its reasons, which was the whole justification. Refusing the page after showing the chip would be incoherent, since #41's refusal wording is phrased to leak nothing and the chip has already leaked it. The middle option — name the program, withhold the verdict — was rejected as the worst of the three: telling someone a decision exists and refusing to say what it was is the arrangement most likely to end in a phone call, which is the outcome the rule exists to make unnecessary.",
  },
] as const satisfies readonly ReadTier[];

/**
 * **A fourth read predicate, beside the tiers rather than inside them** — #38.
 *
 * It governs a **page** rather than a table. `user_role` and `program_director` stay
 * at Tier 1; what this decides is who may open the roles page at all.
 *
 * Tier 2 would have cost nothing and was rejected at the requester's direction:
 * when advising arrives, an advisor is exactly the person who needs to know who heads
 * what, and that is worth a rule. So `advisor` gains **its first permission anywhere
 * in the map**, ending the twinship #34 had just certified as complete — `student`
 * and `advisor` remain twins in the matrix and are no longer twins in what they see.
 *
 * **The predicate is *holds any role other than `student`*, never *does not hold
 * `student`*.** ITP is full of graduate students who teach, and under the second
 * reading a student-instructor loses the page. #11 refuses role-narrowing, so all of
 * an actor's roles are always live and the distinction is not academic.
 *
 * A `student` gets no page at all — no nav item, and the route refuses. That is
 * #37's *absent rather than empty* scaled from a column to a page, and it is a
 * product rule and not a security boundary, on #28's own finding.
 */
export const ROLES_PAGE = {
  mayRead: "holds any role other than `student`",
  mayWrite: "chair",
  settledBy: ["#38", "#34"],
  note: "A non-chair sees the same page with the controls **and** the refusals absent, not greyed — a refusal explains why a control will not fire, and a refusal with no control to refuse is dead text explaining a button that was never there. That is what makes the extra reads conditional: a non-chair's page issues neither the dependency queries nor the refusal computation.",
} as const;

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

/**
 * **The test is whether the rule names an actor** (#28).
 *
 * - A **permission** is #4's conjunction — a role and a relationship. It always
 *   names who.
 * - An **invariant** holds regardless of who acts. It names nobody. A director
 *   cannot do it either, and neither can the chair, and neither can the seed script.
 *
 * That test decides placement, **because the database has no actor**. With RLS ruled
 * out, Postgres cannot see who is acting, so exactly the actorless rules are
 * eligible for the schema and every actor-bearing rule must be in this module. It
 * also explains #8's instinct retroactively: *nobody — immutable* names no actor,
 * which is why immutability is the one field class enforceable twice.
 *
 * The test turns on **expressibility and discoverability**, not on which project a
 * table lives in (#32): a conditional existence check across three tables is
 * intra-database and still stays out of the schema, because only a trigger could
 * express it and #13 and #30 both rejected triggers on *where would a reader find
 * it*.
 */
export type Invariant = {
  rule: string;
  where: string;
  settledBy: readonly string[];
  /** Matches `Act` and `FieldClass`; added by #65, which needed to say why one of
   * these is stated more weakly than the rule a reader might expect. */
  note?: string;
};

/**
 * **#28's list, which had seven and now has eight.**
 *
 * Three of the original seven were the finding: #8's state gates read as
 * permissions and are not. *Only while `Revising`* names no actor. So those writes
 * carry a state predicate binding everyone including the seed, AND a role predicate
 * binding the actor, checked separately — which is also what gives #8's own rule its
 * proper form, since *a field write is state-gated exactly where a state asserts
 * something about that field's content* is a statement about states with no actor in
 * it.
 *
 * The eighth is #61's, and it is what makes the Roster class's state-blindness safe
 * rather than a licence to rewrite a `Published` section's lead by
 * `UPDATE … SET position = 0`.
 */
export const INVARIANTS = [
  {
    rule: "`retry` is refused when the Course is `Retired`",
    where: "inside `applyTransition`",
    settledBy: ["#14"],
  },
  {
    rule: "the seat-sharing tag writer refuses a category or area whose program equals the offering's",
    where: "inside that writer",
    settledBy: ["#30"],
  },
  {
    rule: "position 0 is writable only in `Slated` / `Staffed`",
    where: "field-class state gate",
    settledBy: ["#15"],
  },
  {
    rule: "the course body is writable only while `Revising`",
    where: "field-class state gate",
    settledBy: ["#8"],
  },
  {
    rule: "the proposal body is writable only while a review is `Developing`",
    where: "field-class state gate",
    settledBy: ["#8"],
    note: "**Kept in this weak, actorless form deliberately** (#65). The two routes #65 added are each confined to a review *of their own program* that is `Developing`, which is a state whose answer depends on who is asking — so it would make this invariant name an actor, and #28's separation is what stops the chair re-homing a course. The per-review condition lives in the `Relationship` instead. This floor is what `created_by` writes under, an author having no review of their own.",
  },
  {
    rule: "`offering (course_id, program_code)` matches its course",
    where: "**already in the schema** — a composite foreign key",
    settledBy: ["#30"],
  },
  {
    rule: "`staff` / `unstaff` are never user-facing",
    where: "not a check — a narrower event union at the action layer",
    settledBy: ["#15", "#28"],
  },
  {
    rule: "the field writer refuses any write naming position 0, in every state",
    where: "inside the field writer",
    settledBy: ["#61"],
  },
] as const satisfies readonly Invariant[];

/**
 * Actorless rules that landed after #28 wrote its list. Same class, same test, same
 * placement rule — kept separate only because #28's seven are cited as a set.
 */
export const FURTHER_INVARIANTS = [
  {
    rule: "an Offering may not be created against a Course that has no area and no area head",
    where: "inside the offering create path, which already loads the course row to derive `program_code`",
    settledBy: ["#32", "#30"],
  },
  {
    rule: "an Offering may not be created against a `Retired` Course",
    where: "inside the offering create path — the second door onto `noLiveOfferings`",
    settledBy: ["#43", "#14"],
  },
  {
    rule: "the area and area-head assignment is monotone — no write may leave the area set empty or the head null, and there is no unassign operation",
    where: "non-exposure at the action layer, `staff`/`unstaff`'s shape borrowed",
    settledBy: ["#32"],
  },
  {
    rule: "standing principle 6 — when a role is scoped by a relationship, the writer of the relationship refuses a subject who does not hold the role",
    where: "inside each relationship writer: `offering_instructor` (every row, not only position 0), `course.area_head`, `program_director`",
    settledBy: ["#34", "#32", "#61"],
  },
  {
    rule: "a roster write refuses a netid the `people` project does not know",
    where: "inside the roster writer",
    settledBy: ["#9", "#61", "#69"],
  },
  {
    rule: "the `user_role` writer refuses to remove the last `chair` row",
    where: "inside the authorization writer",
    settledBy: ["#34"],
  },
] as const satisfies readonly Invariant[];

/**
 * Standing principle 6 forbids *creating* a role-less relationship. Revocation
 * reaches the identical state through the other door, and worse — nothing happens at
 * the moment of damage: revoke `area_head` from someone heading twelve courses and
 * every `course.area_head` points at a netid holding no role, with the courses
 * working until someone tries to approve a review (#34).
 *
 * **Refuse-while-dependent**, and the predicate is over **live** dependencies rather
 * than all of them. A `Concluded` offering keeps its roster rows forever (#14:
 * nothing deletes), so *any roster row* would mean nobody who ever taught can be
 * un-instructored. Cascade was rejected against #32's monotonicity; dangling was
 * rejected as principle 6 evaded rather than obeyed.
 *
 * A revoke is a `DELETE`, not a `revoked_at`: a soft delete is how `user_role` would
 * drift into the temporal table #4 refused, since every permission check would gain a
 * `WHERE revoked_at IS NULL` and the one that forgets it silently restores a revoked
 * director. The accepted cost is that **a revoked grant leaves no trace at all** —
 * the map's standing audit exclusion, not a hole in this table.
 *
 * `program_director` here is the *role*. Removing someone from a **program** is a
 * different act with no refusal at all: the relationship row goes and the
 * qualification stays (#51), which is the only shape under which #34's rule is
 * observable — cascading to the role means nobody ever reaches the state the refusal
 * was written for.
 */
export const REVOCATION_REFUSALS = [
  {
    role: "instructor",
    refusedWhile: "the netid holds a roster row on an offering in LIVE_STATES",
    liveStates: LIVE_STATES,
    settledBy: ["#34", "#14"],
  },
  {
    role: "area_head",
    refusedWhile: "the netid is `course.area_head` on a non-`Retired` course",
    settledBy: ["#34", "#32"],
  },
  {
    role: "program_director",
    refusedWhile: "any `program_director` relationship row names the netid — principle 6 run backwards",
    settledBy: ["#34", "#51"],
  },
  {
    role: "chair",
    refusedWhile: "it is the last `chair` row",
    settledBy: ["#34"],
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
 * Two read rules settled by this map have a **predicate half and a rendering half**,
 * and the rendering half is not expressible here. The predicate is stated below; the
 * rendering lives in `docs/prototypes/`, where variant D of each file already holds
 * it. Stated rather than duplicated, per rule 3 of docs/agents/spec-packages.md — a
 * decision lives in exactly one place.
 *
 * **1. `getReviewPage` returns the same record at two fidelities** (#42) — the first
 * read in the map that does. Tier 3's may-read and may-act above are the predicate;
 * which controls, refusals and history reasons each fidelity renders is
 * `docs/prototypes/proposals-review.html`, variant D. The read-only rendering is not
 * new machinery: it is what `student` and `advisor` already get elsewhere, and #38's
 * rule that read-only means controls *and* refusals **absent**, not greyed.
 *
 * **2. A record-level refusal on a detail page needs a rendering** (#41). A list row
 * outside its tier is simply absent, but a page has a URL and has to answer. The
 * predicate is the tier; the wording is `docs/prototypes/course-offering-detail.html`,
 * variant D, and the rule it follows is that **the refusal names no state** —
 * *"There is no section here — ITPG-GT 2233 has no section 3 in Fall 2025 that you
 * can see."* Saying `Declined` leaks exactly what hiding it is for. *"Not visible to
 * you"* was rejected for confirming a section exists at that number, which is half
 * the leak; a silent redirect was rejected on #9's rule that a cosmetic fault must
 * not masquerade as a broken link.
 */
export const RENDERED_ELSEWHERE = [
  {
    rule: "`getReviewPage` returns the same record at two fidelities",
    predicateHere: "READ_TIERS tier 3 — mayRead against mayAct",
    renderingIn: "docs/prototypes/proposals-review.html, variant D",
    settledBy: ["#42"],
  },
  {
    rule: "a record-level refusal on a detail page, naming no state",
    predicateHere: "READ_TIERS — the tier that hid the row",
    renderingIn: "docs/prototypes/course-offering-detail.html, variant D",
    settledBy: ["#41", "#28"],
  },
] as const;
