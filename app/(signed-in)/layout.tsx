import { redirect } from "next/navigation";

import { getActorRoles } from "@/db/read/actor-roles";
import { listDirectory } from "@/db/read/directory";
import { getActor } from "@/lib/auth/actor";

import { DevBar } from "./dev-bar";

/**
 * **Everything behind an actor** (issues/11, issues/79).
 *
 * The route group exists so this resolution has one place to happen: every page
 * under it is read *by* somebody, and a `null` actor lands on the picker instead
 * — the same shape as *no session → sign in*, which is why SSO replaces an entry
 * screen here rather than deleting a concept.
 *
 * `getActor()` is the only identity import in the application, and this is the
 * only page-side call of it. What it hands back is a **netid**, and the two lines
 * under it are what that costs and what it buys: the actor's roles are a second,
 * cached lookup keyed by that netid (`getActorRoles`), not a field on the actor,
 * and the roles a *rule* consults are read a third time inside the locking
 * transaction that consults them (issues/28, `readActorFacts`). Three reads of
 * `user_role` in a request is the shape, and each is at the moment its answer is
 * used.
 */
export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) {
    redirect("/be-somebody");
  }

  return (
    <>
      <DevBar actor={actor} roles={await getActorRoles(actor.netid)} people={await listDirectory()} />
      {children}
    </>
  );
}
