import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";

import { programDirector } from "@/db/classes/schema";
import { classesDb } from "@/db/handles";
import type { ActorFacts } from "@/db/write/rules";
import type { Netid } from "@/db/write/transaction";

import { getActorRoles } from "./actor-roles";

/**
 * **What a read module knows about the actor, so it can say ahead of the click
 * what this actor may do** (issues/28, issues/37, issues/81).
 *
 * The `ActorFacts` type is the **writer's**, imported rather than restated: the
 * two sides must agree about what a permission is scoped by, and one shape is
 * what makes `permitted()` callable from both. What differs is *when* the facts
 * are read.
 *
 * - `readActorFacts` in `db/write/rules.ts` reads them **inside the locking
 *   transaction**, at the moment of the write. That one is the decision.
 * - This one reads them at request scope, and what it produces is an
 *   **affordance**. A grant revoked between the render and the click makes the
 *   menu stale, and the writer refuses — which is the design working rather than
 *   failing, and is exactly why issues/11 kept roles out of `getActor()` and
 *   issues/28 confirmed it with a stronger reason.
 *
 * So this is emphatically the read side, and nothing in a write path may call
 * it. `cache()`d for the reason `getActorRoles` is: several read modules
 * rendering on one page must not repeat it (issues/9).
 *
 * The roles half **is** `getActorRoles`, not a second query of `user_role`. The
 * directorships are the half no page had needed until a list had to render an
 * action menu.
 */
export const getActorFacts = cache(async function getActorFacts(netid: Netid): Promise<ActorFacts> {
  const [roles, directorships] = await Promise.all([
    getActorRoles(netid),
    classesDb()
      .select({ programCode: programDirector.programCode })
      .from(programDirector)
      .where(eq(programDirector.netid, netid)),
  ]);

  return {
    netid,
    roles: new Set(roles),
    directorOf: new Set(directorships.map((row) => row.programCode)),
  };
});
