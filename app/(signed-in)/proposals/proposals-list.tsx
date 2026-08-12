"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { DataTable } from "mantine-datatable";

import type { ProposalGroup, ProposalReviewRow, ReviewEventName } from "@/db/read/review-rows";
import type { Refusal } from "@/db/read/shape";

import { EXPLAINED_REVIEW } from "../explained-moves";
import { Named, NamedLine } from "../named";
import { OpenCourse } from "../open-course";
import { hueOf } from "../program-hue";
import { OpenReview } from "../open-review";
import { fireReviewEvent } from "../review-actions";
import { reviewWhere } from "../review-where";
import { REVIEW_TONE, Verdicts } from "../verdicts";
import { Refused } from "../refused";

/**
 * **The proposals list** (issues/42, issues/85).
 *
 * It inherits the grouping device and the `⋯ n` menu from the two lists before
 * it — records are proposals, `rowExpansion` with `trigger: 'always'` stands in
 * for the row grouping mantine-datatable does not have, and `n` is how many
 * moves this actor can actually make — and adds two things that are this view's
 * own.
 *
 * **The verdict chips on the group header, which are the load-bearing part.**
 * Every program's verdict, whether or not the read rule reaches the reader,
 * because the reviews being independent and able to disagree is issues/7's whole
 * reason for splitting the machine. They are also what makes a status column
 * unnecessary: a proposal has no state, and a derived one would be
 * viewer-dependent, so per-program chips make the question stop existing rather
 * than answer it.
 *
 * **A read-only row states nothing about why.** `actions === null` on this
 * screen means *a sibling review outside your arms*, and issues/38's rule is that
 * read-only means controls **and** refusals absent, not greyed: a refusal under a
 * control the reader was never eligible for is dead text explaining a button that
 * was never there. It reads as `—`, exactly as a review with no moves left does.
 *
 * It computes **no rule**. Every refusal it renders is a sentence the writer
 * wrote.
 */
export function ProposalsList({ groups }: { groups: readonly ProposalGroup[] }) {
  // A refusal that arrives *after* the click: the world moved between the render
  // and the button. The menu's own refusals are stated in the menu.
  const [refused, setRefused] = useState<readonly Refusal[] | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);

  return (
    <Stack gap="md">
      {refused ? (
        <Alert
          color="orange"
          title="That move was refused"
          withCloseButton
          onClose={() => setRefused(null)}
        >
          <Stack gap={4}>
            {refused.map((refusal) => (
              <Refused key={refusal.sentence} refusal={refusal} />
            ))}
          </Stack>
        </Alert>
      ) : null}

      <DataTable
        withTableBorder
        noHeader
        idAccessor="proposalId"
        records={[...groups]}
        columns={[
          {
            accessor: "title",
            render: (group) => (
              <Group gap="sm" wrap="wrap">
                <Text fw={600}>{group.title}</Text>
                {/*
                  **The shared body, stated once**: title, credits, who proposed
                  it and when. A review row beneath carries only what differs
                  between the programs reading it.
                */}
                <Text size="sm" c="dimmed">
                  {group.credits} cr
                </Text>
                {/*
                  **The proposer is a person and is stated the way every other
                  screen states one** (issues/9, issues/84): `Named` carries the
                  netid-plus-*no name on file* fallback, which is reachable here
                  and not hypothetical — an area head who never taught has no
                  reason to be in the roster feed at all.
                */}
                <Named who={group.proposedBy} />
                <Text size="sm" c="dimmed">
                  {proposed(group.proposedAt)}
                </Text>
                <Box ml="auto">
                  <Verdicts verdicts={group.verdicts} />
                </Box>
              </Group>
            ),
          },
        ]}
        rowExpansion={{
          trigger: "always",
          allowMultiple: true,
          content: ({ record }) => (
            <Box p="xs">
              <DataTable
                withColumnBorders
                highlightOnHover
                idAccessor="reviewId"
                records={[...record.reviews]}
                columns={[
                  {
                    accessor: "programCode",
                    title: "Program",
                    noWrap: true,
                    render: (row) => (
                      <Badge color={hueOf(row.programCode)} variant="light">
                        {row.programCode}
                      </Badge>
                    ),
                  },
                  {
                    accessor: "state",
                    title: "State",
                    render: (row) => (
                      <Badge color={REVIEW_TONE[row.state]} variant="light">
                        {row.state}
                      </Badge>
                    ),
                  },
                  {
                    /**
                     * **The assignment, which is per review and not per
                     * proposal** (issues/25, issues/32): areas are
                     * program-scoped, so three approving programs mint three
                     * courses that may sit in three different areas under three
                     * different heads. Both halves are stated, because area and
                     * head are separate assignments and *half missing* is a real
                     * state.
                     */
                    accessor: "areas",
                    title: "Area and head",
                    render: (row) => <Assignment row={row} />,
                  },
                  {
                    /**
                     * **The one route from a decision to its consequence**
                     * (issues/42, issues/49). An approved review is the only
                     * screen that names the course it minted, which is the whole
                     * reason finished reviews stay in the query.
                     */
                    accessor: "mintedCourse",
                    title: "Minted",
                    noWrap: true,
                    render: (row) =>
                      row.mintedCourse ? (
                        <Group gap={6} wrap="nowrap">
                          <Text ff="monospace" size="sm">
                            {row.mintedCourse.courseNumber}
                          </Text>
                          <OpenCourse
                            courseId={row.mintedCourse.courseId}
                            courseNumber={row.mintedCourse.courseNumber}
                          />
                        </Group>
                      ) : (
                        <Text size="sm" c="dimmed">
                          —
                        </Text>
                      ),
                  },
                  {
                    accessor: "actions",
                    title: "Actions",
                    textAlign: "right",
                    render: (row) => (
                      <ActionMenu row={row} where={whichReview(record, row)} onAsk={setAsking} />
                    ),
                  },
                  {
                    accessor: "reviewId",
                    title: "",
                    textAlign: "right",
                    noWrap: true,
                    render: (row) => (
                      <OpenReview reviewId={row.reviewId} where={whichReview(record, row)} />
                    ),
                  },
                ]}
              />
            </Box>
          ),
        }}
      />

      <MoveBox asking={asking} onClose={() => setAsking(null)} onRefused={setRefused} />
    </Stack>
  );
}

