"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  List,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";

import type { OfferingEventName } from "@/db/read/offering-rows";
import type { EditAffordance, LastChanged, PermittedAction, Refusal } from "@/db/read/shape";
import type { OfferingState } from "@/lib/machines/offering.machine";

import { EXPLAINED } from "../../explained-moves";
import { fireOfferingEvent } from "../../offering-actions";
import { stamp } from "../../stamp";

/**
 * **The rail, inherited wholesale from the Course page** (issues/41, issues/83,
 * issues/84).
 *
 * Three boxes in this order and no other: **status and the moves**, **changes**,
 * and **last changed**. Refusals are stated **in the open** beneath the control
 * they refuse, which is the whole reason issues/40 bought a page rather than a
 * drawer — the treatment issues/37 called the strongest and rejected on row
 * height in a grouped table, a premise a one-record page does not have.
 *
 * It computes **no rule**. Every sentence here is the writer's, shipped as data
 * by `getOfferingPage`, and the count on the `Edit` control is a rendering of
 * `EditAffordance.open` rather than a second reading of the field-class map.
 *
 * **The one thing it adds to the Course page's rail is the reason box**, because
 * this machine has the two moves that ask why. The answer to *which* is the
 * Lineup menu's own — `EXPLAINED` is imported rather than restated — and it fires
 * through the same Server Action (issues/10, issues/37, issues/84).
 */
