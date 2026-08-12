import "server-only";

import { READ_TIERS, ROLES_PAGE, type ReadTier, type Role } from "@/lib/permissions";

import type { Meeting } from "@/db/write/create-offering";
import type { Refusal } from "@/db/write/refusal";
import type { ActorFacts } from "@/db/write/rules";

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
