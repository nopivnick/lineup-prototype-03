"use client";

import Link from "next/link";
import { Anchor } from "@mantine/core";

/**
 * **A dedicated `↗` at a section row's right edge, outside the expand target**
 * (issues/41, issues/83, issues/84).
 *
 * `OpenCourse`'s sibling, and deliberately a second component rather than one
 * with a `href` prop: the two differ in what they name — a course number and a
 * section — and the label is the accessible name of the control, which is the
 * whole reason the glyph alone is not enough.
 *
 * It is the control issues/83 said would land with this page rather than a change
 * of shape: the Course page's section rows and the Lineup's section rows already
 * carried everything they needed, and what was missing was the page to point at.
 *
 * **No row in either list leads to a page its reader is refused.** `offering` is
 * Tier 2 outside `COMMITTED_STATES` and both lists narrow **in the query** on the
 * same predicate `getOfferingPage` refuses with — so a section a reader can see
 * listed is a section that page will open, and the record-level refusal is
 * reachable only by typing an address.
 */
export function OpenClass({
  offeringId,
  where,
}: {
  offeringId: string;
  /** *ITPG-GT 2233 §2* — what the control is called, for a reader who cannot see the glyph. */
  where: string;
}) {
  return (
    <Anchor
      component={Link}
      href={`/classes/${offeringId}`}
      aria-label={`Open ${where}`}
      title={`Open ${where}`}
      fw={600}
    >
      ↗
    </Anchor>
  );
}
