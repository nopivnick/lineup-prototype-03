/**
 * ***Physical Computing II · ITP*** — which review a control is about
 * (issues/85, issues/86).
 *
 * Three screens name one review to a reader: the proposals list's `⋯ n` menu and
 * `↗`, the review page's breadcrumb and move box, and the group header the review
 * page restates above the record, whose `↗` names a sibling. Two spellings of one
 * address is how a menu's heading and a link's label come to name the same review
 * differently, which is the fault `named.tsx` and `stamp.ts` moved up to prevent
 * for a person and a moment.
 *
 * **A plain module and not a `"use client"` one**, deliberately: a Server
 * Component imports this — a client module's exports reach the server as client
 * *references* rather than as the functions they are, which is issues/85's trap
 * and typechecks and builds before it fails.
 */
export function reviewWhere(title: string, programCode: string): string {
  return `${title} · ${programCode}`;
}
