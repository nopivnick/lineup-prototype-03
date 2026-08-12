"use client";

import Link from "next/link";
import { Anchor } from "@mantine/core";

/**
 * **A dedicated `↗` at a row's right edge, outside the expand target**
 * (issues/41, issues/83).
 *
 * It is one control with two homes — the Catalog's course row and the Lineup's
 * group header, which *is* a course — so it is one component. Two copies of a
 * link is not a rule drifting, but it is the same control answering to two
 * screens, and issues/41 settled the affordance rather than the markup: a later
 * ticket that changes the glyph or the target should not have to find both.
 *
 * **The linked identifier lost to this** and lost on the mis-click: it puts a
 * small target inside a big one whose click already means *expand*, and the row
 * click belongs to issues/37's grouping. An item in the `⋯ n` menu lost too —
 * the menu's count is *moves you can make*, and opening a page is not a move, so
 * *Open course page* sitting above the transitions would make `⋯ 0` a lie about
 * a row there is still something to do with.
 *
 * It is the **one control every reader gets**, Actions column or not: `course`
 * is Tier 1, so no row in either list leads to a page its reader is refused.
 */
export function OpenCourse({ courseId, courseNumber }: { courseId: string; courseNumber: string }) {
  return (
    <Anchor
      component={Link}
      href={`/courses/${courseId}`}
      aria-label={`Open ${courseNumber}`}
      title={`Open ${courseNumber}`}
      fw={600}
    >
      ↗
    </Anchor>
  );
}
