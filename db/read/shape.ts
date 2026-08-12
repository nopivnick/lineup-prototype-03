import "server-only";

import {
  HOLD_NOTHING_IN_THE_MATRIX,
  READ_TIERS,
  ROLES_PAGE,
  type FieldClassName,
  type MachineName,
  type ReadTier,
  type Role,
  type Route,
} from "@/lib/permissions";

import type { Meeting } from "@/db/write/create-offering";
import type { Refusal } from "@/db/write/refusal";
import {
  fieldClassesOn,
  notNowField,
  notYoursField,
  satisfies,
  type ActorFacts,
  type GateStates,
  type Subject,
} from "@/db/write/rules";

import type { StitchedName } from "./stitch";

/**
 * **What every read module ships beside the record** (issues/9, issues/14,
 * issues/28, issues/37).
 *
 * The three conventions below are built here first, by the Catalog (issues/81),
 * because the six views after it inherit them. They are shapes rather than
 * rules: the rules are `lib/permissions.ts` and the wording is
 * `db/write/rules.ts`, and this module names neither a role nor a sentence.
 *
 * A **client component may import these types** — `import type` is erased, so
 * the `server-only` above still holds and the machines still do not reach the
 * browser. What a client may never import is the value side of the rules.
 */

/**
 * A refusal, and it is **the writer's own type** rather than a second one shaped
 * like it (issues/14).
 *
 * The refused thing and its explanation are one value, and the read side ships
 * that value ahead of the click while the writer throws it at whoever clicks
 * anyway. Two types here would be two places for the shape to drift, in the one
 * place the map has spent three tickets making drift impossible.
 */
export type { Refusal };

/**
 * One entry in a record's permitted-action set: an event the machine offers from
 * this state, together with whether this actor may fire it and why not
 * (issues/28, issues/37).
 *
 * The set is **already intersected** — machine legality AND invariants AND
 * permissions — and the client renders from it alone and computes nothing. The
 * machine is never imported client-side: issues/17 deleted every Offering guard,
 * so a client-side `.can()` would be bare edge existence, while both things that
 * decide whether a control should be live are server-side.
 *
 * The `⋯ n` menu's **`n` is the count of `permitted: true` entries**, which is a
 * rendering of this set and not a second computation of it.
 */
export type PermittedAction<Event extends string> =
  | { event: Event; permitted: true }
  | { event: Event; permitted: false; refusal: Refusal };

/**
 * A tag from the record's own program — an `area` or a `requirement_category`
 * (issues/25). Rendered unlabelled, because every program name a list renders is
 * a seat-sharing grant, and the Catalog has none: seat sharing attaches to the
 * section that made it, never to the course.
 */
export type OwnTag = { name: string };

/**
 * A **foreign-program** tag: seat sharing (issues/25, issues/30).
 *
 * The only place in the whole model where a program other than the course's own
 * appears, which is why these carry the other program's name and own-program tags
 * do not — **every program name the Lineup renders is a seat-sharing grant.**
 * `grantedBy` / `grantedAt` are issues/25's columns, and issues/40 found the chip
 * had been rendering without them: hiding the sole cross-program act in the system
 * behind the one control designed to be read at a glance.
 *
 * The rows are foreign **by construction** and not by a predicate here. The
 * Seat-sharing tags field class refuses a tag whose program equals the offering's
 * (issues/30), so `offering_area` and `offering_requirement_category` can hold
 * nothing else; a `WHERE program_code <> …` in the read would be a second copy of
 * that rule, phrased as a filter, and would silently swallow a row the writer
 * should have refused.
 */
export type ForeignTag = {
  programCode: string;
  name: string;
  grantedBy: StitchedName;
  grantedAt: string;
};

/**
 * One meeting slot, and it is **the writer's own type** rather than a second one
 * shaped like it — the same move `Refusal` makes above (issues/10, issues/14).
 *
 * `kind` is **declared** and `offering_meeting`'s shape CHECK enforces it, so a
 * renderer never re-derives the kind from which columns happen to be filled: that
 * is the exact legacy failure issues/10 declared the column to fix. The three
 * kinds read differently on purpose (issues/37) — `weekly` → *Mon 18:30–21:00*,
 * `dates` → *5 Jan – 16 Jan, 10:00–16:00*, `async` → *Asynchronous*, with no time
 * and no room — which is the first thing in the skeleton that makes LowRes visibly
 * different from ITP and IMA.
 */
export type { Meeting };

