import "server-only";

import { cache } from "react";
import { asc, eq } from "drizzle-orm";

import { userRole } from "@/db/classes/schema";
import { classesDb, peopleDb } from "@/db/handles";
import { person } from "@/db/people/schema";
import type { Netid } from "@/db/write/transaction";
import type { Role } from "@/lib/permissions";

import { inDeclaredOrder } from "./actor-roles";

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
  netid: Netid;
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
 * the seven view-shaped read modules `docs/data-access/` specifies — no view lists
 * people, and the amendment saying so is in that package's ledger.
 *
 * Two round trips and no join, because the two projects cannot hold foreign keys
 * to each other (issues/5, issues/9). It is **not the stitch**: `CONTEXT.md` uses
 * that word for joining a class's roster to the people who teach it, and there is
 * no roster and no class here. `people` drives, because the directory *is* the
 * people list.
 *
 * Wrapped in React `cache()` for the reason the artifact wraps the role lookup —
 * so a layout and the page inside it do not repeat it (issues/9).
 */
export const listDirectory = cache(async function listDirectory(): Promise<readonly DirectoryPerson[]> {
  // Sequentially rather than in parallel, and on the ordering path issues/9
  // bought the `person_display_name` index for.
  const people = await peopleDb()
    .select({ netid: person.netid, displayName: person.displayName })
    .from(person)
    .orderBy(asc(person.displayName));

  const grants = await classesDb().select({ netid: userRole.netid, role: userRole.role }).from(userRole);

  const held = new Map<Netid, Role[]>();
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
    roles: inDeclaredOrder(held.get(row.netid) ?? []),
  }));
});

/**
 * Whether the switcher lists this netid — **the picker's own check**, asked of
 * one row rather than of the whole list.
 *
 * `beSomebody` is a public endpoint, and the switcher's claim is that it makes you
 * *one of the seed's people*. A netid the directory has never heard of is a real
 * thing in this map — the fixtures carry one deliberately, and the roster refusals
 * need it — but it is a thing the seed writes, not a thing a picker offers.
 *
 * `peopleKnows` in `db/write/rules.ts` asks the same question of the same table
 * and is deliberately not shared: that one is a **writer's** cross-project check,
 * stated as a check rather than a constraint because it cannot join the
 * transaction it refuses inside. This one is dev machinery and goes with the rest
 * of it.
 */
export const directoryLists = cache(async function directoryLists(netid: Netid): Promise<boolean> {
  const rows = await peopleDb().select({ netid: person.netid }).from(person).where(eq(person.netid, netid));
  return rows.length > 0;
});
