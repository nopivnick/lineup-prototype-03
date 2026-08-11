import "server-only";

import { asc } from "drizzle-orm";

import { userRole } from "@/db/classes/schema";
import { classesDb, peopleDb } from "@/db/handles";
import { person } from "@/db/people/schema";
import { ROLE_KIND, type Role } from "@/lib/permissions";

/**
 * A person as the dev bar lists them: who they are, and what the department has
 * granted them.
 *
 * The roles are here to make the switcher navigable — *one click and you are the
 * coordinator* is only true if the list says which one she is — and they are
 * **labels on a list, never an actor's role set**. Nothing downstream reads them:
 * a permission check re-reads `user_role` inside its own locking transaction
 * (`readActorFacts` in `db/write/rules.ts`), because a copy resolved out here
 * would be stale by the time a writer used it (issues/28).
 */
export type DirectoryPerson = {
  netid: string;
  displayName: string;
  roles: readonly Role[];
};

/**
 * **The dev bar's user list, and it is subject to no tier** (issues/34,
 * issues/79).
 *
 * `READ_TIERS` in `lib/permissions.ts` names the two anonymous reads that survive
 * in this skeleton: *the dev bar's user list and its role labels*. They are both
 * here, and they take no actor because there is not one yet — this is what a
 * person looks at *before* choosing who to be, which is the same position a sign-in
 * screen occupies. Tier 1 is *signed in*, and a read that runs to produce the
 * sign-in screen cannot be gated on having signed in.
 *
 * **The SSO swap deletes this module**, along with the picker and
 * `lib/auth/actions.ts`. It is dev machinery that reads real tables, not one of
 * the seven view-shaped read modules `docs/data-access/` specifies — no view
 * lists people.
 *
 * It is also the stitch at its smallest, and running the other way round from the
 * Lineup's: `people` drives here, because the directory *is* the people list, and
 * `classes` is asked afterwards for what it knows about those netids. Two round
 * trips, no join — the two projects cannot hold foreign keys to each other
 * (issues/5, issues/9).
 */
export async function listDirectory(): Promise<readonly DirectoryPerson[]> {
  // Sequentially rather than in parallel, and on the ordering path issues/9
  // bought the `person_display_name` index for.
  const people = await peopleDb()
    .select({ netid: person.netid, displayName: person.displayName })
    .from(person)
    .orderBy(asc(person.displayName));

  const grants = await classesDb().select({ netid: userRole.netid, role: userRole.role }).from(userRole);

  const held = new Map<string, Role[]>();
  for (const grant of grants) {
    const roles = held.get(grant.netid) ?? [];
    roles.push(grant.role as Role);
    held.set(grant.netid, roles);
  }

  return people.map((row) => ({
    netid: row.netid,
    // `display_name` is generated from columns that are `NOT NULL`, so this
    // coalesce never fires — it is here because Drizzle types a generated column
    // as nullable and a switcher entry with no label to click is worse than one
    // labelled with its netid.
    displayName: row.displayName ?? row.netid,
    roles: (held.get(row.netid) ?? []).sort(byDeclaredOrder),
  }));
}

/**
 * Roles read in the order `lib/permissions.ts` declares them rather than
 * alphabetically, so `chair` lands last everywhere and a role added to the map
 * takes its place here without anyone choosing one.
 */
const DECLARED_ORDER = Object.keys(ROLE_KIND) as readonly Role[];

function byDeclaredOrder(a: Role, b: Role): number {
  return DECLARED_ORDER.indexOf(a) - DECLARED_ORDER.indexOf(b);
}
