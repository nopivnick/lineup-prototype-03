import { redirect } from "next/navigation";

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
 * only page-side call of it. What it hands back is a netid; the roles the dev bar
 * prints beside it are labels read separately, and the roles a *rule* consults
 * are read again inside the transaction that consults them (issues/28).
 */
export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) {
    redirect("/be-somebody");
  }

  return (
    <>
      <DevBar actor={actor.netid} people={await listDirectory()} />
      {children}
    </>
  );
}
