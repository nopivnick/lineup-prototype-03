import type { ProposalsFilters } from "@/db/read/proposals";

/**
 * **The four filters, named once and read from both sides of the boundary**
 * (issues/42, issues/85).
 *
 * It is a module of its own because the **page** has to narrow a query parameter
 * to one of them before it reads, and the **bar** has to render them, and the bar
 * is a Client Component. A `"use client"` module's exports become client
 * *references* when a Server Component imports them, so a default view declared
 * beside the bar arrives on the server as an opaque function — which typechecks,
 * builds, and silently makes every filter fall through to the same branch. That
 * is not a hypothetical: it is what the first version of this screen did, and the
 * only symptom was an empty list under a correct-looking control.
 *
 * The type is `getProposalsPage`'s own, imported rather than restated — a
 * `import type` is erased, so the read module's `server-only` still holds.
 */
export type ProposalsView = ProposalsFilters["view"];

/**
 * **The default is *In play*, and the finished reviews are still reachable**
 * (issues/42), on issues/37's `Retired` precedent: hiding an approved review in
 * the query would make it unreachable from the only screen that lists proposals,
 * and it is the only route to the course it minted.
 *
 * *Rejected* sits beside *Any state* rather than inside it, because unlike a
 * retired course a rejected review leads nowhere at all — it minted nothing, it
 * is final, and it would otherwise sit in the catch-all forever with no onward
 * journey.
 */
export const VIEWS: readonly { value: ProposalsView; label: string }[] = [
  { value: "in-play", label: "In play" },
  { value: "needs-me", label: "Needs me" },
  { value: "rejected", label: "Rejected" },
  { value: "any", label: "Any state" },
];

/** *In play* is the absence of the parameter, so a bare `/proposals` is it. */
export const DEFAULT_VIEW: ProposalsView = "in-play";

/**
 * The asked-for view if it is one of the four, and the default otherwise. A
 * query parameter is a public input, and one the page cannot honour must not
 * survive into what the bar renders as its current value: a control that
 * disagrees with the rows beneath it is worse than a control that has been reset.
 */
export function viewFor(value: string | undefined): ProposalsView {
  return VIEWS.find((view) => view.value === value)?.value ?? DEFAULT_VIEW;
}

export function urlFor(pathname: string, view: string): string {
  return view === DEFAULT_VIEW ? pathname : `${pathname}?view=${view}`;
}
