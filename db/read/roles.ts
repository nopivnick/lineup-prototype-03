import "server-only";

import { and, asc, eq, ilike, notInArray, or } from "drizzle-orm";

import { program, programDirector, userRole } from "@/db/classes/schema";
import { classesDb, peopleDb } from "@/db/handles";
import { person } from "@/db/people/schema";
import type { Refusal } from "@/db/write/refusal";
import {
  headedCoursesOf,
  lastChair,
  liveSeatsOf,
  permitted,
  stillDirects,
  stillHeadsCourses,
  stillOnLiveRosters,
  type DirectedProgram,
  type HeadedCourse,
  type LiveSeat,
} from "@/db/write/rules";
import type { Netid } from "@/db/write/transaction";
import type { Actor } from "@/lib/auth/actor";
import {
  FIELD_CLASSES,
  HOLD_NOTHING_IN_THE_MATRIX,
  ROLE_KIND,
  type FieldClass,
  type Role,
  type RoleKind,
  type Route,
} from "@/lib/permissions";

import { ROLES } from "./actor-roles";
import { getActorFacts } from "./actor-facts";
import { mayOpenRolesPage, type PermittedAction, type Visible } from "./shape";
import { stitchPeople, type StitchedName, type StitchedPerson } from "./stitch";

/**
 * **The roles page: the authority structure, one person at a time** (issues/34,
 * issues/38).
 *
 * The third view-shaped read module and the second consumer of the stitch. It
 * drives from `classes` — the role-holders, not the directory — and stitches names
 * in from `people`. Listing everyone was rejected not on cost but because the
 * full-directory grid only works at fixture scale: sixteen hand-written rows make
 * a scannable table and NYU's real `people` is thousands, which would reopen the
 * paging issues/37 closed. Granting to somebody new goes through the search box
 * instead, and **there is no free-text netid field anywhere on this page** — a typo
 * there grants a role to nobody and is indistinguishable from a legitimate grant
 * made ahead of the directory feed.
 *
 * Four things about it are structural rather than conventional.
 *
 * **It does not inherit the Catalog's `⋯ n` menu, and a build agent reading
 * issues/37 alone would build it here.** issues/37 rejected reasons-in-the-open
 * *for row height in a grouped table* and named it the strongest option; this page
 * is one record at a time, so the premise of the rejection is absent and the
 * rejected option wins. What **is** inherited is issues/14's one-object rule: the
 * refused thing and its explanation are one value, shipped together.
 *
 * **A refusal names its dependency and lists it**, which is clause 3 of the
 * refusal wording and the clause this page exists to make necessary. Three of the
 * four revocation refusals are conditional on data the chair cannot see from a
 * person-centric page — live roster rows, non-`Retired` headed courses, director
 * rows — so naming the person is not enough. The sentences are
 * `db/write/rules.ts`'s and are shared with the field writer, which throws them at
 * whoever clicks anyway.
 *
 * **A non-chair sees controls *and* refusals absent, not greyed** (issues/38): a
 * refusal explains why a control will not fire, and a refusal with no control is
 * dead text explaining a button that was never there. That is what makes the
 * dependency reads **conditional** — a non-chair's page issues neither of them,
 * which `db/read/roles.test.ts` asserts by counting round trips rather than by
 * reading this file.
 *
 * **The page is governed by the fourth read predicate**, which governs a page
 * rather than a table: `user_role` and `program_director` stay at Tier 1, and what
 * this decides is who may open the page at all. A `student` and nothing else gets
 * `{ visible: false }` — no nav item, and the route refuses.
 *
 * **What it costs.** Three `classes` statements and one `people` statement for any
 * reader; two further `classes` statements for the chair, both set-based over the
 * holder set and neither per-row; and one further `people` statement when a chair
 * types in the search box, which is the directory reach that makes granting
 * possible without a netid field.
 */