/**
 * **Absent, never empty** (issues/37): whether a list renders an Actions column
 * at all.
 *
 * The predicate is Tier 2's *may-read* — *actor holds any acting role* — used as
 * issues/37 used it, to decide whether the column exists rather than what it
 * holds. An always-empty column is dead width advertising a capability the
 * reader will never have, and a refusal with no control to refuse is dead text
 * explaining a button that was never there (issues/38).
 *
 * It is **read off `READ_TIERS`** rather than restated as a list of five roles,
 * so a role added to that predicate arrives here without anybody choosing to
 * bring it. `student` and `advisor` are exactly issues/8's two empty rows, which
 * is why this is one predicate and not a per-view judgement.
 */
export function canEverAct(facts: ActorFacts): boolean {
  return ACTING_ROLES.some((role) => facts.roles.has(role));
}

const TIERS: readonly ReadTier[] = READ_TIERS;

const ACTING_ROLES: readonly Role[] = (TIERS.find((tier) => tier.tier === 2)?.mayRead.routes ?? [])
  .flatMap((route) => ("role" in route ? [route.role] : []));

/**
 * **The derivation above fails open, so it is checked at import.**
 *
 * `ReadPredicate.routes` is optional and two of the three tiers are already
 * written without it, so a Tier 2 rewritten in prose alone would leave this an
 * empty set — and an empty set means `canEverAct` answers `false` for everybody
 * and the Actions column silently disappears from every list in the skeleton for
 * every reader. That is an under-grant, which the map calls the loud kind of
 * mistake, and it would be the one shape of under-grant that is not: nobody sees
 * a control missing that they never knew was there.
 *
 * A failing import is what makes it loud, in the same spirit as
 * `db/machine-states.test.ts`.
 */
if (ACTING_ROLES.length === 0) {
  throw new Error(
    "READ_TIERS tier 2 states no routes, so no actor can ever act and no list would render an " +
      "Actions column (issues/37, issues/81). Either the tier moved or its predicate is now prose; " +
      "whichever it is, `canEverAct` has to be told where to read it.",
  );
}

/**
 * **The fourth read predicate, which governs a page rather than a table**
 * (issues/38): *holds any role other than `student`*.
 *
 * `ROLES_PAGE.mayRead` is where it is settled, and this is that sentence as code.
 * It cannot be derived from routes the way `canEverAct` is — the predicate has no
 * arms, being a complement rather than a list — so it is restated here and
 * nowhere else, and it is checked against the constant it restates below.
 *
 * **Never *does not hold `student`*.** ITP is full of graduate students who teach,
 * and issues/11 refuses role-narrowing, so all of an actor's roles are live at
 * once: under the second reading a student who is also an instructor loses the
 * page. A `student` and nobody else gets no page at all — no nav item, and the
 * route refuses, which is *absent rather than empty* scaled from a control to a
 * whole page.
 *
 * It takes the roles rather than `ActorFacts` because both of its callers hold a
 * different shape: the read module has the facts, and the page that decides
 * whether to render the nav item has the actor's role list.
 */
export function mayOpenRolesPage(roles: Iterable<Role>): boolean {
  for (const role of roles) {
    if (role !== NOT_A_ROLE_HOLDER) return true;
  }
  return false;
}

const NOT_A_ROLE_HOLDER: Role = "student";

/**
 * The predicate above says `student` because `ROLES_PAGE` does. A rewording that
 * moved the exempt role would otherwise leave this reading the old one silently —
 * an over-grant, which the map calls the quiet kind of mistake.
 */
if (!ROLES_PAGE.mayRead.includes(NOT_A_ROLE_HOLDER)) {
  throw new Error(
    `ROLES_PAGE.mayRead no longer names \`${NOT_A_ROLE_HOLDER}\`, so the roles page's read predicate ` +
      "has moved and `mayOpenRolesPage` is still restating the old one (issues/38).",
  );
}

/**
 * **The fifth read predicate, and the second one governing a page** (issues/28,
 * issues/42, issues/85): whether the proposals screen exists for this actor at
 * all.
 *
 * Tier 3 has **no arm that reaches a `student` or an `advisor`** — its three
 * arms are a directorship, authorship and an area-head assignment, and
 * issues/8's two empty rows hold none of them and can hold none of them, since
 * the act that makes an author is itself matrix-gated. So they get the whole
 * screen refused and the nav item **absent rather than disabled**, which is
 * issues/37's *absent, never empty* scaled from a control to a page for the
 * second time.
 *
 * **It is the complement of `HOLD_NOTHING_IN_THE_MATRIX`, read off that
 * constant** rather than restated as *`program_director` or `area_head` or
 * `chair`*. Those three are the roles Tier 3's arms name, and a predicate
 * written from them would refuse a `coordinator` the page — where what a
 * coordinator should get is the page, empty, saying *proposals reach you three
 * ways and none applies*. An empty screen a role could in principle fill is a
 * different fact from a screen that role can never fill, and only the second is
 * a refusal.
 *
 * It takes the roles rather than `ActorFacts` for the reason `mayOpenRolesPage`
 * does: the nav item's caller holds a role list and the read module holds facts.
 */
