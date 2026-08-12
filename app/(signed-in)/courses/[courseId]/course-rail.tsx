"use client";

import { useState, useTransition } from "react";
import { Alert, Badge, Box, Button, Divider, Group, List, Paper, Stack, Text } from "@mantine/core";

import type { CourseEventName } from "@/db/read/course-rows";
import type { EditAffordance, LastChanged, PermittedAction, Refusal } from "@/db/read/shape";
import type { CourseState } from "@/lib/machines/course.machine";

import { fireCourseEvent } from "../../course-actions";
import { stamp } from "../../stamp";
import { Refused, LabelledRefusal } from "../../refused";

/**
 * **The rail: what you may do about the record, in view while the record is
 * read** (issues/40, issues/41).
 *
 * It is the whole reason a page was bought rather than a drawer. Refusals are
 * stated **in the open** beneath the control they refuse, which is the treatment
 * issues/37 called the strongest and rejected on **row height in a grouped
 * table** — a premise a one-record page does not have, exactly as issues/38 found
 * for the roles page.
 *
 * Three boxes, in this order and no other: **status and the moves**, **changes**,
 * and **last changed**. The record page's rail carries the `Edit` control with a
 * count beneath it; the edit page's rail is the one that carries *Not yours to
 * change here* (issues/62).
 *
 * It computes **no rule**. Every sentence here is the writer's, shipped as data
 * by `getCoursePage`, and the count on the `Edit` control is a rendering of
 * `EditAffordance.open` rather than a second reading of the field-class map.
 */
export function CourseRail({
  courseId,
  status,
  actions,
  edit,
  lastChanged,
  showLastChanged,
}: {
  courseId: string;
  status: CourseState;
  actions: readonly PermittedAction<CourseEventName>[] | null;
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
          {actions === null ? null : <Moves courseId={courseId} actions={actions} onRefused={setRefused} />}
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
              record** (issues/17, issues/41). Creation moved to the history's
              first line, so this box carries changes alone — and `null` is
              stated in words rather than left as an empty box, because *never
              changed* is a fact and a blank is not.
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
    </Stack>
  );
}

/**
 * **The permitted-action set, rendered as buttons with the refusals stated
 * beneath** — the second of the set's two treatments and not a second source of
 * truth (issues/40, issues/41). The Catalog row renders the same set as `⋯ n`.
 *
 * A move the machine does not offer at all is **absent** rather than greyed: the
 * state is not a refusal, it is the shape of the lifecycle, so a `Retired` course
 * carries no controls here rather than three dead ones.
 */
function Moves({
  courseId,
  actions,
  onRefused,
}: {
  courseId: string;
  actions: readonly PermittedAction<CourseEventName>[];
  onRefused: (refusals: readonly Refusal[] | null) => void;
}) {
  const [firing, startFiring] = useTransition();

  if (actions.length === 0) {
    return (
      <>
        <Divider />
        <Text size="sm" c="dimmed">
          This course has reached the end of its lifecycle. There is nothing left to do to it.
        </Text>
      </>
    );
  }

  const fire = (event: CourseEventName) =>
    startFiring(async () => {
      onRefused(null);
      const outcome = await fireCourseEvent(courseId, event);
      onRefused(outcome?.refusals ?? null);
    });

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
 * *2 of 3 sections are yours*. A record's field classes disagree about their
 * writer and about their state rule, so *everything you may change* is
 * actor-shaped, and the same URL is a different page for a coordinator and for a
 * director.
 *
 * **Where nothing is open the control is absent and every class's refusal takes
 * its place**, which is why a field refusal is sometimes two sentences where a
 * transition refusal is always one: issues/28 ANDs a state predicate and a role
 * predicate and checks them separately, so both can fail at once and stating one
 * would hide the wall the reader walks into next.
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
            **The control can point nowhere until the course edit page lands**
            (issues/62's `/courses/:id/edit`, a later ticket). It is rendered
            rather than hidden because what it says is already true — the count
            beneath it is this actor's answer — and greying it would read as
            *not yours*, which is the one thing it must not say to somebody two
            sections are open to.
          */}
          <Button variant="light">Edit this course</Button>
          <Text size="xs" c="dimmed">
            {edit.open.length} of {total} {total === 1 ? "section is" : "sections are"} yours
          </Text>
          <Text size="xs" c="dimmed" fs="italic">
            The course edit page is not built yet.
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
        something is it sits under the count. Rendering it twice would be two
        copies of the one place a field class's two refusals are stated.
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
 * The three Course states as tone. Typed as a total `Record` over the state
 * union, so a state added to the machine is a compiler error here rather than a
 * badge that renders with no colour at all.
 */
const TONE: Readonly<Record<CourseState, string>> = {
  Approved: "teal",
  Revising: "yellow",
  Retired: "gray",
};
