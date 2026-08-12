"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";

import type { ReviewPage } from "@/db/read/review";
import type { ReviewEventName } from "@/db/read/review-rows";
import type { EditAffordance, LastChanged, PermittedAction, Refusal } from "@/db/read/shape";

import { EXPLAINED_REVIEW } from "../../explained-moves";
import { fireReviewEvent } from "../../review-actions";
import { stamp } from "../../stamp";
import { REVIEW_TONE } from "../../verdicts";
import { Refused, LabelledRefusal } from "../../refused";

/**
 * **The rail, inherited wholesale from the Course page** (issues/41, issues/83,
 * issues/84, issues/86).
 *
 * Boxes in this order and no other: **the verdict and the moves**, **changes**,
 * and **last changed**. Refusals are stated **in the open** beneath the control
 * they refuse, which is the whole reason issues/40 bought a page rather than a
 * drawer.
 *
 * **The read-only fidelity drops two of the three boxes entirely**, and that is
 * issues/38's rule rather than a layout choice: read-only means controls **and**
 * refusals absent, not greyed. What is left is the verdict, what it minted, and
 * when the record last changed — every one of them a fact about the review rather
 * than about what this reader may do to it.
 *
 * **The minted course is linked from here**, which is the one route from a
 * decision to its consequence (issues/42, issues/49), and the **body-drift line**
 * sits beside it for the reason the course page carries the same line: the mint
 * copies, so the two are free to disagree and nothing else records that they do.
 *
 * It computes **no rule**. Every sentence here is the writer's, shipped as data
 * by `getReviewPage`, and the count on the `Edit` control is a rendering of
 * `EditAffordance.open` rather than a second reading of the field-class map.
 */
export function ReviewRail({
  reviewId,
  where,
  programCode,
  state,
  actions,
  edit,
  mintedCourse,
  bodyHasDrifted,
  lastChanged,
}: {
  reviewId: string;
  /** *Physical Computing II · ITP* — what the move box says it is about. */
  where: string;
  programCode: string;
  state: ReviewPage["state"];
  actions: readonly PermittedAction<ReviewEventName>[] | null;
  edit: EditAffordance | null;
  mintedCourse: ReviewPage["mintedCourse"];
  bodyHasDrifted: boolean;
  lastChanged: LastChanged;
}) {
  // A refusal that arrives *after* the click: the world moved between the render
  // and the button. The rail's own refusals are stated in the rail.
  const [refused, setRefused] = useState<readonly Refusal[] | null>(null);
  const [asking, setAsking] = useState<ReviewEventName | null>(null);

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

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {programCode}&rsquo;s verdict
          </Text>
          <Group>
            <Badge color={REVIEW_TONE[state]} variant="light" size="lg">
              {state}
            </Badge>
          </Group>

          {mintedCourse ? (
            <Text size="sm">
              Minted{" "}
              <Anchor component={Link} href={`/courses/${mintedCourse.courseId}`} ff="monospace">
                {mintedCourse.courseNumber}
              </Anchor>
              , which is this decision&rsquo;s consequence and the only route to it.
            </Text>
          ) : null}

          {/*
            **The body-drift line, on the proposal side of the same fact the
            course page states** (issues/42 amending issues/41). It matters more
            there — whoever is about to schedule or teach the course is never on
            this screen — and it belongs here too, because this is where somebody
            about to approve is reading a body that no longer matches what a
            sibling program already minted.
          */}
          {bodyHasDrifted ? (
            <Alert color="yellow" variant="light" p="xs">
              <Text size="xs">
                The shared body no longer says what a course minted from it says. The mint copies
                rather than references, so the two are free to disagree, and nothing else in the
                system records that they do.
              </Text>
            </Alert>
          ) : null}

          {/*
            **No actions and no refusals at the read-only fidelity** — both
            absent, neither greyed (issues/37, issues/38). The server decided it
            by giving the page a `null` action set.
          */}
          {actions === null ? null : (
            <Moves actions={actions} onAsk={setAsking} />
          )}
        </Stack>
      </Paper>

      {edit === null ? null : (
        <Paper withBorder p="md" radius="md">
          <Changes edit={edit} />
        </Paper>
      )}

      <Paper withBorder p="md" radius="md">
        <Stack gap="xs">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Last changed
          </Text>
          {/*
            **The only trace of the field edits the log is forbidden to record**
            (issues/17, issues/41), and on this page it covers **two** tables:
            the review's assignment and the shared body, both of which this page's
            own `Edit` control opens. `getReviewPage` returns the later of the
            two, so an edit made from here always moves this box.

            It is rendered for every reader, unlike the Course and Offering
            rails, where it is hidden with the history under Tier 2. The review's
            log is Tier 3's own subject, so there is nobody on this page who may
            read the record and not the record of who changed it.
          */}
          {lastChanged === null ? (
            <Text size="sm" c="dimmed">
              Never changed since it was created.
            </Text>
          ) : (
            <Box>
              <Text size="sm">{lastChanged.by.displayName ?? lastChanged.by.netid}</Text>
              <Text size="xs" c="dimmed">
                {stamp(lastChanged.at)}
              </Text>
            </Box>
          )}
        </Stack>
      </Paper>

      <MoveBox
        reviewId={reviewId}
        where={where}
        asking={asking}
        onClose={() => setAsking(null)}
        onRefused={setRefused}
      />
    </Stack>
  );
}

