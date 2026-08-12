"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  List,
  Menu,
  Modal,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { DataTable } from "mantine-datatable";

import type { LineupGroup, LineupRow, OfferingEventName } from "@/db/read/lineup";
import type { ForeignTag, Meeting, Refusal } from "@/db/read/shape";
import { rosterShape } from "@/lib/roster";

import { OpenCourse } from "../open-course";
import { fireOfferingEvent } from "./actions";

/**
 * **The Lineup's table** (issues/37, issues/82).
 *
 * It inherits three conventions from the Catalog (issues/81) and adds four things
 * that are this view's own.
 *
 * Inherited: **rows are grouped with `rowExpansion` and `trigger: 'always'`**,
 * because mantine-datatable has no row grouping at all — its `groups` groups
 * *columns*; the **`⋯ n` menu**, whose count is how many moves this actor can
 * actually make; and the **Actions column being absent rather than empty** for an
 * actor who can never act, which the server decided by giving the row a `null`
 * action set.
 *
 * This view's own:
 *
 *   * **Course-level facts on the group header and nothing else** — number, title,
 *     credits and the course's own tags, stated once. A section row carries only
 *     what differs from its siblings.
 *   * **The roster is read through `rosterShape`, never through `roster[0]`**
 *     (issues/61). Three shapes, and the third — rows sitting below a vacant
 *     position 0 — is what `decline` and `withdraw` leave behind and is said out
 *     loud rather than rendered as an ordinary staffed roster.
 *   * **The three meeting kinds read differently at a glance**, which is the first
 *     thing in the skeleton that makes LowRes visibly different from ITP and IMA.
 *   * **Foreign tags carry four signals** — the other program's name, its hue, a
 *     dashed edge and a `↳` — so the one cross-program fact in the model does not
 *     rest on colour alone.
 *
 * **No sorting.** The Catalog's columns sort and these do not (issues/37): under
 * grouping, sorting means re-ordering groups, and a course's sections are always in
 * section-number order. Sorting by instructor name is not built for a reason that
 * outlives this component — a course group has several sections and several
 * instructors, so there is nowhere to put it.
 *
 * It computes **no rule**. Every refusal it renders is a sentence the writer wrote.
 */
