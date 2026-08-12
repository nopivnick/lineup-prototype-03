"use client";

import Link from "next/link";
import { Anchor } from "@mantine/core";

/**
 * **The `↗` at a review row's right edge** — the same control the Catalog's
 * course row and the Lineup's section row carry, pointed at the third record
 * type (issues/41, issues/83, issues/85).
 *
 * It is a component of its own for the reason `OpenCourse` and `OpenClass` are:
 * the affordance is settled and the target is not this screen's to decide twice.
 *
 * **Every row gets one, including a read-only one.** The list has already shown
 * the verdict on a sibling review's chip, so refusing the page behind that chip
 * would be incoherent — issues/42 settled that such a review opens read-only
 * rather than not at all, which is why this control is not gated on the row
 * carrying an action set.
 */
export function OpenReview({ reviewId, where }: { reviewId: string; where: string }) {
  return (
    <Anchor
      component={Link}
      href={`/reviews/${reviewId}`}
      aria-label={`Open ${where}`}
      title={`Open ${where}`}
      fw={600}
    >
      ↗
    </Anchor>
  );
}
