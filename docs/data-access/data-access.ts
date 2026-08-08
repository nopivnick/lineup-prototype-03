// The data-access seam: the identity reader, the view-shaped read modules, and the
// write paths. Signatures and row types only — the bodies are the build effort's.
//
// **Reference, not application code.** Nothing runs this and nothing imports it into
// a running system — see docs/README.md. The build effort converts it.
//
// The organising rule is
// https://github.com/nopivnick/lineup-prototype-03/issues/9's: **no page holds a
// database handle.** A page calls one of the seven read modules below and receives
// finished rows; behind that call sit both connections, the cross-project stitch,
// #28's read tiers and the per-record permitted-action set. That is a small
// interface over a large implementation, and it is what discharges the risk #28
// accepted when it ruled out RLS — *a forgotten `WHERE` is the silent-est over-grant
// of all* — structurally rather than by care: pages never write a `WHERE` clause
// because they never hold a handle.
//
// Every claim below names the ticket that settled it, per rule 2 of
// docs/agents/spec-packages.md. `#n` is
// https://github.com/nopivnick/lineup-prototype-03/issues/n throughout.
//
// This module is server-only. So is every module it describes.

import type { EventFromLogic, StateValueFrom } from "xstate";

import { machine as courseMachine } from "../machines/course.machine";
import { machine as reviewMachine } from "../machines/course-proposal-review.machine";
import { machine as offeringMachine } from "../machines/offering.machine";
import type { OfferingState } from "../machines/offering.machine";
import { FIELD_CLASSES } from "../permissions/permissions";
import type { Role } from "../permissions/permissions";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * A netid. The join key between the two projects, and the only thing `classes` ever
 * holds about a person (#5, #9).
 *
 * `offering_instructor.netid`, `course.area_head`, `user_role.netid` and every
 * `*_by` column are this. None of them is a foreign key and none of them can be —
 * `person` is in the other project.
 */
export type Netid = string;

/** `term.code`, `char(5)`: year plus semester ordinal, `20253` = Fall 2025 (#3). */
export type TermCode = string;

/** `program.code`: `ITP`, `IMA`, `LOWRES` (#7). */
export type ProgramCode = string;

/**
 * A `bigint GENERATED ALWAYS AS IDENTITY` key from `docs/schema/classes.sql`.
 *
 * `string` follows the precedent already set by `LiveOffering.id` in
 * `docs/machines/course.machine.ts`. Whether a `bigint` key surfaces as a string or
 * a number is a driver fact rather than a spec decision — postgres.js returns it as
 * a string by default — and nothing in this package depends on which.
 */
export type Id = string;

/** An ISO timestamp. Every `*_at` column in the schema is `timestamptz`. */
export type Timestamp = string;

/** The three event unions, read off the machines rather than restated (#13's rule that a hand-maintained second list is the thing that gets forgotten). */
export type CourseEvent = EventFromLogic<typeof courseMachine>["type"];
export type ReviewEvent = EventFromLogic<typeof reviewMachine>["type"];
export type OfferingEvent = EventFromLogic<typeof offeringMachine>["type"];

/** The Course and review state unions. `OfferingState` is exported by its own machine; these two are not, so they are read off the machines the same way. */
export type CourseState = StateValueFrom<typeof courseMachine>;
export type ReviewState = StateValueFrom<typeof reviewMachine>;

/**
 * The thirteen field-class names, read off `FIELD_CLASSES` rather than restated.
 * #28's *a column with no class is unwritable* means this union is also the complete
 * set of things a human may edit anywhere in the skeleton.
 */
export type FieldClassName = (typeof FIELD_CLASSES)[number]["name"];

/**
 * A Drizzle transaction handle on the `classes` connection.
 *
 * Untyped here because the concrete type comes from the build effort's `drizzle()`
 * instance. What matters for the spec is that **it exists and is a parameter**: #28
 * put every permission check *inside* the writer and #6 made a transition lock the
 * row and re-read its relationships inside the same transaction, so a writer that
 * opened its own connection could not be called by the seed script — which #13 made
 * a second caller on purpose.
 *
 * There is no `people` transaction anywhere. Nothing in the skeleton writes to
 * `people`, and no transaction spans the two projects (#5, #9).
 */
export type ClassesTx = unknown;

// ---------------------------------------------------------------------------
// Identity — #11
// ---------------------------------------------------------------------------

/**
 * The actor. A bare netid and nothing else.
 *
 * Roles are **not** here, deliberately (#11, confirmed with a stronger reason by
 * #28). Every relationship a permission consults is re-read inside the locking
 * transaction, and `getActor()` runs at request scope — so a role set resolved here
 * would already be stale by the time a writer used it. `actor` is a netid string end
 * to end.
 */
export type Actor = { netid: Netid };

/**
 * **The app's only identity import** (#11), and the whole of the seam to real auth.
 *
 * ```ts
 * // src/auth/actor.ts
 * if (!process.env.ALLOW_DEV_ACTOR) throw new Error('dev actor not enabled')
 *
 * export async function getActor(): Promise<{ netid: string } | null> {
 *   const netid = (await cookies()).get('lineup_dev_actor')?.value
 *   return netid ? { netid } : null
 * }
 * ```
 *
 * **Exactly one implementation at a time, and no `if (dev)` anywhere.** That is the
 * structural fact, not the throw: wiring SSO means replacing this body, and *the dev
 * path is still in* and *SSO is wired* cannot both be true. The throw is a belt.
 *
 * `null` is not an error — it means no cookie, and the app renders the picker
 * instead of the page, which is the same shape as *no session → sign in*. So SSO
 * **replaces** the entry screen rather than deleting a concept. A fallback fixture
 * user was rejected for being a concept real auth has no counterpart for, and for
 * making *nobody chose* indistinguishable from *someone chose user one*.
 */
export declare function getActor(): Promise<Actor | null>;

/**
 * The dev switcher's mechanism, recorded because the build effort inherits every
 * part of it (#11).
 *
 * The gate keys on `ALLOW_DEV_ACTOR` and **not** on `NODE_ENV`, because Vercel sets
 * `NODE_ENV=production` on previews too and a `NODE_ENV` gate would brick the exact
 * deployment the skeleton exists to be shown on. The absence of the var is what a
 * real production deploy looks like.
 *
 * **The inherited risk sits here and is recorded in `docs/README.md`**: a preview
 * URL carrying this var lets anyone with the link be any user, so that deployment
 * needs protection. Linked rather than restated.
 */
export const DEV_ACTOR = {
  cookie: "lineup_dev_actor",
  payload: "a bare netid — one opaque string, nothing else",
  writtenBy: "a Server Action, never the client directly",
  gate: "ALLOW_DEV_ACTOR",
  switches: "user, never role",
  settledBy: ["#11"],
  note:
    "A serialized `{netid, roles}` cookie was rejected: it makes the JSON an interface, and this map has changed the role set three times (#4, #8, #34), each change leaving stale cookies deserializing into actors holding roles that no longer exist. An index into a fixture array was worse — identity coupled to fixture ordering, with no error when the array is reordered. `netid` derives roles; roles do not derive a netid (#13's *prefer the side whose data derives the other's*). Switching **user** rather than role follows from #8's OR over independently-evaluated `(role, relationship)` conjunctions: an active-role filter narrows that OR, so the thing under test stops being the rule the app runs. *See it as instructor-only* is a fixture concern — seed a user who holds only `instructor`.",
} as const;

/**
 * The actor's roles, keyed by netid — **a separate function, deliberately not behind
 * `getActor()`** (#11).
 *
 * One reason to change: the seam exists because of the SSO swap, and SSO replaces
 * where the netid comes from without touching `user_role`, whose lookup is identical
 * before and after. Keeping them apart is also what stopped #11 answering #28's RLS
 * question on its behalf.
 *
 * This is the **read-side** lookup, wrapped in React `cache()` so two read modules
 * rendering on one page do not repeat it (#9; #28 already assumed roles load once per
 * request). The **write-side** check does not use it: #28 re-reads `user_role`,
 * `program_director`, `course.area_head` and roster position 0 inside the locking
 * transaction, because a request-scoped copy would be stale.
 *
 * The enforcement read is subject to no tier (#34): it happens before authorization
 * exists and cannot be gated by a rule that depends on its own result.
 */
export declare function getActorRoles(netid: Netid): Promise<readonly Role[]>;

// ---------------------------------------------------------------------------
// The clients, and the module boundary — #9
// ---------------------------------------------------------------------------

/**
 * **Drizzle over postgres.js, two instances, one per project.**
 *
 * The client was decided by **writes, not reads**, which is what the ticket did not
 * expect: the read has three viable answers and the write has one.
 *
 * - **supabase-js cannot express the write at all.** It speaks HTTP to PostgREST: no
 *   `SELECT … FOR UPDATE`, no multi-statement transaction. Every transition would
 *   become a plpgsql RPC, moving `applyTransition`'s body into the database —
 *   against #28's *one TypeScript module*, and against the *where would a reader
 *   find it* ground on which #13, #28 and #30 each rejected a trigger.
 * - **Prisma cannot state the settled schema.** Its schema language expresses
 *   neither generated columns nor check constraints, so `status` — the column the
 *   whole persistence design projects state through (#6) — would survive only as
 *   hand-edited migration SQL the generated client's types would lie about. Drizzle
 *   has `generatedAlwaysAs()`, `check()`, composite FK builders and `.for('update')`
 *   as first-class.
 *
 * **Pin the stable line and pass no schema to `drizzle()`.** The docs at
 * orm.drizzle.team describe 1.0 while `npm install` gives 0.45; the material
 * difference between the lines is the relational query builder, and handing
 * `drizzle()` no schema means `db.query.<table>` does not exist on the object. The
 * one API the docs are wrong about is not reachable by accident. Every read is core
 * `select()` / `leftJoin()`. This is #13's *prefer the form that cannot be
 * forgotten*, applied to a dependency instead of a column.
 */
export const CLIENT = {
  orm: "drizzle-orm, stable line (0.45.x as read on 2026-08-04), pinned",
  driver: "postgres (postgres.js), constructed `postgres(url, { prepare: false })`",
  instances: "two — `import * as people` / `import * as classes`, two schema modules",
  schemaPassedToDrizzle: false,
  settledBy: ["#9", "#5"],
  note:
    "`{ prepare: false }` because #5 established transaction mode as Supabase's stated serverless path and that it forbids prepared statements. `pg` is transaction-mode-safe by default with no flag to forget and was still rejected: `{ prepare: false }` is stated explicitly on both first-party pages a build agent will actually open, and choosing `pg` means walking off the only documented path for everything else on them. Forgetting the flag fails loudly under the pooler, which is the opposite of the failure mode #28 worried about.",
} as const;

/**
 * **Four connection strings, and they are not one string with the port swapped**
 * (#9, on #5's findings).
 *
 * Pooler connections use `postgres.[project-ref]` as the username against plain
 * `postgres` for direct, so these are four genuinely different strings. None may
 * carry a `NEXT_PUBLIC_` prefix.
 *
 * Transaction mode does not threaten #6's locking transaction — a transaction holds
 * its server connection for its duration. What is unavailable is session-level
 * state, which nothing here uses.
 */
export const CONNECTIONS = [
  { project: "people", use: "runtime (RSC, Server Actions)", endpoint: "Shared Pooler :6543, transaction mode" },
  { project: "classes", use: "runtime (RSC, Server Actions)", endpoint: "Shared Pooler :6543, transaction mode" },
  { project: "people", use: "migrations (drizzle-kit)", endpoint: "direct :5432, session mode" },
  { project: "classes", use: "migrations (drizzle-kit)", endpoint: "direct :5432, session mode" },
] as const;

/**
 * **The seam, made structural.** Both `drizzle()` instances live in one `server-only`
 * module, imported by the read modules and the writers and by nothing else, enforced
 * with an ESLint `no-restricted-imports` rule so **a page importing one fails the
 * build** (#9).
 *
 * This is the map's habitual move — #15 narrowed an event union so *divergence has
 * no code path*, #28 made an unclassified column unwritable, #30 bought a composite
 * foreign key so a rule could not be got wrong. Take the mistake off the table
 * rather than warn about it.
 *
 * Each db module opens with `import 'server-only'`, so a Client Component importing
 * one is a build error rather than a leak.
 *
 * **Recorded explicitly for the build effort: these are modules, not abstractions
 * with swappable implementations.** There is one adapter, Postgres. No
 * interface-plus-in-memory-fake ceremony — an agent handed the word *repository*
 * tends to produce that unbidden, and here it is pure cost.
 */
export const MODULE_BOUNDARY = {
  handlesLiveIn: "one server-only module holding both drizzle instances",
  mayImportIt: ["the seven read modules", "the four write paths"],
  mayNotImportIt: ["any page", "any component", "any Server Action directly"],
  enforcedBy: "ESLint no-restricted-imports — a page importing a handle fails the build",
  settledBy: ["#9", "#28"],
} as const;

/**
 * **`drizzle-kit` alone owns the schema, and coherence is `db:reset`** (#9).
 *
 * A finding first, because it reframes the question: after the choices above,
 * **nothing Supabase-specific is in use** — not supabase-js, not PostgREST, not Auth
 * (out of scope), not Storage, not RLS (out of scope, #28). What remains is hosted
 * Postgres and its pooler. That is why #5's open item 13 — *no primary source
 * reconciles ORM-owned migrations with `supabase/migrations`* — has no answer to
 * find: we no longer need the second tool.
 *
 * ```
 * db/
 *   people/   schema.ts   migrations/
 *   classes/  schema.ts   migrations/
 * drizzle.people.config.ts
 * drizzle.classes.config.ts
 * ```
 *
 * Two configs, each setting `out` **explicitly** — #5 found it defaults to `drizzle`,
 * so two configs that both leave it unset silently overwrite each other's
 * migrations.
 *
 * **A change touching both projects cannot be atomic, and the spec says so** rather
 * than letting a build agent assume otherwise: one commit, two migration files,
 * applied in sequence, and a failure of the second leaves it half-applied. What
 * makes that acceptable is #13's choice of **reseed** as the recovery path. So
 * coherence is not a property of the databases but of `db:reset` — drop, migrate
 * both, reseed both — over #13's machine-driven, #28's permission-checked seed,
 * which fails loudly when the two schemas disagree.
 */
export const MIGRATIONS = {
  tool: "drizzle-kit, two configs with distinct `out` directories",
  scripts: ["db:generate", "db:migrate", "db:reset"],
  order: "`people` before `classes`, every command run twice with `--config`",
  atomicity: "none across projects — one commit, two files, applied in sequence",
  recovery: "db:reset (#13)",
  settledBy: ["#9", "#5", "#13"],
} as const;

// ---------------------------------------------------------------------------
// The cross-project stitch — #9
// ---------------------------------------------------------------------------

/**
 * **Two queries, `classes` driving.** The page of rows is fetched from `classes`,
 * where all filtering, sorting and paging happen; the netids on that page are
 * batched into **one** further query against `people`, and matched in memory. **Two
 * round trips per page, independent of page size.** What is forbidden is a per-row
 * lookup — one round trip per row across a project boundary.
 *
 * A denormalised copy of names in `classes` was rejected on **standing principle
 * 1** — no second copy that no single transaction writes — which bites hardest here,
 * since no transaction *can* span two databases. #15 refused the identical shape
 * when it declined to mirror the roster into machine context. Legacy corroborates:
 * `lineup_official` denormalised instructor **netids**, never names.
 *
 * Foreign data wrappers were rejected because #5 could not confirm from a primary
 * source that `postgres_fdw` is permitted between two hosted Supabase projects, and
 * because they reintroduce exactly the coupling the two-project topology was chosen
 * to give up.
 */
export const STITCH = {
  drivenBy: "classes",
  roundTrips: 2,
  consumers: ["getLineupPage", "getRolesPage", "getCoursePage", "getOfferingPage", "getProposalsPage", "getReviewPage"],
  notAConsumer: "getCatalogPage — single-database, and the only person-free read in the skeleton (#37)",
  settledBy: ["#9", "#5", "#37"],
  note:
    "Filtering by netid is an ordinary single-database query. Filtering by **name** also works, by running the two queries in the other order — resolve names to netids in `people`, then filter `classes` by that set — so paging and counts stay accurate. What #9 ruled genuinely lost is **ordering a list alphabetically by instructor name**, since sorting precedes paging and the names are not in the database doing the sorting. #37 then removed the premise by not paging, so an in-memory sort is available for free — and still did not build it, because grouping leaves nowhere to put it: a course group has several sections and several instructors. Recorded because the two decisions are independent — an effort that ungroups the Lineup gets name sorting back at no cost, and one that adds a pager loses it again.",
} as const;

/**
 * One stitched name. **`displayName` is nullable and a row is never dropped for want
 * of one** (#9).
 *
 * Skipping entries whose person cannot be resolved produces a specific and damaging
 * failure: #15 built an entire lifecycle **state** on position 0 being occupied, so
 * an offering sitting in `Staffed` would render with an empty roster — a cosmetic
 * problem masquerading as the lifecycle being broken. Failing the page outright was
 * rejected too: one absent person would take down the whole Lineup for every user,
 * a larger outage than the fault.
 *
 * The rendering is #37's: the netid in monospace plus a quiet *no name on file*,
 * deliberately **not** styled as an error. `person.display_name` is itself a
 * generated column over the preferred/official name pair — see
 * `docs/schema/people.sql`.
 */
export type StitchedName = {
  netid: Netid;
  displayName: string | null;
};

/**
 * A stitched name plus `pronouns`, for the two places a person is presented **as a
 * person** rather than as the subject of a timestamp (#40): the roles page record,
 * and the instructor roster on an Offering page. Pronouns do not appear on history
 * lines, where they would read as noise.
 */
export type StitchedPerson = StitchedName & {
  pronouns: string | null;
};

// ---------------------------------------------------------------------------
// What every read module ships beside the record
// ---------------------------------------------------------------------------

/**
 * A refusal. **The refused thing and its explanation are one value** (#14), computed
 * server-side and shipped as data, so a rule and its explanation cannot drift.
 *
 * The wording rules are settled and live in `docs/prototypes/`, not here — three
 * clauses, accumulated across three tickets:
 *
 * 1. the refused thing and its reason are one object (#14);
 * 2. **name the person or the role, never the rule** (#37) — *"Only Theo Vance, the
 *    lead instructor, can accept this"*, never a quotation from the matrix;
 * 3. **name the dependency and list it** (#38), where the refusal's whole content is
 *    data elsewhere in the system — *"Nora Applebaum heads the area of 3 courses that
 *    have not been retired"*, followed by the three.
 *
 * `dependencies` is that third clause's list, and it is empty for the refusals that
 * name only a person or a role.
 */
export type Refusal = {
  sentence: string;
  dependencies: readonly string[];
};

/**
 * One entry in a record's permitted-action set: an event the machine offers from this
 * state, together with whether this actor may fire it and why not (#28, #37).
 *
 * The set is **already intersected** — machine legality AND invariants AND
 * permissions — and the client renders from it alone and computes nothing. The
 * machine is never imported client-side (#28, amending #6): #17 deleted every
 * Offering guard, so a client-side `.can()` became bare edge existence, while both
 * things that decide whether a control should be live are server-side.
 *
 * It is rendered **twice in two treatments and is not a second source of truth**
 * (#40, #41): a list row gets #37's `⋯ n` menu, whose count says *nothing to do
 * here* without opening anything; a detail page gets buttons with the refusals
 * stated beneath. The roles page gets a third treatment for a reason that is #37's
 * own — reasons-in-the-open lost there **on row height in a grouped table**, a
 * premise a one-record page does not have (#38).
 */
export type PermittedAction<Event extends string> =
  | { event: Event; permitted: true }
  | { event: Event; permitted: false; refusal: Refusal };

/**
 * The record-page rail's `Edit` control and everything it needs (#62).
 *
 * A record's field classes disagree about their writer and about their state rule —
 * that is why there are thirteen of them — so *everything you may change* is
 * **actor-shaped**, and the same URL is a different page for a coordinator and for a
 * director.
 *
 * - `open` is what the edit form will ask for. Where it is empty the record page
 *   carries **no `Edit` control at all** and every class's refusal instead.
 * - The control's label does not vary with the actor; the **count** beneath it does —
 *   *2 of 3 sections are yours*. A control whose name changes per reader stops being
 *   one act.
 * - `refused` carries **two refusals per class, not one**, because #28 ANDs a state
 *   predicate and a role predicate and checks them **separately**. Labelled *Not
 *   yours* and *Not now*. Stating one hides the wall the reader walks into next: an
 *   `Approved` course read by another program's director refuses its body on both
 *   counts. This is why a field refusal is sometimes two sentences where a transition
 *   refusal is always one.
 *
 * The chair sits ahead of `notYours` and never ahead of `notNow` (#34, #62): a chair
 * gets the `Edit` control on an `Approved` course and the body section is still
 * absent from the form.
 */
export type EditAffordance = {
  open: readonly FieldClassName[];
  refused: readonly {
    fieldClass: FieldClassName;
    notYours: Refusal | null;
    notNow: Refusal | null;
  }[];
};

/**
 * A record-level read result.
 *
 * A list row outside its tier is simply **absent** — invisibility is never something
 * a page must remember to honour, because the tiers filter in the query (#9). But a
 * page has a URL and has to answer, so a detail module returns this (#41).
 *
 * **The refusal names no state**, and its wording lives in
 * `docs/prototypes/course-offering-detail.html`, variant D — recorded in
 * `RENDERED_ELSEWHERE` in `docs/permissions/permissions.ts` and deliberately not
 * duplicated here. Saying `Declined` would leak exactly what hiding it is for.
 */
export type Visible<T> = { visible: true; page: T } | { visible: false };

/**
 * A record's history, as the detail pages read it (#40, #41).
 *
 * `null` for `student` and `advisor`: the history section is **absent, not empty**
 * (#37's *absent rather than empty*, scaled from a column to a page by #38 and to a
 * section by #41), on #28's Tier 2 predicate — *if you can do nothing, you may not
 * see the record of who did*. The rail's *last changed* box goes with it, being the
 * same class of fact.
 */
export type History = {
  /**
   * **Derived from `created_by` / `created_at` on the entity row, not a log row.**
   * #13 refused a genesis row and made `from_state` `NOT NULL`; a rendered line
   * derived from the entity is not one. The alternative is a history that begins
   * *"named Nora as lead instructor"* and sends you elsewhere to learn where the
   * thing came from.
   */
  creation: { by: StitchedName; at: Timestamp };
  moves: readonly HistoryLine[];
};

/**
 * One row of a `*_transition` table, with its netids stitched to names.
 *
 * `event`, `fromState` and `toState` are **exactly machine values** and that meaning
 * is load-bearing (#13) — the log is not a general audit log, and a later effort
 * inherits a table to add rather than a table to reshape.
 *
 * `subject` is `actor_netid`'s counterpart: `actor_netid` records who **clicked**,
 * and a decline is routinely recorded by an admin taking a refusal by email (#15).
 * #41 then gave `offer` and `accept` a subject too — the roster survives the event
 * but not the offering, so a log read after a withdraw-and-re-offer would otherwise
 * have an `offer` row attributable to nobody and an `accept` row attributable to
 * whoever holds position 0 *now*.
 *
 * `reason` is #10's free text, and it is what makes the log read like a real one
 * rather than a set of bare state changes — which is why the detail pages render a
 * **sentence per row** rather than the raw seven-column table.
 */
export type HistoryLine = {
  event: string;
  fromState: string;
  toState: string;
  actor: StitchedName;
  subject: StitchedName | null;
  reason: string | null;
  at: Timestamp;
};

/**
 * `updated_at` / `updated_by`, rendered as *last changed* in the rail (#40, #41).
 *
 * Complementary to the log rather than redundant with it: **#17 deleted the
 * transition a field write used to fire**, so this stamp is the only trace of the
 * edits the log is forbidden to record — sharpest for exactly the historical
 * corrections you would most want attributable. `null` means never changed since
 * creation, which the page states in words rather than as an empty box.
 */
export type LastChanged = { by: StitchedName; at: Timestamp } | null;

/** One meeting slot, `kind`-discriminated exactly as `offering_meeting`'s shape CHECK requires (#10). The three kinds render differently on purpose (#37): `weekly` → *Mon 18:30–21:00*, `dates` → *5 Jan – 16 Jan, 10:00–16:00*, `async` → *Asynchronous*, with no time and no room. This is the first thing in the skeleton that makes LowRes visibly different from ITP and IMA. */
export type Meeting =
  | { kind: "weekly"; dayOfWeek: number; startTime: string; endTime: string; room: string | null }
  | { kind: "dates"; startDate: string; endDate: string; startTime: string; endTime: string; room: string | null }
  | { kind: "async" };

/** A tag from the record's own program — an `area` or a `requirement_category` (#25). Rendered unlabelled, because every program name the Lineup renders is a seat-sharing grant. */
export type OwnTag = { name: string };

/**
 * A **foreign-program** tag: seat sharing (#25, #30).
 *
 * The only place in the whole model where a program other than the course's own
 * appears, which is why these carry the other program's name and own-program tags do
 * not. `grantedBy` / `grantedAt` are #25's columns, and #40 found the chip had been
 * rendering without them — hiding the sole cross-program act in the system behind
 * the one control designed to be read at a glance.
 */
export type ForeignTag = {
  programCode: ProgramCode;
  name: string;
  grantedBy: StitchedName;
  grantedAt: Timestamp;
};

// ---------------------------------------------------------------------------
// The seven read modules
// ---------------------------------------------------------------------------

/**
 * The inventory, so a build effort can see the shape of the layer before reading the
 * signatures. **Seven modules, one per view** (#9, #38, #41, #42).
 *
 * View-shaped rather than table-shaped, and that was argued rather than assumed: a
 * repository per table with generic find/list methods is **shallow** — the interface
 * is nearly as large as the implementation, and it hands the interesting part back,
 * since combining offerings with people is exactly what the caller would still be
 * doing. On the deletion test: delete a view-shaped module and the stitch plus the
 * tier predicates reappear in every reading page, re-derived slightly differently
 * each time; delete a table-shaped one and a thin wrapper over one query is lost.
 *
 * Returning the parts — table rows plus a `Map<netid, name>` for each view to
 * assemble — was rejected as the shallow shape the seam exists to prevent, and two
 * views disagreeing about what a row *is* would each have invented their own
 * assembly.
 */
export const READ_MODULES = [
  { module: "getCatalogPage", view: "Catalog", crossProject: false, settledBy: ["#9", "#37"] },
  { module: "getLineupPage", view: "Lineup", crossProject: true, settledBy: ["#9", "#37"] },
  { module: "getRolesPage", view: "Roles", crossProject: true, settledBy: ["#38"] },
  { module: "getCoursePage", view: "Course detail", crossProject: true, settledBy: ["#41"] },
  { module: "getOfferingPage", view: "Offering detail", crossProject: true, settledBy: ["#41"] },
  { module: "getProposalsPage", view: "Proposals list", crossProject: true, settledBy: ["#42"] },
  { module: "getReviewPage", view: "Review detail", crossProject: true, settledBy: ["#42"] },
] as const;

/**
 * **#62's three edit routes add no read module.** `/courses/:id/edit`,
 * `/classes/:id/edit` and `/reviews/:id/edit` are served by the three record modules
 * above, which already carry both halves an edit page needs: the record's values,
 * and `EditAffordance`.
 *
 * The affordance is not something the edit route introduces — the **record** page
 * needs it, to render the `Edit` control with its count and, where nothing is yours,
 * every class's refusal instead (#62). Once the record module computes it, an edit
 * module would return a subset of what the record module already returns.
 *
 * Recorded rather than left as an absence, because #38, #41 and #42 each announced
 * their new read modules in their consequences and #62 announced none — *it added
 * three routes and no questions*.
 */
export const EDIT_ROUTES = {
  routes: ["/courses/:id/edit", "/classes/:id/edit", "/reviews/:id/edit"],
  readsThrough: ["getCoursePage", "getOfferingPage", "getReviewPage"],
  writesThrough: "writeFields",
  settledBy: ["#62"],
} as const;

// --- Catalog ---------------------------------------------------------------

/**
 * **One row per Course, no term.** The Catalog lists Courses eligible to be offered,
 * now or in future (#9).
 *
 * **The only single-database read in the skeleton.** #37 answered *does the Catalog
 * display a person* in the negative, at the requester's direction and against the
 * recommendation, on the ground that the area head belongs on a course's detail
 * rather than in a list. The consequence is larger than a column: `getCatalogPage`
 * never touches `people` at all, which makes it the one view immune to the
 * cross-project failure mode. **Recorded because a build agent reading #9 alone
 * would build the batch fetch.**
 */
export declare function getCatalogPage(actor: Actor, filters: CatalogFilters): Promise<readonly CatalogGroup[]>;

/**
 * Grouped by program — a course belongs to exactly one, and the grouping costs
 * nothing (#37). The mechanism is mantine-datatable's `rowExpansion` with
 * `trigger: 'always'`, because **the library has no row grouping at all**: `groups`
 * groups columns. Sorting is not done by the table either — `sortStatus` plus
 * `onSortStatusChange` hand the app a column and a direction, so every sort in this
 * spec is the app's to implement.
 */
export type CatalogGroup = {
  programCode: ProgramCode;
  programName: string;
  courseCount: number;
  courses: readonly CatalogRow[];
};

/**
 * One Course. Not a table row, and deliberately **not** called `Course` — that name
 * belongs to the entity #7 settled (#9).
 *
 * Dropped from the row by #37: `description` and `url` (a row is not a place to read
 * prose), `edition`, and every `created_*` / `updated_*` column. All of them landed
 * on the Course detail page instead (#40, #41).
 */
export type CatalogRow = {
  courseId: Id;
  courseNumber: string;
  title: string;
  credits: number;
  areas: readonly OwnTag[];
  requirementCategories: readonly OwnTag[];
  status: CourseState;
  /**
   * **Derived, not stored** — true when `course_area` is empty or `course.area_head`
   * is null (#37), naming which of the two is missing.
   *
   * This is #32's create-time gate made visible one step earlier, where a director
   * can act on it, and it is the closest the Catalog gets to a Course state that #32
   * proved could not exist: the machine is flat and `Approved ⇄ Revising` has no room
   * for a fourth state. What could not be a state is a derived marker instead. Both
   * inputs are `classes`-side, so it costs nothing and the read stays
   * single-database.
   */
  notOfferableYet: { missingArea: boolean; missingAreaHead: boolean } | null;
  /** Absent — not empty — for an actor who can never act (#37). An always-empty column is dead width advertising a capability the reader will never have. */
  actions: readonly PermittedAction<CourseEvent>[] | null;
};

/**
 * `Retired` is excluded by the **filter's default, not by the query** (#37): a
 * `Revising` course is still eligible to be offered in future, and hiding a retired
 * one in the query would make the history unreachable from the only view that lists
 * courses.
 *
 * **`search` covers title and number only.** #37's filter sentence reads *"a search
 * box over title, number, instructor name and instructor netid"* across both views;
 * a Course has no instructor, and the same resolution made this module person-free.
 * The instructor half belongs to the Lineup.
 */
export type CatalogFilters = {
  search: string | null;
  programCode: ProgramCode | null;
  /** Defaults to `["Approved", "Revising"]`; *Any status* is one click away. */
  status: readonly CourseState[];
};

// --- Lineup ----------------------------------------------------------------

/**
 * **One row per Offering, scoped to a selected term** (#9).
 *
 * The Lineup is where the cross-project stitch earns its keep, instructors hanging
 * off Offerings rather than Courses — and since #37 made the Catalog person-free,
 * it is the only list that consumes it. Legacy drew the same line under the same
 * word: `lineup_official` is one row per section, `KEY lineup_official_term (year,
 * semester)`.
 *
 * **Neither view pages.** A term is a bounded thing and a pager fights grouping
 * directly: 25 rows a page splits a course's sections across a boundary. Stated for
 * the build so it fails loudly rather than quietly — this is a decision with a
 * threshold, not a law. It stops being true in the low thousands of rows, and the
 * recovery is *page by course, never by section*, which is a change inside this
 * module and no page changes.
 */
export declare function getLineupPage(actor: Actor, filters: LineupFilters): Promise<readonly LineupGroup[]>;

/**
 * Grouped on `(course_id, term_code)` — the key #9 named, sortable without a join,
 * and single-program by construction since #30 FK-constrained `offering.program_code`
 * to its course's. So no group carries an own-program label: there is nothing to
 * distinguish it from.
 *
 * **Course-level facts sit here, stated once**, and section rows carry only what
 * differs between siblings (#37).
 *
 * **A course whose every section is invisible to the actor does not appear at all.**
 * #37 asked for *a student's empty group* as an empty state and then found it was a
 * leak: an empty group announces that the department is staffing something the
 * student may not see, which is the whole content of the thing being hidden. This is
 * #9's *invisible rows are absent, never flagged*, applied to the container rather
 * than the row. The Catalog is what keeps the student honest — a `Dead` offering's
 * course stays listed there, so *never offered in Spring* and *offered and killed*
 * remain indistinguishable, as #28 required.
 */
export type LineupGroup = {
  courseId: Id;
  courseNumber: string;
  title: string;
  credits: number;
  areas: readonly OwnTag[];
  requirementCategories: readonly OwnTag[];
  sectionCount: number;
  sections: readonly LineupRow[];
};

/**
 * One Offering. **Amended by #37**: #9 sketched this row as carrying course title,
 * number, term and program alongside the offering's own facts; grouping moved every
 * course-level fact onto `LineupGroup`, and the term is the page's. What is left is
 * what differs between sibling sections.
 */
export type LineupRow = {
  offeringId: Id;
  sectionNumber: string;
  status: OfferingState;
  /** In `position` order, the lead marked where there is more than one. Never an array indexed by convention — see `leadOf`. */
  roster: readonly LineupRosterEntry[];
  meetings: readonly Meeting[];
  mode: string | null;
  enrollmentLimit: number | null;
  /** Rendered *Also counts toward*, one line beneath the group's own chips — the grant attaches to the section that made it, not to the course (#37). */
  foreignTags: readonly ForeignTag[];
  actions: readonly PermittedAction<OfferingEvent>[] | null;
};

/** The Lineup's roster entry. No pronouns: a list is not where a person is presented as a person (#40). */
export type LineupRosterEntry = { position: number } & StitchedName;

/**
 * The term picker is not optional — the Lineup is term-scoped by definition (#9).
 *
 * *"Who still needs an instructor?"* is `Slated` in the status filter, which is #15's
 * ordinary-filter finding used exactly as intended: making occupancy a **state** is
 * what turned an anti-join into a `status` filter.
 *
 * The section columns are **filterable and not sortable** (#37): under grouping,
 * sorting means re-ordering groups, and sections are always in `section_number` order
 * within theirs.
 */
export type LineupFilters = {
  termCode: TermCode;
  /** Title, number, instructor name, instructor netid. The name half runs the two queries in the other order (#9). */
  search: string | null;
  programCode: ProgramCode | null;
  status: readonly OfferingState[] | null;
};

/**
 * **The lead is whoever holds position 0 — never `roster[0]`** (#61).
 *
 * This is not a style preference. `decline` and `withdraw` each `DELETE` position 0
 * and leave everything below it, so a gap at 0 is what the machine's own edges
 * **produce**: `Declined.retry` → `Slated` lands a section holding co-instructors and
 * no lead. An array indexed by convention **cannot express that gap**, and
 * `roster[0]` silently reports a co-instructor as the lead.
 *
 * #41 shipped the broken shape — its empty state fired on `roster.length`, so a
 * section with two co-instructors and no lead rendered as an ordinary staffed roster
 * with nothing saying it could not be offered to anyone. Amended in
 * `docs/prototypes/course-offering-detail.html`, where `leadOf()` replaced every
 * `roster[0]`; the row type is where it is prevented from coming back.
 *
 * Order below position 0 is a **bare key**: no promotion, no reorder, gaps legal.
 * Legacy `section_x_instructor` had neither an order nor a lead to inherit, and
 * `position` is entirely this map's invention, introduced to name position 0.
 */
export declare function leadOf<T extends { position: number }>(roster: readonly T[]): T | undefined;

// --- Roles page ------------------------------------------------------------

/**
 * **The third view-shaped read module, and the second consumer of the stitch** (#38).
 *
 * It drives from `classes` — the role-holders, not the directory — and stitches names
 * in from `people`. Listing everyone was rejected not on cost, which #9 had already
 * priced as small, but because **the full-directory grid only works at fixture
 * scale**: sixteen hand-written rows make a scannable table, and NYU's real `people`
 * is thousands, which reopens the paging #37 closed on the one page where a pager
 * would defeat the reason you wanted the grid. Granting to someone new goes through
 * the search box instead.
 *
 * Governed by **a fourth read predicate beside the tiers** — *holds any role other
 * than `student`* — which governs a **page** rather than a table; `user_role` and
 * `program_director` stay at Tier 1 (#38, #34). A `student` gets no page at all: no
 * nav item, and the route refuses.
 */
export declare function getRolesPage(actor: Actor): Promise<Visible<RolesPage>>;

/**
 * `mayWrite` is the chair and nobody else (#34).
 *
 * **A non-chair sees the same page with the controls *and* the refusals absent** —
 * not greyed. A refusal explains why a control will not fire, and a refusal with no
 * control to refuse is dead text explaining a button that was never there (#38).
 * That is also what makes the extra reads conditional: a non-chair's page issues
 * neither the dependency queries nor the refusal computation.
 */
export type RolesPage = {
  mayWrite: boolean;
  /**
   * Three cards — `ITP — Priya Raman`, `IMA — Rui Chen`, `LowRes — No director`.
   * Read-only, so there is one writer and not two; the appointing happens on the
   * person.
   *
   * It exists because nothing on a person-centric page is shaped like a program, so
   * *LowRes has no director* could otherwise only appear as an absence you would have
   * to already know to look for — while half of every director permission in the
   * matrix is a row nobody has written. **The skeleton ships it unexercised** unless
   * a fixture is built for it: #32 refuses to create an offering whose course has no
   * area head, the assignment is a director-only write, so every program with
   * offerings needs a director.
   */
  programs: readonly { code: ProgramCode; name: string; directors: readonly StitchedPerson[] }[];
  holders: readonly RoleHolder[];
};

/**
 * One person's record: **all seven roles, held or not**, each with what it lets you
 * do, its refusal if it has one, and its provenance (#38).
 *
 * `advisor` and `student` are shown **marked as gating nothing yet** — leaving them
 * off would make the page quietly disagree with the role list and leave `advisor`
 * ungrantable when advising lands, while showing them unmarked invites a grant made
 * in the belief it does something. The marking is *gates no action*, which is true,
 * rather than *does nothing*, which stopped being true in #38 itself.
 *
 * A netid with no `people` row **renders**, with #37's treatment, because a role that
 * gates whether someone may be staffed must not be invisible to the only page that
 * can revoke it. The page cannot **create** one: granting goes through a search over
 * `people`, and there is no free-text netid field.
 */
export type RoleHolder = StitchedPerson & {
  /** The chair's own record is listed like anyone else's, pinned and marked. Hiding it was rejected as lying by omission, and a chair who teaches must be able to check they hold `instructor`. */
  isActor: boolean;
  roles: readonly RoleGrant[];
};

/**
 * A role, held or not, on one person.
 *
 * The **last-chair lock renders before it is triggered** rather than on the attempt:
 * the alternative is discovering by clicking that you nearly locked the entire
 * department out of role management, recoverable only with a `psql` session. Grant
 * `chair` to a second person and the lock lifts, live — #34's rule is *never empty*,
 * not *never revocable*.
 *
 * Three of the four revocation refusals name **data the chair cannot see from this
 * page**, which is why the page pays for three further `classes`-side queries per
 * holder — live roster rows, non-`Retired` headed courses, director rows — all
 * set-based over the holder set, none per-row. The fourth, *last chair*, is a count
 * over rows the page already has. See `REVOCATION_REFUSALS` in
 * `docs/permissions/permissions.ts` for the predicates.
 */
export type RoleGrant = {
  role: Role;
  held: boolean;
  grantedBy: StitchedName | null;
  grantedAt: Timestamp | null;
  /** `null` for a non-chair — controls and refusals are absent together (#38). */
  action: PermittedAction<"grant" | "revoke"> | null;
};

// --- Course detail ---------------------------------------------------------

/**
 * The Course page. Reached by a dedicated `↗` control at a row's right edge, outside
 * the expand target — the linked identifier lost on the mis-click, since it puts a
 * small target inside a big one whose click already means *expand* (#41).
 *
 * Courses are Tier 1, so this read is never refused for visibility; `Visible` is used
 * for a course that does not exist.
 *
 * **The Course page is a cross-project read even though the Catalog it opens from is
 * not** (#40, #41). One extra query per page, not per row: gather the distinct netids
 * and ask once. A history reading *"np1234 declined"* would waste the free-text
 * `reason` #10 kept precisely so the log reads like a real one.
 */
export declare function getCoursePage(courseId: Id, actor: Actor): Promise<Visible<CoursePage>>;

/**
 * The page is **term-less and its sections are term-grouped** — the grouping is a
 * display of the offerings' own key, not a term selector (#41). *Current and next
 * term only* was rejected on a fact the map has hit twice: #3 deferred term dates, so
 * **"current" is not computable**.
 */
export type CoursePage = {
  courseId: Id;
  courseNumber: string;
  title: string;
  programCode: ProgramCode;
  credits: number;
  /**
   * Restored to a reader here. #10 stored `edition` against the recommendation, at
   * the requester's direction, because *the number is read by people*; #37 then
   * dropped it from the one view where people would have read it. It sits beside the
   * approval history that explains it, which is closer to the original argument than
   * a Catalog row ever was.
   */
  edition: number;
  description: string | null;
  url: string | null;
  areas: readonly OwnTag[];
  requirementCategories: readonly OwnTag[];
  areaHead: StitchedPerson | null;
  notOfferableYet: { missingArea: boolean; missingAreaHead: boolean } | null;
  status: CourseState;
  /** Grouped by term, newest first, reusing the Lineup's grouping device so the two views rhyme. Each row carries the same `↗`, so the Course page is the second place a class page is reached from. */
  sections: readonly { termCode: TermCode; offerings: readonly LineupRow[] }[];
  /**
   * The review whose `approve` minted this course, and whether its shared proposal
   * body has changed since (#42, #49). `course.minted_from_review_id` is `NOT NULL`
   * — every seeded course is minted through a proposal and an approving review.
   *
   * The drift line is the half that matters: the body can be edited legitimately
   * after one program has already minted from it, because the mint **copies** (#7),
   * and whoever is about to schedule or teach the course is never on the proposal
   * screen.
   */
  mintedFrom: { reviewId: Id; programCode: ProgramCode; bodyHasDriftedSince: boolean };
  actions: readonly PermittedAction<CourseEvent>[] | null;
  edit: EditAffordance | null;
  lastChanged: LastChanged;
  history: History | null;
};

// --- Offering detail -------------------------------------------------------

/**
 * The Offering page — *a class*, in the department's words.
 *
 * **This is the read that can be refused.** An offering outside `COMMITTED_STATES` is
 * absent from a `student`'s Lineup, and a page has a URL and has to answer (#41). The
 * refusal names no state; its wording lives in the prototypes package.
 */
export declare function getOfferingPage(offeringId: Id, actor: Actor): Promise<Visible<OfferingPage>>;

export type OfferingPage = {
  offeringId: Id;
  /** Course facts and a link up to the Course page (#41). */
  course: { courseId: Id; courseNumber: string; title: string; credits: number; programCode: ProgramCode };
  termCode: TermCode;
  sectionNumber: string;
  status: OfferingState;
  /**
   * **Rows carrying their own `position`** (#61). The lead is whoever holds 0, which
   * may be nobody while rows sit below.
   *
   * A section with no roster at all states the #15 rule rather than showing a blank
   * table — *"Position 0 is empty, so this section cannot be offered to anyone"* —
   * and #61 added a sixth empty state for the shape that is **less** obvious rather
   * than more: rows below a vacant position 0, rendered as a table with the same
   * sentence above it.
   */
  roster: readonly OfferingRosterEntry[];
  meetings: readonly Meeting[];
  mode: string | null;
  enrollmentLimit: number | null;
  callNumber: string | null;
  sisClassNumber: number | null;
  url: string | null;
  foreignTags: readonly ForeignTag[];
  actions: readonly PermittedAction<OfferingEvent>[] | null;
  edit: EditAffordance | null;
  lastChanged: LastChanged;
  history: History | null;
};

/** Pronouns show here — one of the two places a person is presented as a person (#40). */
export type OfferingRosterEntry = { position: number } & StitchedPerson;

// --- Proposals list --------------------------------------------------------

/**
 * **Tier 3's first reader**, three tickets after the tier was written (#40, #42).
 *
 * `student` and `advisor` get the whole screen refused, nav item **absent** rather
 * than disabled, since Tier 3 has no arm that reaches them.
 */
export declare function getProposalsPage(actor: Actor, filters: ProposalsFilters): Promise<Visible<readonly ProposalGroup[]>>;

/**
 * **One group per proposal, one row per review** — #37's grouping device reused, so
 * the skeleton has one grouping idea rather than two (#42).
 *
 * The two flat alternatives lost for opposite reasons. *One row per review* is the
 * most honest — a review row **is** the request (#10) — and lost on repeating the
 * title once per program. *One row per proposal* lost on having to fill a status
 * column with no honest value: #7 left the proposal stateless deliberately, so a
 * derived status is not merely absent but **viewer-dependent** — the proposer sees
 * `Split` where a single-program director sees `Approved`, same proposal, same day,
 * neither wrong. Per-program chips derive nothing, so the question stops existing.
 *
 * **Every program's verdict shows, whether or not your arms reach it.** #42 widened
 * Tier 3's reads past its arms deliberately and recorded it as a widening: the
 * reviews being independent and able to disagree is #7's whole reason for splitting
 * the machine, and a screen that hides the disagreement hides the point.
 */
export type ProposalGroup = {
  proposalId: Id;
  title: string;
  credits: number;
  proposedBy: StitchedName;
  proposedAt: Timestamp;
  /** Every program, always — `ITP ✓ · IMA ◐ · LOW ✗`. */
  verdicts: readonly { programCode: ProgramCode; state: ReviewState }[];
  reviews: readonly ProposalReviewRow[];
};

export type ProposalReviewRow = {
  reviewId: Id;
  programCode: ProgramCode;
  state: ReviewState;
  areaHead: StitchedName | null;
  areas: readonly OwnTag[];
  /** The course this review's `approve` minted, where it has one (#42, #49). */
  mintedCourse: { courseId: Id; courseNumber: string } | null;
  actions: readonly PermittedAction<ReviewEvent>[] | null;
};

/**
 * Four filters (#42). Finished reviews stay **in the query** and out of the default,
 * on #37's `Retired` precedent — hiding an approved review in the query would make it
 * unreachable from the only screen that lists proposals, and it is the only route to
 * the course it minted.
 *
 * `Rejected` gets its own filter rather than being folded into `Any state`, because
 * unlike a retired course a rejected review leads **nowhere at all**: it minted
 * nothing, it is final, and it would otherwise sit in the catch-all forever with no
 * onward journey.
 */
export type ProposalsFilters = {
  view: "in-play" | "needs-me" | "rejected" | "any";
};

// --- Review detail ---------------------------------------------------------

/**
 * **The first read in the map that returns the same record at two fidelities** (#42).
 *
 * Given that a chip on the list names a review the actor may not act on, refusing the
 * page when they click it would be **incoherent** — #41's refusal wording is phrased
 * to leak nothing and the chip has already leaked it. So a review outside your arms,
 * on a proposal you can reach, opens **read-only**: body, assignment, siblings, and
 * the history with its reasons, which was the whole justification.
 *
 * The read-only rendering is not new machinery — it is what `student` and `advisor`
 * already get elsewhere, under #38's rule that read-only means controls **and**
 * refusals absent, not greyed. The predicate is Tier 3's may-read against its
 * may-act; which controls and reasons each fidelity renders is
 * `docs/prototypes/proposals-review.html`, variant D, per `RENDERED_ELSEWHERE`.
 */
export declare function getReviewPage(reviewId: Id, actor: Actor): Promise<Visible<ReviewPage>>;

export type ReviewPage = {
  fidelity: "may-act" | "read-only";
  reviewId: Id;
  programCode: ProgramCode;
  state: ReviewState;
  /** The group header restated above the record, chips and all, with this review highlighted (#42). */
  proposal: ProposalGroup;
  body: { title: string; description: string | null; credits: number };
  /**
   * How many programs are reading this body and which have sent it back — #10's *the
   * row is the request* made legible on the one screen where it matters. The creation
   * line reads *"Rui Chen proposed this and asked ITP to review it"*.
   */
  bodyShare: { programCount: number; developingProgramCodes: readonly ProgramCode[]; hasDriftedSinceAnyMint: boolean };
  areaHead: StitchedPerson | null;
  areas: readonly OwnTag[];
  /**
   * States the coincidence where the proposal's author and this review's area head
   * are the same person. #42 ruled *forbidding a proposer from approving their own
   * proposal* out of scope — the obvious fix has an unchecked failure mode, since a
   * small program may have exactly one area head and the rule could leave certain
   * proposals with no legal approver at all — but made the situation visible.
   */
  authorIsAreaHead: boolean;
  mintedCourse: { courseId: Id; courseNumber: string } | null;
  actions: readonly PermittedAction<ReviewEvent>[] | null;
  edit: EditAffordance | null;
  lastChanged: LastChanged;
  history: History | null;
};

// ---------------------------------------------------------------------------
// The write paths
// ---------------------------------------------------------------------------

/**
 * **Four, and the fourth has always been here** (#13, #28, #30, #40, #61).
 *
 * The permission check lives **inside** each of them, never beside it — the Server
 * Action is an actor-resolution wrapper (call `getActor()`, reject `null`, open the
 * transaction, call in), and the seed script is checked like anyone else, because an
 * unchecked seed is the one caller with unlimited licence to write lies into the
 * transition log.
 *
 * See `docs/permissions/permissions.ts` for the rules each of these enforces. This
 * package holds only where they run and what they take.
 */
export const WRITE_PATHS = [
  { path: "applyTransition", writes: "every lifecycle move, on all three machines", settledBy: ["#6", "#13", "#28"] },
  { path: "createOffering", writes: "an `offering` row and its meeting rows", settledBy: ["#30", "#43"] },
  { path: "createProposal", writes: "a `course_proposal` plus one `course_proposal_review` per requested program", settledBy: ["#40", "#43"] },
  { path: "writeFields", writes: "every field class with a named writer", settledBy: ["#28", "#61", "#62"] },
] as const;

/**
 * The transition writer (#13, as amended by #28).
 *
 * One plain function, called by the Server Action **and** by the seed script — which
 * is why the transaction is a parameter and the check is inside rather than in the
 * wrapper. It locks the row, rehydrates the snapshot, asserts movement, and writes
 * the snapshot plus the log row in one transaction (#6).
 *
 * `staff` / `unstaff` never being user-facing is **non-exposure, not a check**: the
 * Server Actions expose a **narrower event union** than this function accepts, so
 * divergence between the roster row and the machine state has no code path (#15, made
 * structural at the type level by #28).
 *
 * Three transitions write more than a snapshot and a log row, all in the same
 * transaction: `staff`/`unstaff` write the position-0 roster row (#15), the review's
 * `approve` mints a `course` and copies the body and the area assignment forward
 * (#7, #32), and the Course's `approve` bumps `course.edition` (#10).
 *
 * The full statement of this seam is in
 * [`docs/machines/README.md`](../machines/README.md); it is named here because it is
 * one of the four write paths and a build effort reading this package should not have
 * to discover it elsewhere.
 */
export declare function applyTransition(
  tx: ClassesTx,
  entity: { machine: "course" | "offering" | "course_proposal_review"; id: Id },
  event: CourseEvent | OfferingEvent | ReviewEvent,
  actor: Netid,
): Promise<void>;

/**
 * The Offering create path (#30, #43).
 *
 * **`program_code` never appears in the signature.** The path derives it from the
 * course inside the transaction — *a parameter whose entire domain is one value is a
 * program picker that must track the chosen course, and fails as a constraint
 * violation rather than as a validation*. Stated as **nothing outside the create path
 * ever writes `offering.program_code`**. A `BEFORE INSERT` trigger is equally correct
 * and was rejected on #13's *where would a reader find it*.
 *
 * It carries two actorless invariants, both refusing before anything is written, and
 * both landing here because the path already loads the course row:
 *
 * - **no area and no area head → no offering** (#32), the map's third actorless
 *   invariant and the rule #43's course picker pre-empts by sorting courses into *Can
 *   be offered* and *Not yet — assignments missing*;
 * - **a `Retired` course refuses** (#43), completing #14's guard from the other end.
 *   That door was the worse of the two, because #17 deleted the transition a field
 *   write used to fire and #13 made creation an act and not a transition — a `retry`
 *   at least writes a log row naming who fired it, while a create writes **none at
 *   all**.
 *
 * Creation writes no log row anywhere (#13); the trace is `created_by` / `created_at`
 * on the row, which the detail page renders as a derived creation line.
 */
export declare function createOffering(
  tx: ClassesTx,
  input: CreateOfferingInput,
  actor: Netid,
): Promise<{ offeringId: Id }>;

/**
 * Everything the form asks for, and nothing derived (#43).
 *
 * `sectionNumber` is **asked, pre-filled with the next free number, and editable** —
 * the form loads what is taken and defaults past it. Derived-and-hidden was rejected
 * because #30 established that two sections of one course in one term are real and
 * the number is *what tells them apart*.
 *
 * **Meetings are part of slating**, against the argument that they are optional and
 * every one of these fields is editable later in any state. #10 bought a *declared*
 * meeting kind precisely so `weekly` / `dates` / `async` is a positive statement, and
 * a form that defers meetings makes the LowRes intensive and the asynchronous course
 * indistinguishable from the unscheduled one at the moment of creation — the exact
 * legacy failure the shape CHECK exists to fix.
 */
export type CreateOfferingInput = {
  courseId: Id;
  termCode: TermCode;
  sectionNumber: string;
  meetings: readonly Meeting[];
  mode: string | null;
  enrollmentLimit: number | null;
  callNumber: string | null;
  sisClassNumber: number | null;
  url: string | null;
};

/**
 * The proposal create path (#40, #43).
 *
 * **One transaction writes a `course_proposal` plus one `course_proposal_review` per
 * requested program.** This is the `approve` mint's shape at the other end of the
 * lifecycle, and a new single writer in #13's sense, since creation is an act and not
 * a transition and so writes no log row.
 */
export declare function createProposal(
  tx: ClassesTx,
  input: CreateProposalInput,
  actor: Netid,
): Promise<{ proposalId: Id; reviewIds: readonly Id[] }>;

/**
 * Three columns and a set of programs (#10, #43).
 *
 * **`programs` is the load-bearing field and it is not a field beside the form — it
 * *is* the rows the form mints.** There is no requested-programs table; a review row
 * is the request (#10). The form says so in its section header, on each option, and
 * in a live count (*submitting writes 2 reviews*).
 *
 * **The set may not be empty**, ruled rather than assumed: a proposal with no reviews
 * is a body nobody will ever see, since the proposals list groups by proposal and its
 * rows *are* reviews, and #7 gave the proposal no state of its own and no detail page
 * to reach it by. It costs one validation rule to close the only way in the skeleton
 * to create an unreachable record.
 *
 * No `course_number` (each approving program mints its own, #7) and no area or head
 * (assigned by each program's director during review, #32) — and the form **states
 * its own absences** rather than leaving them silent.
 */
export type CreateProposalInput = {
  title: string;
  description: string | null;
  credits: number;
  /** Non-empty. */
  programs: readonly ProgramCode[];
};

/**
 * The field writer — **the one class of write that had no writer until #28 gave it
 * one**, and the path behind all three of #62's edit pages.
 *
 * **One call commits every field class open to the actor**, in one transaction:
 * #62 settled the edit page as one page, one Save, per record. The exact parameter
 * shape is the build effort's; what is settled is the chokepoint, its checks, and
 * that a record's classes are saved together rather than field at a time.
 *
 * It also writes `updated_at` / `updated_by`, never a trigger (#10, on #13's and
 * #30's *where would a reader find it*), and it writes **no log row at all** — #17
 * deleted the transition a field write used to fire, which is why the stamp is the
 * only trace and why #61 bought `granted_by` / `granted_at` for the rows this writer
 * creates.
 */
export declare function writeFields(tx: ClassesTx, write: FieldWrite, actor: Netid): Promise<void>;

export type FieldWrite = {
  record: { machine: "course" | "offering" | "course_proposal_review"; id: Id };
  /**
   * Qualified column names, exactly the strings `FIELD_CLASSES` lists. A column in no
   * class is **unwritable** (#28), so an unknown key is a refusal rather than a
   * silent no-op — which is what makes default-deny structural rather than
   * disciplinary as the schema grows.
   */
  columns: Readonly<Record<string, unknown>>;
  /**
   * The row-shaped classes. #10 turned #8's *meeting pattern* from a column into
   * rows, and #62 refused to make that a separate question: the two classes that are
   * **mixed** — Course assignment is one column plus rows, Offering operational is
   * six columns plus rows — prove the field class and not the field is the unit.
   */
  rows: readonly FieldRowWrite[];
};

export type FieldRowWrite =
  | { table: string; op: "insert"; values: Readonly<Record<string, unknown>> }
  | { table: string; op: "delete"; key: Readonly<Record<string, unknown>> };

/**
 * What this writer refuses, over and above the field-class map's two predicates.
 * Every one of these names no actor, so each binds the chair and the seed script too
 * — see `INVARIANTS` and `FURTHER_INVARIANTS` in `docs/permissions/permissions.ts`.
 *
 * The position-0 refusal is the clause that makes the roster class's state-blindness
 * safe rather than a loaded gun: *freely editable in any state* would otherwise
 * licence rewriting the lead of a `Published` section with `UPDATE … SET position =
 * 0`, which is precisely the freeze #15 bought `Staffed` to protect. **Renumbering
 * into position 0 is not a field write. It is `staff`, and it goes through
 * `applyTransition` or it does not happen.** #62 makes the refusal visible rather
 * than merely enforced: position 0 appears in the roster sub-table as the one row
 * with no `×`, marked *not a field*.
 */
export const FIELD_WRITER_REFUSALS = [
  { refuses: "any write naming roster position 0, in every state", settledBy: ["#61"] },
  { refuses: "a roster netid holding no `instructor` role — standing principle 6", settledBy: ["#34", "#61"] },
  {
    refuses: "a roster netid the `people` project does not know",
    settledBy: ["#9", "#61"],
    note:
      "**A check, not a constraint**, and it must be described that way: it cannot join the transaction, because the transaction is on the other database, so a window exists between check and write. Against a recovery path of reseed that is the right trade — but a build agent told *the netid is validated* will reason about it as a foreign key unless the spec is explicit. In practice the netid arrives from a picker populated out of `people`, so this is a backstop against seed scripts and direct writes. On the way **out**, the read tolerates and never hides: a roster entry is never dropped for want of a name.",
  },
  { refuses: "a seat-sharing tag whose program equals the offering's", settledBy: ["#30"] },
  { refuses: "an area or area-head write that would empty the area set or null the head — the assignment is monotone", settledBy: ["#32"] },
  { refuses: "removal of the last `chair` row", settledBy: ["#34"] },
  { refuses: "revocation of a role while a live relationship depends on it — see REVOCATION_REFUSALS", settledBy: ["#34", "#51"] },
] as const;
