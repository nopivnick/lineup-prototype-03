"use client";

import Link from "next/link";
import { Badge, Group, Tooltip } from "@mantine/core";

import type { ProposalGroup, ProposalReviewRow } from "@/db/read/review-rows";

/**
 * **`ITP ✓ · IMA ◐ · LOW ✗`** — every program's verdict, shown whether or not
 * the reader's arms reach that review (issues/42, issues/85, issues/86).
 *
 * **The fourth thing to move up beside `named.tsx`, `stamp.ts` and
 * `program-hue.ts`**, and for the reason those moved: a verdict chip now renders
 * on two screens — the proposals list's group header and the review page's
 * restatement of it — and a glyph or a hue that meant one thing on one and
 * something else on the next would break the only work either does, which is
 * being recognised across a click.
 *
 * Two signals per chip, the glyph and the hue, so the verdict does not rest on
 * colour; the state is in the tooltip in words, which is the third.
 *
 * **Each chip is a link, and that is the load-bearing half.** On the list a chip
 * whose row the filter has dropped would otherwise announce a review and offer no
 * way to reach it; on the review page the chips are how a reader moves between
 * siblings. A chip outside the reader's arms opens the review **read-only**,
 * which `getReviewPage` settled on this control's account: refusing the page
 * after the chip has already stated the verdict would be incoherent.
 */
export function Verdicts({
  verdicts,
  /** The review being read, where one is — its chip is the one marked *you are here*. */
  here,
}: {
  verdicts: ProposalGroup["verdicts"];
  here?: string;
}) {
  return (
    <Group gap={4}>
      {verdicts.map((verdict) => {
        const mine = verdict.reviewId === here;
        return (
          <Tooltip
            key={verdict.reviewId}
            withArrow
            label={
              mine
                ? `${verdict.programCode} — ${verdict.state}. You are reading this one.`
                : `${verdict.programCode} — ${verdict.state}. Open this review.`
            }
          >
            <Badge
              component={Link}
              href={`/reviews/${verdict.reviewId}`}
              color={REVIEW_TONE[verdict.state]}
              // **The highlight is a filled chip against light ones**, which is a
              // second signal beside the tooltip's words rather than a colour of
              // its own: the hue is already carrying the verdict.
              variant={mine ? "filled" : "light"}
              size="sm"
              style={{ cursor: "pointer" }}
            >
              {verdict.programCode} {REVIEW_GLYPH[verdict.state]}
            </Badge>
          </Tooltip>
        );
      })}
    </Group>
  );
}

/**
 * One glyph per review state, and typed as a total `Record` over the state union
 * so a state added to the machine is a compiler error here rather than a chip
 * that renders with no verdict at all.
 */
export const REVIEW_GLYPH: Readonly<Record<ProposalReviewRow["state"], string>> = {
  Proposed: "○",
  Developing: "◐",
  Approved: "✓",
  Rejected: "✗",
};

/** The two ends of the lifecycle read as ends; the two in play read as in play. */
export const REVIEW_TONE: Readonly<Record<ProposalReviewRow["state"], string>> = {
  Proposed: "gray",
  Developing: "yellow",
  Approved: "green",
  Rejected: "orange",
};
