import { Suspense } from "react";
import { redirect } from "next/navigation";

import { getActorRoles } from "@/db/read/actor-roles";
import { listDirectory } from "@/db/read/directory";
import { mayProposeACourse } from "@/db/read/proposals";
import { mayOpenProposals, mayOpenRolesPage } from "@/db/read/shape";
import { getActor } from "@/lib/auth/actor";
import type { Role } from "@/lib/permissions";

import { NavPrototype, type NavItem } from "./nav-prototype";

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

  const [roles, people, mayPropose] = await Promise.all([
    getActorRoles(actor.netid),
    listDirectory(),
    mayProposeACourse(actor),
  ]);

  return (
    // `useSearchParams` bails out of prerendering, and every route under this
    // group is dynamic already — the boundary is insurance, not a load-bearing
    // fallback.
    <Suspense>
      <NavPrototype actor={actor} roles={roles} people={people} items={navItemsFor(roles, mayPropose)}>
        {children}
      </NavPrototype>
    </Suspense>
  );
}

/**
 * **PROTOTYPE — throwaway.** The nav's items, gated by the same predicates the
 * routes themselves refuse with, so a link nobody rendered and a route that
 * refuses cannot disagree (issues/37, issues/38, issues/42).
 *
 * `Slate a class` is the one item with no predicate behind it — see
 * `nav-prototype.tsx` for why, and for why that is the question rather than an
 * oversight. It only ever renders in variant C.
 */
function navItemsFor(roles: readonly Role[], mayPropose: boolean): readonly NavItem[] {
  return [
    { href: "/catalog", label: "Catalog", owns: ["/courses"], group: "browse" },
    { href: "/lineup", label: "Lineup", owns: ["/classes"], group: "browse" },
    ...(mayOpenProposals(roles)
      ? [{ href: "/proposals", label: "Proposals", owns: ["/reviews"], group: "decide" } as const]
      : []),
    ...(mayOpenRolesPage(roles) ? [{ href: "/roles", label: "Roles", group: "decide" } as const] : []),
    ...(mayPropose ? [{ href: "/propose", label: "Propose a course", group: "make" } as const] : []),
    { href: "/slate", label: "Slate a class", group: "make" },
  ];
}