/**
 * **The permitted-action set, rendered as buttons with the refusals stated
 * beneath** — the second of the set's two treatments and not a second source of
 * truth (issues/40, issues/41). The proposals list renders the same set as `⋯ n`.
 *
 * A move the machine does not offer at all is **absent** rather than greyed: the
 * state is not a refusal, it is the shape of the lifecycle, so an `Approved` or
 * `Rejected` review carries no controls here rather than three dead ones.
 *
 * **Every move opens the box and none fires from the rail**, which is the list's
 * own arrangement: `approve` asks for the course number it will mint under, and
 * the other two are `EXPLAINED_REVIEW` and ask why. Branching on a condition that
 * is always true would read as a case that can happen and cannot.
 */
function Moves({
  actions,
  onAsk,
}: {
  actions: readonly PermittedAction<ReviewEventName>[];
  onAsk: (event: ReviewEventName) => void;
}) {
  if (actions.length === 0) {
    return (
      <>
        <Divider />
        <Text size="sm" c="dimmed">
          This review has reached a verdict. There is nothing left to do to it.
        </Text>
      </>
    );
  }

  return (
    <>
      <Divider />
      <Stack gap="sm">
        {actions.map((action) =>
          action.permitted ? (
            <Button key={action.event} variant="light" onClick={() => onAsk(action.event)}>
              {action.event}…
            </Button>
          ) : (
            <Box key={action.event}>
              <Button variant="default" disabled fullWidth>
                {action.event}
              </Button>
              <Box mt={4}>
                <Refused refusal={action.refusal} />
              </Box>
            </Box>
          ),
        )}
      </Stack>
    </>
  );
}

/**
 * **The `Edit` control, with a count beneath it** (issues/62).
 *
 * The control's **label does not vary with the actor** — a control whose name
 * changes per reader stops being one act — and the **count carries the truth**:
 * *1 of 2 sections is yours*. A review's two classes disagree about both of their
 * predicates: the assignment is the program director's alone and shuts once the
 * review is finished, while the **shared body** is open to the proposer and to a
 * director or head of a review that is `Developing` — which is a gate on a
 * **sibling**, not on this record, and the one place in the map where that is so.
 *
 * **Where nothing is open the control is absent and every class's refusal takes
 * its place**, which is why a field refusal is sometimes two sentences where a
 * transition refusal is always one.
 */
function Changes({ edit }: { edit: EditAffordance }) {
  const total = edit.open.length + edit.refused.length;

  return (
    <Stack gap="xs">
      <Text size="xs" tt="uppercase" fw={700} c="dimmed">
        Changes
      </Text>

      {edit.open.length === 0 ? (
        <Text size="sm">Nothing on this page is yours to change.</Text>
      ) : (
        <>
          {/*
            **The control can point nowhere until the review edit page lands**
            (issues/62's `/reviews/:id/edit`, a later ticket), which is what
            issues/86 sanctioned in as many words and what issues/83 and
            issues/84 shipped before it. It is rendered rather than hidden
            because what it says is already true — the count beneath it is this
            actor's answer — and greying it would read as *not yours*, which is
            the one thing it must not say to somebody a section is open to.
          */}
          <Button variant="light">Edit this review</Button>
          <Text size="xs" c="dimmed">
            {edit.open.length} of {total} {total === 1 ? "section is" : "sections are"} yours
          </Text>
          <Text size="xs" c="dimmed" fs="italic">
            The review edit page is not built yet.
          </Text>
          {edit.refused.length > 0 ? (
            <Text size="xs" c="dimmed" mt={4}>
              The rest, and why:
            </Text>
          ) : null}
        </>
      )}

      {/*
        **Every refused class, whichever branch is above.** The list is the same
        list: where nothing is open it *replaces* the control, and where
        something is it sits under the count.
      */}
      <Stack gap="sm">
        {edit.refused.map((refused) => (
          <Box key={refused.fieldClass}>
            <Text size="sm" fw={600}>
              {refused.fieldClass}
            </Text>
            {refused.notYours ? <LabelledRefusal label="Not yours" refusal={refused.notYours} /> : null}
            {refused.notNow ? <LabelledRefusal label="Not now" refusal={refused.notNow} /> : null}
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

/**
 * **The box the three moves open, and `approve`'s field is not optional** — the
 * list's own box, rendered a second way rather than decided a second time
 * (issues/7, issues/85).
 *
 * `approve` is the seam: one transaction moves the review and mints a course in
 * that program's catalog, and each approving program mints its own number, so
 * there is nowhere else for the number to come from — the proposal deliberately
 * has none. The **reason** box is the other half and renders for
 * `EXPLAINED_REVIEW`'s two, which is the set both screens import rather than each
 * restating.
 */
function MoveBox({
  reviewId,
  where,
  asking,
  onClose,
  onRefused,
}: {
  reviewId: string;
  where: string;
  asking: ReviewEventName | null;
  onClose: () => void;
  onRefused: (refusals: readonly Refusal[] | null) => void;
}) {
  const [reason, setReason] = useState("");
  const [courseNumber, setCourseNumber] = useState("");
  const [firing, startFiring] = useTransition();

  const mints = asking === "approve";
  const explains = asking !== null && EXPLAINED_REVIEW.has(asking);

  const forget = () => {
    setReason("");
    setCourseNumber("");
    onClose();
  };

  const fire = () => {
    if (!asking) return;
    startFiring(async () => {
      onRefused(null);
      const outcome = await fireReviewEvent(reviewId, asking, { reason, courseNumber });
      onRefused(outcome?.refusals ?? null);
      forget();
    });
  };

  return (
    <Modal opened={asking !== null} onClose={forget} title={asking ? `${asking} — ${where}` : ""}>
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
            color={asking === "reject" ? "orange" : "blue"}
            loading={firing}
            disabled={mints && courseNumber.trim().length === 0}
            onClick={fire}
          >
            {asking ?? "Fire"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