/**
 * *Physical Computing II · ITP* — which review a control is about, built once and
 * read by both controls on the row. The spelling is `../review-where`'s since
 * issues/86, because the review page names the same review in its breadcrumb, its
 * move box and its restated group header: two spellings of one address is how a
 * menu's heading and a link's label come to name the same review differently.
 */
function whichReview(group: ProposalGroup, review: ProposalReviewRow): string {
  return reviewWhere(group.title, review.programCode);
}

const PROPOSED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function proposed(at: string): string {
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? at : PROPOSED.format(parsed);
}

// ---------------------------------------------------------------------------
// The assignment
// ---------------------------------------------------------------------------

/**
 * The area and the head, in that order and each with its own absence. A review
 * with neither is not broken — nothing about `approve` requires them, and the
 * rule they answer to fires later, when somebody tries to offer the course the
 * mint made (issues/32).
 */
function Assignment({ row }: { row: ProposalReviewRow }) {
  return (
    <Stack gap={2}>
      {row.areas.length > 0 ? (
        <Group gap={4}>
          {row.areas.map((tag, index) => (
            <Badge key={index} variant="default" size="sm">
              {tag.name}
            </Badge>
          ))}
        </Group>
      ) : (
        <Text size="sm" c="dimmed" fs="italic">
          No area yet
        </Text>
      )}
      {row.areaHead ? (
        <NamedLine who={row.areaHead} />
      ) : (
        <Text size="sm" c="dimmed" fs="italic">
          No head yet
        </Text>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// The ⋯ n menu
// ---------------------------------------------------------------------------

type Asking = { reviewId: string; event: ReviewEventName; where: string };

/**
 * **The `⋯ n` menu** (issues/37), inherited whole. One control per row; `n` is
 * how many moves this actor can actually make, so `⋯ 0` says *nothing to do
 * here* without opening anything.
 *
 * Two rows carry no menu at all, and they are different facts stated the same
 * way — a finished review, whose machine offers nothing, and a sibling review
 * outside the reader's arms, which is read-only. Neither says anything further:
 * the first because a final state is the shape of the lifecycle rather than a
 * refusal, and the second because a refusal there would explain a control the
 * reader was never eligible for.
 */
function ActionMenu({
  row,
  where,
  onAsk,
}: {
  row: ProposalReviewRow;
  where: string;
  onAsk: (asking: Asking) => void;
}) {
  const actions = row.actions ?? [];

  if (actions.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        —
      </Text>
    );
  }

  const open = actions.filter((action) => action.permitted).length;

  return (
    <Menu position="bottom-end" shadow="md" width={380} withinPortal>
      <Menu.Target>
        <Button variant="subtle" size="compact-sm" aria-label="Moves">
          ⋯ {open}
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>
          {where} — {open} of {actions.length} available to you
        </Menu.Label>
        {actions.map((action) =>
          action.permitted ? (
            // **Every move this machine offers asks something first**, so every
            // item opens the box and none fires from the menu: `approve` asks for
            // the course number it will mint under, and the other two are
            // `EXPLAINED_REVIEW` and ask why. The Lineup's menu has both kinds and
            // branches; this one would be branching on a condition that is always
            // true, which reads as a case that can happen and cannot.
            <Menu.Item
              key={action.event}
              onClick={() => onAsk({ reviewId: row.reviewId, event: action.event, where })}
            >
              <Text size="sm">{action.event}…</Text>
            </Menu.Item>
          ) : (
            <Menu.Item key={action.event} disabled component="div">
              <Stack gap={2}>
                <Text size="sm">{action.event}</Text>
                <Refused refusal={action.refusal} />
              </Stack>
            </Menu.Item>
          ),
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * **The box the three moves open, and `approve`'s field is not optional.**
 *
 * `approve` is the seam (issues/7): one transaction moves the review and mints a
 * course in that program's catalog, and each approving program mints its own
 * number, so there is nowhere else for the number to come from — the proposal
 * deliberately has none.
 *
 * The **reason** box is the other half, and it renders for `EXPLAINED_REVIEW`'s
 * two and not for `approve`: `develop` and `reject` are the moves whose *why* is
 * their whole content, and the seed's own histories put reasons on exactly those
 * two. Skipping it writes `null` rather than an empty string, because a blank
 * reason and no reason are different facts.
 */
function MoveBox({
  asking,
  onClose,
  onRefused,
}: {
  asking: Asking | null;
  onClose: () => void;
  onRefused: (refusals: readonly Refusal[] | null) => void;
}) {
  const [reason, setReason] = useState("");
  const [courseNumber, setCourseNumber] = useState("");
  const [firing, startFiring] = useTransition();

  const mints = asking?.event === "approve";
  // **`EXPLAINED_REVIEW` decides the box, not this component**, and `approve` is
  // deliberately outside it: it asks for a course number, which is part of what
  // the event *is*, and the log can reconstruct the *why* of an approval from
  // the state pair. Offering a reason box on every move would make that set dead
  // — two screens would then disagree about which moves ask why (issues/84).
  const explains = asking !== null && EXPLAINED_REVIEW.has(asking.event);
  const forget = () => {
    setReason("");
    setCourseNumber("");
    onClose();
  };

  const fire = () => {
    if (!asking) return;
    startFiring(async () => {
      onRefused(null);
      const outcome = await fireReviewEvent(asking.reviewId, asking.event, {
        reason,
        courseNumber,
      });
      onRefused(outcome?.refusals ?? null);
      forget();
    });
  };

  return (
    <Modal
      opened={asking !== null}
      onClose={forget}
      title={asking ? `${asking.event} — ${asking.where}` : ""}
    >
      <Stack gap="md">
        {mints ? (
          <TextInput
            label="Course number"
            description="Approving mints a course in this program's catalog, and it is numbered here."
            placeholder="ITPG-GT 2245"
            value={courseNumber}
            onChange={(event) => setCourseNumber(event.currentTarget.value)}
            required
          />
        ) : null}

        {explains ? (
          <Textarea
            label="Why"
            description="Optional, and it goes on the record beside the move."
            placeholder="The outcomes overlap Creative Coding almost exactly."
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            autosize
            minRows={3}
          />
        ) : null}

        <Group justify="flex-end">
          <Button variant="default" onClick={forget}>
            Never mind
          </Button>
          <Button
            color={asking?.event === "reject" ? "orange" : "blue"}
            loading={firing}
            disabled={mints && courseNumber.trim().length === 0}
            onClick={fire}
          >
            {asking?.event ?? "Fire"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