export function mayOpenProposals(roles: Iterable<Role>): boolean {
  for (const role of roles) {
    if (!EMPTY_ROWS.includes(role)) return true;
  }
  return false;
}

const EMPTY_ROWS: readonly Role[] = HOLD_NOTHING_IN_THE_MATRIX;

/**
 * **Tier 3's may-act arms, evaluated against one review** (issues/28, issues/32,
 * issues/42).
 *
 * Read off `READ_TIERS` rather than restated, the way `canEverAct` is, and
 * evaluated through the writer's own `satisfies` so that *which arm reaches
 * which review* is one function for the read side and the write side. The
 * routes are genuinely different shapes — a directorship over the review's
 * program, a comparison against the proposal's `created_by`, an area-head
 * assignment on the review itself, and the chair's flat clause — so the answer
 * differs per review rather than merely shrinking.
 *
 * **This is the *may-act* half of the tier, and it is not what decides whether a
 * review is on the page.** issues/42 widened *may-read* past the arms
 * deliberately: a proposal reachable by any one arm opens every one of its
 * sibling reviews, because the reviews being independent and able to disagree is
 * issues/7's whole reason for splitting the machine, and a screen that hides the
 * disagreement hides the point. What this predicate decides is the **fidelity**
 * — a review inside your arms carries a permitted-action set, one outside them
 * is read-only, with controls and refusals absent together.
 */
export function mayActOnReview(facts: ActorFacts, subject: Subject): boolean {
  return TIER_3_ARMS.some((route) => satisfies(route, facts, subject));
}

const TIER_3_ARMS: readonly Route[] = TIERS.find((tier) => tier.tier === 3)?.mayAct.routes ?? [];

/**
 * **This derivation fails open in the dangerous direction, so it is checked at
 * import** — the same alarm `canEverAct` carries, one tier along.
 *
 * `ReadPredicate.routes` is optional, and Tier 3's may-act arms are the only
 * place they are written down. An empty list would make `mayActOnReview` answer
 * `false` for everybody, and every review on the proposals list would render
 * read-only: no menu, no refusals, and no way for a reader to tell a screen
 * that has decided they may do nothing from a screen that has forgotten to ask.
 */
if (TIER_3_ARMS.length === 0) {
  throw new Error(
    "READ_TIERS tier 3 states no may-act routes, so no actor could act on any review and the " +
      "proposals list would render every row read-only (issues/42, issues/85). Either the tier " +
      "moved or its predicate is now prose; whichever it is, `mayActOnReview` has to be told " +
      "where to read it.",
  );
}

/**
 * **A record-level read result** (issues/41, issues/38).
 *
 * A list row outside its tier is simply **absent** — invisibility is never
 * something a page has to remember to honour, because the tiers filter in the
 * query. But a page has a URL and has to answer, so a module serving a whole page
 * returns this instead.
 *
 * The roles page is the first to use it and uses it for the whole page: the
 * fourth read predicate is not about a record at all, so `{ visible: false }` here
 * means *there is no Roles page for you*, and what it renders is the page's to
 * word.
 */
export type Visible<T> = { visible: true; page: T } | { visible: false };

// ---------------------------------------------------------------------------
// What a record page ships beside the record — issues/41's page conventions
// ---------------------------------------------------------------------------
//
// The three detail pages inherit these wholesale: a record on the left, what you
// may do about it on the right in a sticky rail, and its history in sentences at
// the bottom (issues/41, issues/42, issues/62). They are here rather than in the
// Course page's own module because the Offering and Review pages are the same
// page with a different record, and a second copy of any of them would be a
// second answer to a question issues/41 settled once.

/**
 * **A record's history, as the detail pages read it** (issues/40, issues/41).
 *
 * `null` for `student` and `advisor`: the history section is **absent, not
 * empty** — issues/37's *absent rather than empty*, scaled from a column to a
 * page by issues/38 and to a section by issues/41 — on issues/28's Tier 2
 * predicate: *if you can do nothing, you may not see the record of who did*.
 * The rail's *last changed* box goes with it, being the same class of fact.
 */
export type History = {
  /**
   * **Derived from `created_by` / `created_at` on the entity row, not a log row.**
   * issues/13 refused a genesis row and made `from_state` `NOT NULL`; a rendered
   * line derived from the entity is not one. The alternative is a history that
   * begins *"named Nora as lead instructor"* and sends the reader elsewhere to
   * learn where the thing came from.
   */
  creation: { by: StitchedName; at: string };
  moves: readonly HistoryLine[];
};

