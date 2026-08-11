import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";

import { userRole } from "@/db/classes/schema";
import { classesDb } from "@/db/handles";
import type { Netid } from "@/db/write/transaction";
import { ROLE_KIND, type Role } from "@/lib/permissions";

/**
 * **The actor's roles — a separate function, deliberately not behind
 * `getActor()`** (issues/11, issues/79).
 *
 * One reason to change: the seam exists because of the SSO swap, and SSO replaces
 * *where the netid comes from* without touching `user_role`, whose lookup is
 * identical before and after. Keeping the two apart is also what stopped issues/11
 * answering issues/28's RLS question on its behalf — a blocking ticket should hand
 * its dependent a fact, not a constraint it never asked for.
 *
 * issues/28 then found the choice had been **forced** rather than merely polite,
 * which is why this is emphatically the **read-side** lookup and nothing else. The
 * write-side check does not use it: `readActorFacts` in `db/write/rules.ts`
 * re-reads `user_role`, `program_director`, `course.area_head` and roster position
 * 0 inside the locking transaction, because anything resolved out here at request
 * scope would be stale by the time a writer acted on it.
 *
 * Wrapped in React `cache()` so two read modules rendering on one page do not
 * repeat it (issues/9; issues/28 already assumed roles load once per request).
 *
 * **The enforcement read is subject to no tier** (issues/34): it happens before
 * authorization exists and cannot be gated by a rule that depends on its own
 * result.
 */
export const getActorRoles = cache(async function getActorRoles(netid: Netid): Promise<readonly Role[]> {
  const rows = await classesDb()
    .select({ role: userRole.role })
    .from(userRole)
    .where(eq(userRole.netid, netid));

  return inDeclaredOrder(rows.map((row) => row.role as Role));
});

/**
 * A person's roles in the order `lib/permissions.ts` declares them rather than
 * alphabetically, so `chair` lands last everywhere and a role added to the map
 * takes its place without anyone choosing one.
 *
 * It sorts **here and not in the component** because `lib/permissions.ts` is
 * `server-only` — a Client Component reaching for `ROLE_KIND` fails the build,
 * which is the rules module working as issues/76 built it. Display order is
 * therefore something the server hands down with the roles.
 */
export function inDeclaredOrder(roles: readonly Role[]): readonly Role[] {
  return [...roles].sort((a, b) => DECLARED_ORDER.indexOf(a) - DECLARED_ORDER.indexOf(b));
}

const DECLARED_ORDER = Object.keys(ROLE_KIND) as readonly Role[];