export async function getRolesPage(
  actor: Actor,
  filters: RolesFilters = { search: null },
): Promise<Visible<RolesPage>> {
  const facts = await getActorFacts(actor.netid);

  // The predicate is *holds any role other than `student`*, never *does not hold
  // `student`*: a graduate student who teaches keeps the page (issues/38).
  if (!mayOpenRolesPage(facts.roles)) return { visible: false };

  const mayWrite = permitted(AUTHORIZATION_WRITERS, facts, {});

  // **One `classesDb()` call per statement**, which is what makes the counting in
  // `db/read/roles.test.ts` mean anything: the test wraps the handle, so a module
  // that took one handle and ran three queries off it would report one round trip
  // and have made three.
  const [grants, directorships, programs] = await Promise.all([
    classesDb()
      .select({
        netid: userRole.netid,
        role: userRole.role,
        grantedBy: userRole.grantedBy,
        grantedAt: userRole.grantedAt,
      })
      .from(userRole),
    classesDb()
      .select({
        programCode: programDirector.programCode,
        name: program.name,
        netid: programDirector.netid,
      })
      .from(programDirector)
      .innerJoin(program, eq(program.code, programDirector.programCode))
      .orderBy(asc(program.code), asc(programDirector.netid)),
    classesDb().select({ code: program.code, name: program.name }).from(program).orderBy(asc(program.code)),
  ]);

  // One index, keyed by the `user_role` primary key, answering both *is it held*
  // and *who granted it and when*: the row **is** the grant, so a second structure
  // for the boolean would be the same fact stored twice.
  const grantOf = new Map(grants.map((grant) => [key(grant.netid, grant.role), grant]));
  const chairs = grants.filter((grant) => grant.role === "chair").map((grant) => grant.netid);

  // Every netid this page could be about: whoever holds a role, plus whoever a
  // relationship row names. The union is not decoration — standing principle 6
  // makes the second a subset of the first, and reading it off both is how a
  // director row that lost its role would still render rather than vanish.
  const holders = [...new Set([...grants.map((one) => one.netid), ...directorships.map((one) => one.netid)])];

  const blocking = await dependenciesOf(mayWrite ? holders : []);

  // **The stitch's one query**, over everyone this page will name: the holders
  // themselves, and whoever granted each of their roles.
  const directory = await stitchPeople([...holders, ...grants.map((grant) => grant.grantedBy)]);

  const wanted = filters.search?.trim().toLowerCase() ?? "";

  const record = (netid: Netid): RoleHolder => {
    const who = directory(netid);
    return {
      ...who,
      isActor: netid === actor.netid,
      roles: ROLES.map((role) =>
        stateOf(role, {
          netid,
          who: who.displayName ?? netid,
          grant: grantOf.get(key(netid, role)) ?? null,
          mayWrite,
          chairs,
          directs: directorships.filter((one) => one.netid === netid),
          blocking,
          directory,
        }),
      ),
    };
  };

  const listed = holders
    .filter((netid) => matches(netid, directory(netid).displayName, wanted))
    .map(record)
    .sort(byName);

  return {
    visible: true,
    page: {
      mayWrite,
      programs: programs.map((one) => ({
        code: one.code,
        name: one.name,
        directors: directorships
          .filter((row) => row.programCode === one.code)
          .map((row) => directory(row.netid)),
      })),
      holders: listed,
      directory: (await reachDirectory(mayWrite, wanted, holders)).map(record),
    },
  };
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/**
 * The search box is **one box doing two things**, which is what a page listing
 * holders and granting to anybody needs: it narrows the people who already hold
 * something, and — for a chair — it reaches past them into `people`.
 *
 * There is no second filter. The prototype's variant D has one control above the
 * list and nothing else, because the list is short by construction: the department
 * has a dozen role-holders, not a thousand.
 */
export type RolesFilters = { search: string | null };

/**
 * `mayWrite` is the chair and nobody else (issues/34). It is a page-level fact
 * rather than a per-row one, so a reader who cannot write sees no control anywhere
 * — and, with them, no refusal.
 */
export type RolesPage = {
  mayWrite: boolean;
  /**
   * The read-only program strip, above the person list.
   *
   * It exists because **nothing on a person-centric page is shaped like a
   * program**, so *LowRes has no director* could otherwise only appear as an
   * absence a reader would have to already know to look for — while half of every
   * director permission in the matrix is a row nobody has written. Read-only, so
   * there is one writer and not two: the appointing happens on the person.
   */
  programs: readonly ProgramSeat[];
  /** Everyone who holds at least one role, the actor pinned first (issues/38). */
  holders: readonly RoleHolder[];
  /**
   * The directory reach: people the search matched who hold **nothing** yet.
   * Empty for a non-chair and empty with no search, because it exists only to be
   * granted from.
   */
  directory: readonly RoleHolder[];
};

export type ProgramSeat = {
  code: string;
  name: string;
  /** Empty is a state the page renders as *No director*, not as a blank (issues/38). */
  directors: readonly StitchedPerson[];
};

/**
 * One person's record: **all seven roles, held or not** (issues/38).
 *
 * A netid with no `people` row **renders**, with issues/37's *no name on file*
 * treatment, because a role that gates whether somebody may be staffed must not be
 * invisible to the only page that can revoke it. The page cannot **create** one:
 * granting goes through a search over `people`.
 */
export type RoleHolder = StitchedPerson & {
  /**
   * The chair's own record is listed like anybody else's, pinned and marked.
   * Hiding it was rejected as lying by omission, and a chair who teaches has to be
   * able to check that they hold `instructor`.
   */
  isActor: boolean;
  roles: readonly RoleGrant[];
};

/**
 * A role, held or not, on one person.
 *
 * The **last-chair lock renders before it is triggered** rather than on the
 * attempt: the alternative is discovering by clicking that you nearly locked the
 * department out of role management, recoverable only with a `psql` session. Grant
 * `chair` to a second person and the lock lifts, live — issues/34's rule is *never
 * empty*, not *never revocable*.
 */
export type RoleGrant = {
  role: Role;
  held: boolean;
  /**
   * issues/34's split of what `user_role` holds, shipped because it is a fact
   * about the rules and not copy: a **qualification** gates whether a relationship
   * row may name you and is subsumed by nothing, where a **capability** is wholly
   * the chair's to begin with.
   */
  kind: RoleKind;
  /**
   * `advisor` and `student`, marked rather than left off (issues/8, issues/38).
   * Read off `HOLD_NOTHING_IN_THE_MATRIX` rather than named here: leaving them off
   * would make the page quietly disagree with the role list and leave `advisor`
   * ungrantable when advising lands, and showing them unmarked invites a grant made
   * in the belief it does something.
   */
  gatesNoAction: boolean;
  /** Provenance, so a grant is a fact with a granter and a date rather than a checkbox. */
  grantedBy: StitchedName | null;
  grantedAt: string | null;
  /**
   * **`null` for a non-chair** — the control and the refusal are absent together
   * (issues/38).
   */
  action: PermittedAction<RolesAct> | null;
};

/** The two acts a role row offers. `grant` is refused by nothing at all; `revoke` by four things. */
export type RolesAct = "grant" | "revoke";

// ---------------------------------------------------------------------------
// The dependency reads — the chair's, and nobody else's
// ---------------------------------------------------------------------------

/**
 * **The two conditional statements**, both set-based over the holder set and
 * neither per-row, and both skipped entirely for a non-chair (issues/38).
 *
 * The map priced **three** — live roster rows, non-`Retired` headed courses and
 * director rows — and the third turns out to be a read the page already has to
 * issue: the program strip is `program_director` in full, so asking again, scoped
 * to the holders, would be a second copy of the same rows bought to make a
 * sentence about a count come out even. The strip's rows answer
 * `program_director`'s refusal, exactly as the rows this page already holds answer
 * the last-chair lock. Recorded in `docs/data-access/README.md`.
 */
type Blocking = {
  seats: ReadonlyMap<Netid, readonly LiveSeat[]>;
  headed: ReadonlyMap<Netid, readonly HeadedCourse[]>;
};

async function dependenciesOf(holders: readonly Netid[]): Promise<Blocking> {
  if (holders.length === 0) return { seats: new Map(), headed: new Map() };

  // **The queries are `db/write/rules.ts`'s**, asked here of the whole holder set
  // and asked there of the one netid somebody is trying to revoke. Sharing them is
  // the same move the sentences make one file up: the list the page states under a
  // locked control and the list the writer throws are the same rows in the same
  // order, because they are the same query.
  const [seats, headed] = await Promise.all([
    liveSeatsOf(classesDb(), holders),
    headedCoursesOf(classesDb(), holders),
  ]);

  return { seats, headed };
}

/**
 * **The directory reach** — people the search matched who hold nothing (issues/38).
 *
 * A chair grants a role to somebody new by finding them here, which is the whole
 * reason there is no netid field: a typo in one grants a role to nobody and looks
 * exactly like a legitimate grant made ahead of the directory feed. It runs only
 * when a chair has typed something, and it is capped, because `people` is
 * thousands of rows in the real world and this is a search box rather than a list.
 */
async function reachDirectory(
  mayWrite: boolean,
  wanted: string,
  holders: readonly Netid[],
): Promise<readonly Netid[]> {
  if (!mayWrite || wanted === "") return [];

  const like = `%${wanted}%`;
  const found = await peopleDb()
    .select({ netid: person.netid })
    .from(person)
    // **The holders are excluded in the query and not after it.** They are already
    // listed above, and filtering a capped result would let a surname shared with
    // enough role-holders empty the one list a grant can be made from — the cap has
    // to fall on the people this list is actually for.
    .where(
      and(
        or(ilike(person.displayName, like), ilike(person.netid, like)),
        holders.length > 0 ? notInArray(person.netid, [...holders]) : undefined,
      ),
    )
    .orderBy(asc(person.displayName))
    .limit(REACH);

  return found.map((row) => row.netid);
}

/** Enough to find somebody by surname, few enough that the list stays a list. */
const REACH = 8;

// ---------------------------------------------------------------------------
// One role on one person
// ---------------------------------------------------------------------------

/**
 * Everything one role row on one person is decided from: the grant itself, and the
 * three evidence sets the page read once for everybody. It is a parameter object
 * rather than eight arguments because every one of them is needed to answer *may
 * this be revoked, and if not, why not*.
 */
type OnePersonsRole = {
  netid: Netid;
  /** The person, named as well as this side can name them — clause 2 of the wording. */
  who: string;
  /** The `user_role` row, which is the grant — `null` is *not held*, and there is no third state. */
  grant: { grantedBy: Netid; grantedAt: Date } | null;
  mayWrite: boolean;
  chairs: readonly Netid[];
  directs: readonly { programCode: string; name: string }[];
  blocking: Blocking;
  directory: (netid: Netid) => StitchedPerson;
};

function stateOf(role: Role, person: OnePersonsRole): RoleGrant {
  const granted = person.grant;

  return {
    role,
    held: granted !== null,
    kind: ROLE_KIND[role],
    gatesNoAction: (HOLD_NOTHING_IN_THE_MATRIX as readonly Role[]).includes(role),
    grantedBy: granted ? nameOf(person.directory(granted.grantedBy)) : null,
    grantedAt: granted ? granted.grantedAt.toISOString() : null,
    action: person.mayWrite ? actionFor(role, person) : null,
  };
}

/**
 * **Machine legality has no analogue here and the invariants are all there is.**
 *
 * `user_role` has no lifecycle — a grant is a row and a revoke is a `DELETE`
 * (issues/34) — so the intersection the other views compute reduces to two terms:
 * the permission, which is `mayWrite` and has already been asked, and the four
 * revocation invariants, which name no actor and therefore **bind the chair**.
 * Granting is refused by nothing at all: no invariant constrains who may hold a
 * role, and the qualification a role confers is checked by the writer of the
 * relationship rather than at the grant.
 */
function actionFor(role: Role, person: OnePersonsRole): PermittedAction<RolesAct> {
  if (person.grant === null) return { event: "grant", permitted: true };

  const refused = refusalToRevoke(role, person);
  return refused ? { event: "revoke", permitted: false, refusal: refused } : { event: "revoke", permitted: true };
}

/**
 * `REVOCATION_REFUSALS`' four predicates, computed one step ahead of the click.
 *
 * Every sentence is the writer's own, so the refusal stated in the open under a
 * control the chair cannot use and the one `writeFields` throws at whoever clicks
 * anyway cannot drift apart (issues/14, issues/38, issues/81).
 */
function refusalToRevoke(role: Role, person: OnePersonsRole): Refusal | null {
  if (role === "chair") {
    return person.chairs.length <= 1 ? lastChair(person.who) : null;
  }

  if (role === "instructor") {
    const live = person.blocking.seats.get(person.netid) ?? [];
    return live.length > 0 ? stillOnLiveRosters(person.who, live) : null;
  }

  if (role === "area_head") {
    const headed = person.blocking.headed.get(person.netid) ?? [];
    return headed.length > 0 ? stillHeadsCourses(person.who, headed) : null;
  }

  if (role === "program_director") {
    const directs: DirectedProgram[] = person.directs.map((one) => ({ code: one.programCode, name: one.name }));
    return directs.length > 0 ? stillDirects(person.who, directs) : null;
  }

  // `coordinator`, `advisor` and `student` are flat and nothing depends on them.
  return null;
}

// ---------------------------------------------------------------------------
// Who may write this page
// ---------------------------------------------------------------------------

/**
 * **The Authorization field class's writers, read off `FIELD_CLASSES`** rather
 * than restated as *the chair* (issues/34, issues/81).
 *
 * `mayWrite` and the writer's own role predicate are then the same list evaluated
 * by the same function, which is what makes the page's controls agree with what
 * `writeFields` will accept. The chair's clause is inside `permitted`, so this
 * stays a route list and never grows a seventh column.
 */
const AUTHORIZATION: FieldClass | undefined = (FIELD_CLASSES as readonly FieldClass[]).find(
  (fieldClass) => fieldClass.name === "Authorization",
);

if (!AUTHORIZATION) {
  throw new Error(
    "No `Authorization` field class in FIELD_CLASSES, so this page cannot say who may write it " +
      "(issues/34, issues/38). Either the class was renamed or the two authorization tables lost " +
      "their writer; whichever it is, `getRolesPage` has to be told where to read it.",
  );
}

const AUTHORIZATION_WRITERS: readonly Route[] = AUTHORIZATION.writers;

// ---------------------------------------------------------------------------
// Small things
// ---------------------------------------------------------------------------

function key(netid: Netid, role: string): string {
  return `${netid}:${role}`;
}

function nameOf(person: StitchedPerson): StitchedName {
  return { netid: person.netid, displayName: person.displayName };
}

/**
 * The search matches a netid or a display name, and it is applied **after the
 * stitch** for the reason the Lineup's is: the two halves straddle the project
 * boundary and are OR'd, so no single database can answer.
 */
function matches(netid: Netid, displayName: string | null, wanted: string): boolean {
  if (wanted === "") return true;
  return netid.toLowerCase().includes(wanted) || (displayName ?? "").toLowerCase().includes(wanted);
}

/**
 * **The actor is pinned**, and everybody else sorts by the name the directory
 * knows them by. A netid with no `people` row sorts last rather than first, which
 * is what an empty string would do: it is a person the directory has not caught up
 * with, not a person whose name begins with nothing.
 */
function byName(a: RoleHolder, b: RoleHolder): number {
  if (a.isActor !== b.isActor) return a.isActor ? -1 : 1;
  if ((a.displayName === null) !== (b.displayName === null)) return a.displayName === null ? 1 : -1;
  return (a.displayName ?? a.netid).localeCompare(b.displayName ?? b.netid);
}
