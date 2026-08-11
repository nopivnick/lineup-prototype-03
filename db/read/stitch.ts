import "server-only";

import { inArray } from "drizzle-orm";

import { peopleDb } from "@/db/handles";
import { person } from "@/db/people/schema";
import type { Netid } from "@/db/write/transaction";

/**
 * **The cross-project stitch** (issues/5, issues/9, issues/82).
 *
 * `classes` drives. The page of rows is fetched from there — where all filtering
 * happens — the netids on that page are batched into **one** query against
 * `people`, and they are matched in memory. **Two round trips per page,
 * independent of page size.** What is forbidden is a per-row lookup: one round
 * trip per row across a project boundary.
 *
 * A denormalised copy of names in `classes` was rejected on **standing principle
 * 1** — no second copy that no single transaction writes — which bites hardest
 * here, since no transaction *can* span two databases. Legacy corroborates:
 * `lineup_official` denormalised instructor **netids**, never names.
 *
 * **It is the third module in `db/read/` that is not one of the seven views**,
 * beside `shape.ts` and `actor-facts.ts` and by the same rule (issues/81): what
 * makes something one of the seven is that it is a view. This is what six of them
 * do to a set of netids.
 * The Catalog is deliberately not a consumer — issues/37 made it the one
 * person-free read in the skeleton, and `db/read/catalog.test.ts` counts calls to
 * `peopleDb` to keep it that way.
 */

/**
 * One stitched name. **`displayName` is nullable and a row is never dropped for
 * want of one** (issues/9).
 *
 * Skipping entries whose person cannot be resolved produces a specific and
 * damaging failure: issues/15 built an entire lifecycle **state** on position 0
 * being occupied, so an offering sitting in `Staffed` would render with an empty
 * roster — a cosmetic problem masquerading as the lifecycle being broken. Failing
 * the page outright was rejected too: one absent person would take down the whole
 * Lineup for every reader, a larger outage than the fault.
 *
 * The rendering is issues/37's: the netid in monospace plus a quiet *no name on
 * file*, deliberately **not** styled as an error. `person.display_name` is itself
 * a generated column over the preferred/official name pair.
 */
export type StitchedName = {
  netid: Netid;
  displayName: string | null;
};

/**
 * **A total resolver, which is what makes *never dropped* structural rather than
 * disciplinary.**
 *
 * The obvious return type is a `Map`, and a `Map` puts the interesting decision
 * back on every caller: `map.get(netid)` is `undefined` for a netid the directory
 * does not know, and the shortest thing to write next is a `.filter()` that
 * silently loses the row. issues/9 spends a paragraph forbidding exactly that.
 *
 * So the stitch hands back a function that answers for **every** netid, resolved
 * or not. There is no shape in which a roster entry can go missing, because
 * nothing here can decline to answer.
 */
export type Directory = (netid: Netid) => StitchedName;

/**
 * **One query against `people`, whatever the page's size** (issues/9).
 *
 * The netids are de-duplicated first, so a term in which one person leads eight
 * sections costs the same as one in which eight people lead one each — the batch
 * is keyed by person, not by row.
 *
 * An empty set issues **no query at all**, which is not an optimisation: the
 * driver cannot build an `IN ()`, and a page with nobody on any roster has nothing
 * to stitch. A term of `Slated` sections is exactly that page.
 */
export async function stitchNames(netids: Iterable<Netid>): Promise<Directory> {
  const wanted = [...new Set(netids)];
  const found = new Map<Netid, string | null>();

  if (wanted.length > 0) {
    const rows = await peopleDb()
      .select({ netid: person.netid, displayName: person.displayName })
      .from(person)
      .where(inArray(person.netid, wanted));

    for (const row of rows) found.set(row.netid, row.displayName);
  }

  return (netid) => ({ netid, displayName: found.get(netid) ?? null });
}