/**
 * One row of a `*_transition` table, with its netids stitched to names.
 *
 * `event`, `fromState` and `toState` are **exactly machine values** and that
 * meaning is load-bearing (issues/13) — the log is not a general audit log, and
 * a later effort inherits a table to add to rather than a table to reshape. The
 * page renders a **sentence** per row from them; the sentence may invent wording
 * the machine never said, and may not invent a fact.
 *
 * `subject` is `actor_netid`'s counterpart: `actor_netid` records who
 * **clicked**, and a decline is routinely recorded by an admin taking a refusal
 * by email (issues/15). issues/41 then gave `offer` and `accept` a subject too —
 * the roster survives the event but not the offering, so a log read after a
 * withdraw-and-re-offer would otherwise have an `offer` row attributable to
 * nobody and an `accept` row attributable to whoever holds position 0 *now*.
 *
 * `reason` is issues/10's free text, and it is what makes the log read like a
 * real one rather than a set of bare state changes — which is why the detail
 * pages render a sentence per row rather than the raw seven-column table.
 */
export type HistoryLine = {
  event: string;
  fromState: string;
  toState: string;
  actor: StitchedName;
  subject: StitchedName | null;
  reason: string | null;
  at: string;
};

/**
 * `updated_at` / `updated_by`, rendered as *last changed* in the rail
 * (issues/40, issues/41).
 *
 * Complementary to the log rather than redundant with it: **issues/17 deleted
 * the transition a field write used to fire**, so this stamp is the only trace
 * of the edits the log is forbidden to record — sharpest for exactly the
 * historical corrections a reader would most want attributable. `null` means
 * never changed since creation, which the page states in words rather than as an
 * empty box.
 */
export type LastChanged = { by: StitchedName; at: string } | null;

/**
 * **The record page rail's `Edit` control and everything it needs** (issues/62).
 *
 * A record's field classes disagree about their writer and about their state
 * rule — that is why there are fourteen of them — so *everything you may change*
 * is **actor-shaped**, and the same URL is a different page for a coordinator
 * and for a director.
 *
 * - `open` is what the edit form will ask for. Where it is empty the record page
 *   carries **no `Edit` control at all** and every class's refusal instead.
 * - The control's label does not vary with the actor; the **count** beneath it
 *   does — *2 of 3 sections are yours*. A control whose name changes per reader
 *   stops being one act.
 * - `refused` carries **two refusals per class, not one**, because issues/28 ANDs
 *   a state predicate and a role predicate and checks them **separately**.
 *   Labelled *Not yours* and *Not now*. Stating one hides the wall the reader
 *   walks into next: an `Approved` course read by another program's director
 *   refuses its body on both counts. This is why a field refusal is sometimes two
 *   sentences where a transition refusal is always one.
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
 * **The record module computes it, and the edit route adds no read module of its
 * own** (issues/62, and `EDIT_ROUTES` in `docs/data-access/`).
 *
 * The affordance is not something `/courses/:id/edit` introduces: the **record**
 * page needs it, to render the `Edit` control with its count and, where nothing
 * is yours, every class's refusal instead. Once the record module computes it, an
 * edit module would return a subset of what the record module already returns.
 *
 * Both sentences are the writer's own — `notNowField` and `notYoursField` in
 * `db/write/rules.ts` — so the refusal stated in the rail ahead of the click and
 * the one `writeFields` throws at whoever clicks anyway cannot drift apart. The
 * classes are derived from `FIELD_CLASSES` by which tables the record owns, so a
 * fifteenth class surfaces here without anybody editing a screen, which is what
 * issues/106 did to the course page.
 *
 * **The chair sits ahead of `notYours` and never ahead of `notNow`** (issues/34,
 * issues/62): a chair gets the `Edit` control on an `Approved` course and the body
 * section is still absent from the form. That is `permitted()`'s own clause rather
 * than a rule stated here.
 */
export function editAffordanceFor(
  machine: MachineName,
  facts: ActorFacts,
  subject: Subject,
  states: GateStates,
): EditAffordance {
  const open: FieldClassName[] = [];
  const refused: {
    fieldClass: FieldClassName;
    notYours: Refusal | null;
    notNow: Refusal | null;
  }[] = [];

  for (const fieldClass of fieldClassesOn(machine)) {
    const notNow = notNowField(fieldClass, states);
    const notYours = notYoursField(fieldClass, facts, subject);

    if (notNow === null && notYours === null) {
      open.push(fieldClass.name);
    } else {
      refused.push({ fieldClass: fieldClass.name, notYours, notNow });
    }
  }

  return { open, refused };
}
