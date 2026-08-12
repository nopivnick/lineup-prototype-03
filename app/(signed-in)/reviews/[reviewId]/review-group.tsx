"use client";

import { Badge, Box, Group, Paper, Stack, Table, Text } from "@mantine/core";

import type { ProposalGroup } from "@/db/read/review-rows";

import { Named } from "../../named";
import { OpenReview } from "../../open-review";
import { reviewWhere } from "../../review-where";
import { hueOf } from "../../program-hue";
import { REVIEW_TONE, Verdicts } from "../../verdicts";

/**
 * **The group header restated above the record, chips and all, with this review
 * highlighted** (issues/42, issues/86).
 *
 * Variant D's answer to *where do the siblings go*, and the one the grilling
 * assembled: not a table at the foot of the main column (A) and not a strip in
 * the rail (C), but **the group the reader came from, put back over the record**.
 * It is the same group, assembled by the same module the list assembles it with,
 * so the header a reader clicked through and the header they land on cannot
 * disagree about what any program has decided.
 *
 * **Every sibling is a link, including the ones outside the reader's arms** —
 * those open read-only, which is what makes the verdict chips honest: a chip that
 * announced a verdict and refused to open it would be worse than no chip.
 *
 * It computes **no rule**. *Read only* is rendered off the row's own
 * `actions === null`, which is the server's answer and the same encoding the list
 * renders as an absent menu.
 */
export function ReviewGroupHeader({
  proposal,
  reviewId,
}: {
  proposal: ProposalGroup;
  reviewId: string;
}) {
  const count = proposal.reviews.length;

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="sm" wrap="wrap">
            <Text fw={600}>{proposal.title}</Text>
            <Text size="sm" c="dimmed">
              {proposal.credits} cr
            </Text>
            <Named who={proposal.proposedBy} />
            <Text size="sm" c="dimmed">
              {count === 1 ? "one program reviewing" : `${count} programs reviewing`}
            </Text>
          </Group>
          <Verdicts verdicts={proposal.verdicts} here={reviewId} />
        </Group>

        <Table withRowBorders={false} verticalSpacing={4}>
          <Table.Tbody>
            {proposal.reviews.map((review) => {
              const here = review.reviewId === reviewId;
              return (
                <Table.Tr
                  key={review.reviewId}
                  style={here ? { background: "var(--mantine-color-blue-light)" } : undefined}
                >
                  <Table.Td w={80}>
                    <Badge color={hueOf(review.programCode)} variant="light">
                      {review.programCode}
                    </Badge>
                  </Table.Td>
                  <Table.Td w={120}>
                    <Badge color={REVIEW_TONE[review.state]} variant="light">
                      {review.state}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {/*
                      **Three different facts, and only one of them is about the
                      reader.** *You are here* is where they are; *read only* is
                      this row's fidelity, which is the row's own `actions ===
                      null`; and a blank is a sibling they may act on. None of
                      them is a refusal, and none carries a sentence — issues/38's
                      rule that a refusal with no control is dead text.
                    */}
                    {here ? (
                      <Text size="sm" c="dimmed">
                        you are here
                      </Text>
                    ) : review.actions === null ? (
                      <Text size="sm" c="dimmed" fs="italic">
                        read only
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td w={40} ta="right">
                    {here ? null : (
                      <Box>
                        <OpenReview
                          reviewId={review.reviewId}
                          where={reviewWhere(proposal.title, review.programCode)}
                        />
                      </Box>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Stack>
    </Paper>
  );
}
