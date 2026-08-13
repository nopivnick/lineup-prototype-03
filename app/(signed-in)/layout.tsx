import { redirect } from "next/navigation";

import { getActorRoles } from "@/db/read/actor-roles";
import { listDirectory } from "@/db/read/directory";
import { mayOpenProposals, mayOpenRolesPage } from "@/db/read/shape";
import { getActor } from "@/lib/auth/actor";
import type { Role } from "@/lib/permissions";

import { DevBar } from "./dev-bar";
import { SiteNav, type NavItem } from "./site-nav";

/**
 * **Everything behind an actor** (issues/11, issues/79).
 *
 * The route group exists so this resolution has one place to happen: every page
 * under it is read *by* somebody, and a `null` actor lands on the picker instead
 * — the same shape as *no session → sign in*, which is why SSO replaces an entry
 * screen here rather than deleting a concept.
 *
 * `getActor()` is the only identity import in the application. This layout owns
 * the redirect for a null actor; individual pages may still call `getActor()` to
 * pass an actor into view-shaped read modules.
 *
 * What it hands back is a **netid**, and the two lines
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

  const [roles, people] = await Promise.all([getActorRoles(actor.netid), listDirectory()]);

  return (
    <>
      <DevBar actor={actor} roles={roles} people={people} />
      <SiteNav items={navItemsFor(roles)} />
      {children}
    </>
  );
}

/**
 * **The nav's items, gated by the predicates the routes themselves refuse
 * with** (issues/37, issues/38, issues/42).
 *
 * They are computed here rather than in `SiteNav` because this is where the
 * roles already are — the layout has read them for the dev bar — so the nav
 * costs no query of its own, and because a component that decided its own
 * membership would be a second statement of who may see what. `mayOpenRolesPage`
 * and `mayOpenProposals` are the same functions `/roles` and `/proposals` refuse
 * with, so the item and the route cannot disagree. Each route still refuses on
 * its own: **a link nobody rendered is not a check.**
 *
 * **Absent, never disabled.** A greyed item announces that there is a screen
 * here you are not allowed into, which is the thing issues/37 refuses to do to a
 * reader.
 *
 * **The two create routes are deliberately not here.** `/propose` opens from the
 * proposals heading and `/slate` from the Course page's rail, and issues/42
 * settled that proposing has exactly one door — a nav item would be the second
 * one. `/slate` has a second reason: there is no cheap *may this actor slate
 * anything at all* predicate to gate it with, `maySlateFrom` being asked per
 * program, so an item for it would either lie to most readers or buy a new
 * department-wide query on every page in the app.
 */
function navItemsFor(roles: readonly Role[]): readonly NavItem[] {
  return [
    { href: "/catalog", label: "Catalog", owns: ["/courses"] },
    { href: "/lineup", label: "Lineup", owns: ["/classes"] },
    ...(mayOpenProposals(roles)
      ? [{ href: "/proposals", label: "Proposals", owns: ["/reviews"] } as const]
      : []),
    ...(mayOpenRolesPage(roles) ? [{ href: "/roles", label: "Roles" } as const] : []),
  ];
}