export function LineupTable({
  groups,
  termLabel,
  filtered,
}: {
  groups: readonly LineupGroup[];
  termLabel: string;
  filtered: boolean;
}) {
  // A refusal that arrives *after* the click: the world moved between the render and
  // the button. The menu's own refusals are stated in the menu.
  const [refused, setRefused] = useState<readonly Refusal[] | null>(null);
  // The one move that asks a question before it fires. See `EXPLAINED` below.
  const [asking, setAsking] = useState<Asking | null>(null);

  // The server decided this per row, and it is the same answer for every row on the
  // page: an actor who can never act can never act on any of them.
  const actionsExist = groups.some((group) => group.sections.some((row) => row.actions !== null));

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
        idAccessor="courseId"
        records={[...groups]}
        /**
         * **The two empty states, and there is no third** (issues/37). A term with
         * nothing slated in it and a view filtered to nothing are different facts
         * about why the screen is blank, and the reader can act on exactly one of
         * them. The third — a course whose every section is invisible — must not
         * exist: the read module returns no group for it, because an empty group
         * announces that the department is staffing something the reader may not see.
         */
        noRecordsText={
          filtered
            ? "Nothing matches those filters. Clear the search, or widen the program and state."
            : `Nothing is slated for ${termLabel} yet. Sections appear here as soon as a course is scheduled for the term.`
        }
        columns={[
          {
            accessor: "title",
            render: (group) => (
              <Group gap="sm" wrap="wrap">
                <Text ff="monospace" size="sm">
                  {group.courseNumber}
                </Text>
                <Text fw={600}>{group.title}</Text>
                <Text size="sm" c="dimmed">
                  {group.credits} cr
                </Text>
                {/*
                  The course's **own** tags, unlabelled and stated once. Unlabelled
                  because they carry no program name: a course's areas and
                  requirement categories are always its own program's (issues/30),
                  so the only program name anywhere on this screen is a
                  seat-sharing grant on a section below.
                */}
                <OwnTags tags={[...group.areas, ...group.requirementCategories]} />
                <Text size="sm" c="dimmed">
                  {group.sectionCount} {group.sectionCount === 1 ? "section" : "sections"}
                </Text>
                {/*
                  **The group header *is* a course**, so it carries the same `↗`
                  the Catalog row does and it is literally the same control
                  (issues/41, issues/83).
                */}
                <Box ml="auto">
                  <OpenCourse courseId={group.courseId} courseNumber={group.courseNumber} />
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
                idAccessor="offeringId"
                records={[...record.sections]}
                columns={[
                  {
                    accessor: "sectionNumber",
                    title: "Sec",
                    textAlign: "right",
                    noWrap: true,
                    render: (row) => (
                      <Text ff="monospace" size="sm">
                        {row.sectionNumber}
                      </Text>
                    ),
                  },
                  {
                    accessor: "status",
                    title: "State",
                    render: (row) => (
                      <Badge color={TONE[row.status]} variant="light">
                        {row.status}
                      </Badge>
                    ),
                  },
                  {
                    accessor: "roster",
                    title: "Instructors",
                    render: (row) => <Roster row={row} />,
                  },
                  {
                    accessor: "meetings",
                    title: "Meets",
                    render: (row) => <Meets meetings={row.meetings} mode={row.mode} />,
                  },
                  {
                    accessor: "enrollmentLimit",
                    title: "Cap",
                    textAlign: "right",
                    render: (row) =>
                      row.enrollmentLimit === null ? (
                        <Text size="sm" c="dimmed">
                          —
                        </Text>
                      ) : (
                        row.enrollmentLimit
                      ),
                  },
                  {
                    /**
                     * **"Also counts toward"** (issues/37, issues/82). The two tag
                     * sets sit one above the other — the course's own on the group
                     * header, the section's foreign ones here, directly beneath —
                     * because a seat-sharing grant attaches to the section that made
                     * it and never to the course.
                     */
                    accessor: "foreignTags",
                    title: "Also counts toward",
                    render: (row) => <ForeignTags tags={row.foreignTags} />,
                  },
                  ...(actionsExist
                    ? [
                        {
                          accessor: "actions",
                          title: "Actions",
                          textAlign: "right" as const,
                          render: (row: LineupRow) => (
                            <ActionMenu
                              row={row}
                              courseNumber={record.courseNumber}
                              onRefused={setRefused}
                              onAsk={setAsking}
                            />
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </Box>
          ),
        }}
      />

      <ReasonBox asking={asking} onClose={() => setAsking(null)} onRefused={setRefused} />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// The roster
// ---------------------------------------------------------------------------

/**
 * **Three shapes, and the third is the one issues/61 exists for.**
 *
 * `rosterShape` is a union rather than a nullable lead, so *rows below a vacant
 * position 0* cannot be rendered as *an ordinary staffed roster* by forgetting a
 * case: the compiler asks for all three. `Declined.retry` → `Slated` produces exactly
 * that shape, and issues/41 shipped a version that reported it as *needs an
 * instructor* — which is wrong in the one way that matters, because two people are
 * already seated and one of them may think they are leading it.
 */
function Roster({ row }: { row: LineupRow }) {
  const shape = rosterShape(row.roster);

  switch (shape.kind) {
    case "vacant":
      return (
        <Text size="sm" c="dimmed" fs="italic">
          Needs an instructor
        </Text>
      );

    case "led":
      return (
        <Stack gap={2}>
          <Group gap={6} wrap="nowrap">
            <Person entry={shape.lead} />
            {shape.others.length > 0 ? (
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                lead
              </Text>
            ) : null}
          </Group>
          {shape.others.map((entry) => (
            <Person key={entry.position} entry={entry} />
          ))}
        </Stack>
      );

    case "leaderless":
      return (
        <Stack gap={2}>
          {/*
            Said out loud, and said as the thing a coordinator can act on: the
            section cannot be offered to anybody until position 0 is filled, and the
            people below it are already on the roster.
          */}
          <Text size="sm" c="orange.8" fw={600}>
            No lead instructor
          </Text>
          {shape.others.map((entry) => (
            <Person key={entry.position} entry={entry} />
          ))}
        </Stack>
      );
  }
}

/**
 * **A roster entry is never dropped for want of a name** (issues/9), and the netid is
 * a real identifier at NYU rather than a placeholder — so the fallback is the netid in
 * monospace plus a quiet *no name on file*, deliberately **not** styled as an error.
 *
 * No pronouns: a list is not where a person is presented as a person (issues/40).
 */
function Person({ entry }: { entry: { netid: string; displayName: string | null } }) {
  if (entry.displayName) {
    return <Text size="sm">{entry.displayName}</Text>;
  }
  return (
    <Group gap={6} wrap="nowrap">
      <Text size="sm" ff="monospace">
        {entry.netid}
      </Text>
      <Text size="xs" c="dimmed" fs="italic">
        no name on file
      </Text>
    </Group>
  );
}

// ---------------------------------------------------------------------------
// The three meeting kinds
// ---------------------------------------------------------------------------

/**
 * **The three kinds read differently at a glance** (issues/10, issues/37), which is
 * the first thing in the skeleton that makes LowRes visibly different from ITP and
 * IMA.
 *
 * The kind is **declared** on the row and this switch reads it — it never infers the
 * kind from which columns happen to be filled, which is the legacy failure issues/10
 * declared the column to fix. Each kind gets a different *shape* of line rather than
 * a different colour of the same line:
 *
 *   * `weekly` — a weekday and a time range, the pattern a fortnightly reader scans
 *     for, with the room beneath.
 *   * `dates` — the word **Intensive** over a date range. *Intensive* is the reader's
 *     word and `dates` is the column's; a LowRes residency is not a weekly class
 *     with unusual dates, and reading the two as variants of one thing is what the
 *     `kind` column exists to stop.
 *   * `async` — one word, and **no time and no room**, both of which the shape CHECK
 *     enforces as absences rather than as blanks.
 */
function Meets({ meetings, mode }: { meetings: readonly Meeting[]; mode: string | null }) {
  return (
    <Stack gap={4}>
      {/*
        **No meetings is a legal state and not a fourth kind.** The create path
        writes meeting rows only when it is given some, so a section can be slated
        with none — and issues/43 wanted meetings at slating precisely so that *the
        asynchronous class* and *the unscheduled one* stay distinguishable, which
        means the unscheduled one has to say so.

        `mode` is rendered **either way**. It is a column on `offering` and not on
        the meeting, so an unscheduled section can perfectly well already be known
        to be online; dropping it here would have hidden a fact the row carries.
      */}
      {meetings.length === 0 ? (
        <Text size="sm" c="dimmed" fs="italic">
          Not scheduled
        </Text>
      ) : (
        meetings.map((meeting, index) => <Slot key={index} meeting={meeting} />)
      )}
      {mode ? (
        <Text size="xs" c="dimmed">
          {mode}
        </Text>
      ) : null}
    </Stack>
  );
}

function Slot({ meeting }: { meeting: Meeting }) {
  switch (meeting.kind) {
    case "weekly":
      return (
        <Box>
          <Text size="sm" ff="monospace">
            {DAYS[meeting.dayOfWeek] ?? "?"} {meeting.startTime}–{meeting.endTime}
          </Text>
          {meeting.room ? (
            <Text size="xs" c="dimmed">
              {meeting.room}
            </Text>
          ) : null}
        </Box>
      );

    case "dates":
      return (
        <Box>
          <Text size="xs" c="grape.7" tt="uppercase" fw={700}>
            Intensive
          </Text>
          <Text size="sm" ff="monospace">
            {day(meeting.startDate)} – {day(meeting.endDate)}, {meeting.startTime}–{meeting.endTime}
          </Text>
          {meeting.room ? (
            <Text size="xs" c="dimmed">
              {meeting.room}
            </Text>
          ) : null}
        </Box>
      );

    case "async":
      return (
        <Text size="sm" fs="italic" c="teal.8">
          Asynchronous
        </Text>
      );
  }
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * *5 Jan*, formatted in **UTC** on purpose: `offering_meeting.start_date` is a bare
 * `date` and parsing one as an instant puts it at midnight UTC, which a westward
 * local zone would render as the day before.
 */
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function day(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : DAY_MONTH.format(parsed);
}

// ---------------------------------------------------------------------------
// The two tag sets
// ---------------------------------------------------------------------------

/**
 * The course's own areas and requirement categories, as one row of chips.
 *
 * **Keyed by position and not by name.** `area` and `requirement_category` are two
 * tables, each unique within a program and neither constrained against the other, so
 * one program can hold an area and a category that share a name — and a course tagged
 * with both would give two chips one key, of which React would render one. Position is
 * the honest key here: the list is server-ordered, never reordered, never edited in
 * place, and holds no component state.
 */
function OwnTags({ tags }: { tags: readonly { name: string }[] }) {
  if (tags.length === 0) return null;
  return (
    <Group gap={4}>
      {tags.map((tag, index) => (
        <Badge key={index} variant="default" size="sm">
          {tag.name}
        </Badge>
      ))}
    </Group>
  );
}

/**
 * **Four signals for one fact, so it does not rest on colour** (issues/37): the other
 * program's **name** in the label, its **hue**, a **dashed edge**, and a **`↳`**.
 *
 * Seat sharing is the only place in the whole model where a program other than the
 * course's own appears (issues/25, issues/30), so it is the one chip on this screen
 * that must not read as decoration. The tooltip carries `granted_by` and `granted_at`
 * — issues/40 found the chip had been rendering without them, hiding the sole
 * cross-program act in the system behind the one control designed to be read at a
 * glance.
 *
 * Keyed by position for the reason `OwnTags` is, and one step more exposed: the read
 * module `UNION ALL`s the two seat-sharing tables, so `programCode` and `name`
 * together do not identify a row even in principle.
 */
function ForeignTags({ tags }: { tags: readonly ForeignTag[] }) {
  if (tags.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        —
      </Text>
    );
  }

  return (
    <Group gap={4}>
      {tags.map((tag, index) => (
        <Tooltip
          key={index}
          withArrow
          multiline
          w={260}
          label={`${tag.programCode} shares seats on this section. Granted by ${
            tag.grantedBy.displayName ?? tag.grantedBy.netid
          } on ${granted(tag.grantedAt)}.`}
        >
          <Badge
            color={HUE[tag.programCode] ?? "gray"}
            variant="outline"
            size="sm"
            style={{ borderStyle: "dashed" }}
            leftSection="↳"
          >
            {tag.programCode} · {tag.name}
          </Badge>
        </Tooltip>
      ))}
    </Group>
  );
}

/**
 * One hue per program. **Not read off the database**, because a program's colour is
 * not a fact the schema holds and inventing a column for it is a migration in
 * exchange for nothing; and not hashed from the code either, because three named
 * programs whose chips a reader learns are worth more than a rule that survives a
 * fourth. An unknown code falls back to grey, which still carries the other three
 * signals.
 */
const HUE: Readonly<Record<string, string>> = {
  ITP: "indigo",
  IMA: "grape",
  LOWRES: "teal",
};

const GRANTED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function granted(at: string): string {
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? at : GRANTED.format(parsed);
}

/**
 * Every Offering state, read as tone rather than as colour with a meaning: the
 * forward path, the waiting, and the ends. Typed as a total `Record` over the state
 * union, so a state added to the machine is a compiler error here rather than a row
 * that renders with no colour at all.
 */
const TONE: Readonly<Record<LineupRow["status"], string>> = {
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

// ---------------------------------------------------------------------------
// The ⋯ n menu
// ---------------------------------------------------------------------------

type Asking = { offeringId: string; event: OfferingEventName; where: string };

/**
 * **The `⋯ n` menu** (issues/37). One control per row; `n` is how many moves this
 * actor can actually make, so `⋯ 0` says *nothing to do here* without opening
 * anything.
 *
 * Opening it lists **every** move the machine offers from this state and the action
 * layer exposes — the permitted ones clickable, the refused ones greyed with their
 * reason stated beneath, and the reason's dependencies listed under it where the
 * refusal has any. A move the machine does not offer is not in the set at all, which
 * is why a `Concluded` section carries no menu rather than an empty one, and `staff`
 * appears nowhere: nothing user-facing may name it.
 */
function ActionMenu({
  row,
  courseNumber,
  onRefused,
  onAsk,
}: {
  row: LineupRow;
  courseNumber: string;
  onRefused: (refusals: readonly Refusal[] | null) => void;
  onAsk: (asking: Asking) => void;
}) {
  const [firing, startFiring] = useTransition();
  const actions = row.actions ?? [];

  if (actions.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        —
      </Text>
    );
  }

  const open = actions.filter((action) => action.permitted).length;
  const where = `${courseNumber} §${row.sectionNumber}`;

  const choose = (event: OfferingEventName) => {
    if (EXPLAINED.has(event)) {
      onAsk({ offeringId: row.offeringId, event, where });
      return;
    }
    startFiring(async () => {
      onRefused(null);
      const outcome = await fireOfferingEvent(row.offeringId, event);
      onRefused(outcome?.refusals ?? null);
    });
  };

  return (
    <Menu position="bottom-end" shadow="md" width={360} withinPortal>
      <Menu.Target>
        <Button variant="subtle" size="compact-sm" loading={firing} aria-label="Moves">
          ⋯ {open}
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>
          {where} — {open} of {actions.length} available to you
        </Menu.Label>
        {actions.map((action) =>
          action.permitted ? (
            <Menu.Item key={action.event} onClick={() => choose(action.event)}>
              <Text size="sm">
                {action.event}
                {EXPLAINED.has(action.event) ? "…" : ""}
              </Text>
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
 * **The two moves that ask why** (issues/10, issues/37).
 *
 * `reason` is free text and optional **on every event** — the schema says so and the
 * writer takes it from all of them — so which controls offer a box is a question about
 * the screen and not about the rules. These two are the acts that end something the
 * department had committed to running, and they are the two where the state pair in
 * the log cannot reconstruct *why*: `Accepted → Canceled` says a class was pulled and
 * nothing about whether enrolment collapsed or a room did.
 *
 * The box is optional, and skipping it writes `null` rather than an empty string: a
 * blank reason and no reason are different facts, and the log has room for both.
 */
const EXPLAINED: ReadonlySet<string> = new Set(["cancel", "kill"]);

function ReasonBox({
  asking,
  onClose,
  onRefused,
}: {
  asking: Asking | null;
  onClose: () => void;
  onRefused: (refusals: readonly Refusal[] | null) => void;
}) {
  const [reason, setReason] = useState("");
  const [firing, startFiring] = useTransition();

  const fire = () => {
    if (!asking) return;
    startFiring(async () => {
      onRefused(null);
      const outcome = await fireOfferingEvent(asking.offeringId, asking.event, reason);
      onRefused(outcome?.refusals ?? null);
      setReason("");
      onClose();
    });
  };

  return (
    <Modal
      opened={asking !== null}
      onClose={() => {
        setReason("");
        onClose();
      }}
      title={asking ? `${asking.event} ${asking.where}` : ""}
    >
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
          <Button
            variant="default"
            onClick={() => {
              setReason("");
              onClose();
            }}
          >
            Never mind
          </Button>
          <Button color="orange" loading={firing} onClick={fire}>
            {asking?.event ?? "Fire"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * A refusal, rendered as the one value it is (issues/14): the sentence, and — where
 * the refusal's whole content is data elsewhere in the system — the dependency listed
 * beneath it (issues/38).
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