export function OfferingRail({
  offeringId,
  where,
  status,
  actions,
  edit,
  lastChanged,
  showLastChanged,
}: {
  offeringId: string;
  /** *ITPG-GT 2233 §2* — what the reason box says it is about. */
  where: string;
  status: OfferingState;
  actions: readonly PermittedAction<OfferingEventName>[] | null;
  edit: EditAffordance | null;
  lastChanged: LastChanged;
  /**
   * **The *last changed* box goes with the history** (issues/28's Tier 2,
   * issues/41): it is the same class of fact, so a `student` and an `advisor`
   * get neither. It is a separate flag rather than `lastChanged !== null`
   * because `null` already means *never changed since it was created*, which is
   * a thing the box says in words.
   */
  showLastChanged: boolean;
}) {
  // A refusal that arrives *after* the click: the world moved between the render
  // and the button. The rail's own refusals are stated in the rail.
  const [refused, setRefused] = useState<readonly Refusal[] | null>(null);
  const [asking, setAsking] = useState<OfferingEventName | null>(null);

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
            Status
          </Text>
          <Group>
            <Badge color={TONE[status]} variant="light" size="lg">
              {status}
            </Badge>
          </Group>

          {/*
            **No actions and no refusals for an actor who can never act** — both
            absent, neither greyed (issues/37, issues/38). A refusal explains why
            a control will not fire, and a refusal with no control is dead text.
            The server decided it by giving the page a `null` action set.
          */}
          {actions === null ? null : (
            <Moves
              offeringId={offeringId}
              actions={actions}
              onRefused={setRefused}
              onAsk={setAsking}
            />
          )}
        </Stack>
      </Paper>

      {edit === null ? null : (
        <Paper withBorder p="md" radius="md">
          <Changes edit={edit} />
        </Paper>
      )}

      {showLastChanged ? (
        <Paper withBorder p="md" radius="md">
          <Stack gap="xs">
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              Last changed
            </Text>
            {/*
              **The only trace of the field edits the log is forbidden to
              record** (issues/17, issues/41) — and sharper on a class than on a
              course, because a room, a cap and a call number are corrected long
              after the last transition fired. Creation moved to the history's
              first line, so this box carries changes alone, and `null` is stated
              in words rather than left as an empty box.
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
      ) : null}

      <ReasonBox
        offeringId={offeringId}
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
 * truth (issues/40, issues/41). The Lineup's row renders the same set as `⋯ n`.
 *
 * A move the machine does not offer at all is **absent** rather than greyed: the
 * state is not a refusal, it is the shape of the lifecycle, so `Concluded` and
 * `Dead` carry no controls here rather than fourteen dead ones.
 */
function Moves({
  offeringId,
  actions,
  onRefused,
  onAsk,
}: {
  offeringId: string;
  actions: readonly PermittedAction<OfferingEventName>[];
  onRefused: (refusals: readonly Refusal[] | null) => void;
  onAsk: (event: OfferingEventName) => void;
}) {
  const [firing, startFiring] = useTransition();

  if (actions.length === 0) {
    return (
      <>
        <Divider />
        <Text size="sm" c="dimmed">
          This class has reached the end of its lifecycle. There is nothing left to do to it.
        </Text>
      </>
    );
  }

  const fire = (event: OfferingEventName) => {
    if (EXPLAINED.has(event)) {
      onAsk(event);
      return;
    }
    startFiring(async () => {
      onRefused(null);
      const outcome = await fireOfferingEvent(offeringId, event);
      onRefused(outcome?.refusals ?? null);
    });
  };

  return (
    <>
      <Divider />
      <Stack gap="sm">
        {actions.map((action) =>
          action.permitted ? (
            <Button
              key={action.event}
              variant="light"
              loading={firing}
              onClick={() => fire(action.event)}
            >
              {action.event}
              {EXPLAINED.has(action.event) ? "…" : ""}
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
 * *1 of 3 sections is yours*. A class's three field classes disagree about their
 * writer, and one of them, **Seat-sharing tags**, is the only scope in the model
 * that points **away** from the record (issues/25, issues/30): it is open to a
 * director of *another* program and shut to this class's own, which reads as odd
 * and is correct. Its refusal names no program, because the reader who sees it
 * directs none that could claim these seats — `getOfferingPage` works that out,
 * and nothing here computes it.
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
            **The control can point nowhere until the class edit page lands**
            (issues/62's `/classes/:id/edit`, a later ticket), which is what
            issues/84 sanctioned in as many words. It is rendered rather than
            hidden because what it says is already true — the count beneath it is
            this actor's answer — and greying it would read as *not yours*, which
            is the one thing it must not say to somebody a section is open to.
          */}
          <Button variant="light">Edit this class</Button>
          <Text size="xs" c="dimmed">
            {edit.open.length} of {total} {total === 1 ? "section is" : "sections are"} yours
          </Text>
          <Text size="xs" c="dimmed" fs="italic">
            The class edit page is not built yet.
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
            {refused.notYours ? <Labelled label="Not yours" refusal={refused.notYours} /> : null}
            {refused.notNow ? <Labelled label="Not now" refusal={refused.notNow} /> : null}
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

function ReasonBox({
  offeringId,
  where,
  asking,
  onClose,
  onRefused,
}: {
  offeringId: string;
  where: string;
  asking: OfferingEventName | null;
  onClose: () => void;
  onRefused: (refusals: readonly Refusal[] | null) => void;
}) {
  const [reason, setReason] = useState("");
  const [firing, startFiring] = useTransition();

  const close = () => {
    setReason("");
    onClose();
  };

  const fire = () => {
    if (!asking) return;
    startFiring(async () => {
      onRefused(null);
      const outcome = await fireOfferingEvent(offeringId, asking, reason);
      onRefused(outcome?.refusals ?? null);
      close();
    });
  };

  return (
    <Modal opened={asking !== null} onClose={close} title={asking ? `${asking} ${where}` : ""}>
      <Stack gap="md">
        <Textarea
          label="Why"
          description="Optional, and it goes on the record beside the move."
          placeholder="Enrolment did not hold."
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          autosize
          minRows={3}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            Never mind
          </Button>
          <Button color="orange" loading={firing} onClick={fire}>
            {asking ?? "Fire"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** ***Not yours*** and ***Not now***, labelled, because both can be true at once (issues/62). */
function Labelled({ label, refusal }: { label: string; refusal: Refusal }) {
  return (
    <Group gap={6} align="flex-start" wrap="nowrap" mt={2}>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ whiteSpace: "nowrap" }}>
        {label}
      </Text>
      <Refused refusal={refusal} />
    </Group>
  );
}

/**
 * A refusal, rendered as the one value it is (issues/14): the sentence, and —
 * where the refusal's whole content is data elsewhere in the system — the
 * dependency listed beneath it (issues/38).
 */
function Refused({ refusal }: { refusal: Refusal }) {
  return (
    <Box>
      <Text size="xs" c="dimmed">
        {refusal.sentence}
      </Text>
      {refusal.dependencies.length > 0 ? (
        <List size="xs" c="dimmed" withPadding>
          {refusal.dependencies.map((dependency) => (
            <List.Item key={dependency}>{dependency}</List.Item>
          ))}
        </List>
      ) : null}
    </Box>
  );
}

/**
 * Every Offering state as tone — the forward path, the waiting, and the ends.
 * Typed as a total `Record` over the state union, so a state added to the machine
 * is a compiler error here rather than a badge that renders with no colour.
 */
const TONE: Readonly<Record<OfferingState, string>> = {
  Slated: "gray",
  Staffed: "blue",
  Offered: "yellow",
  Deferred: "yellow",
  Accepted: "teal",
  Scheduled: "teal",
  Published: "teal",
  Listed: "teal",
  Running: "green",
  Evaluating: "green",
  Concluded: "gray",
  Declined: "orange",
  Canceled: "orange",
  Dead: "dark",
};
