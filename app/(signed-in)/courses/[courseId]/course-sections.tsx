import {
  Badge,
  Box,
  Group,
  Paper,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTr,
  Text,
} from "@mantine/core";

import type { CourseSectionGroup } from "@/db/read/course";
import type { LineupRow } from "@/db/read/offering-rows";
import type { Meeting } from "@/db/read/shape";
import { rosterShape } from "@/lib/roster";

import { NamedLine } from "../../named";
import { OpenClass } from "../../open-class";

/**
 * **The course's sections, grouped by term, newest first** (issues/41).
 *
 * It reuses the Lineup's grouping device so the two views rhyme, and it is the
 * Lineup's **row** underneath: `db/read/offering-rows.ts` assembles both, so a
 * section cannot mean one thing on one screen and another here.
 *
 * **The page stays term-less.** The grouping displays the offerings' own key; it
 * is not a term selector, and there is no *current term* control anywhere on it —
 * issues/3 deferred term dates, so *current* is not computable and a control
 * offering it would be inventing a fact.
 *
 * **A course never offered is one of issues/41's seven states**, and it says so
 * rather than rendering an empty table. A `student` reaches it by a second route
 * — every section of the course being outside the tier — and the two are
 * deliberately the same screen: issues/28 requires *never offered* and *offered
 * and killed* to stay indistinguishable to a reader who may not see the
 * difference.
 */
export function CourseSections({
  groups,
  courseNumber,
}: {
  groups: readonly CourseSectionGroup[];
  /** Only ever the `↗`'s accessible name — *ITPG-GT 2233 §2* — and never rendered. */
  courseNumber: string;
}) {
  if (groups.length === 0) {
    return (
      <Paper withBorder p="md" radius="md">
        <Text fw={600}>This course has never been offered.</Text>
        <Text size="sm" c="dimmed">
          No section of it exists in any term.
        </Text>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      {groups.map((group) => (
        <Paper key={group.termCode} withBorder radius="md">
          <Group justify="space-between" px="md" py="xs">
            <Text fw={600}>{group.termLabel}</Text>
            <Text size="sm" c="dimmed">
              {group.offerings.length}{" "}
              {group.offerings.length === 1 ? "section" : "sections"}
            </Text>
          </Group>
          <Table withColumnBorders layout="fixed">
            {/*
              **One column grid for the page, not one per term.** Each term is
              its own `<Paper>` and its own `<table>`, so under the default
              `table-layout: auto` every term sizes its columns to its own
              sections and the two flexible columns land in a different place in
              every block. `layout="fixed"` plus this `colgroup` states the grid
              once and makes it binding — the same rule the grouped lists follow
              through `app/(signed-in)/aligned-columns.ts`. The two columns left
              without a width share what is left equally, which is a fact of the
              fixed layout and so is the same in every term.
            */}
            <colgroup>
              <col style={{ width: 64 }} />
              <col style={{ width: 120 }} />
              <col />
              <col />
              <col style={{ width: 40 }} />
            </colgroup>
            <TableTbody>
              {group.offerings.map((row) => (
                <TableTr key={row.offeringId}>
                  <TableTd align="right">
                    <Text ff="monospace" size="sm">
                      §{row.sectionNumber}
                    </Text>
                  </TableTd>
                  <TableTd>
                    <Badge color={TONE[row.status]} variant="light">
                      {row.status}
                    </Badge>
                  </TableTd>
                  <TableTd>
                    <Lead row={row} />
                  </TableTd>
                  <TableTd>
                    <Meets meetings={row.meetings} />
                  </TableTd>
                  {/*
                    **The `↗` issues/83 left for this ticket** (issues/41,
                    issues/84). The row already carried everything it needed and
                    what was missing was the page to point at, so what lands here
                    is a control rather than a change of shape. It is the one
                    control every reader gets: these rows are already narrowed to
                    the reader's tier, so none of them leads to a page that
                    refuses.
                  */}
                  <TableTd align="right">
                    <OpenClass
                      offeringId={row.offeringId}
                      where={`${courseNumber} §${row.sectionNumber}`}
                    />
                  </TableTd>
                </TableTr>
              ))}
            </TableTbody>
          </Table>
        </Paper>
      ))}
    </Stack>
  );
}

/**
 * **The lead is whoever holds position 0, read through `rosterShape`** — never
 * `roster[0]` (issues/61). The three shapes are a union rather than a nullable
 * lead, so *rows below a vacant position 0* cannot be rendered as an ordinary
 * staffed roster by forgetting a case: `Declined.retry` produces exactly that
 * shape, and it is the state that is **less** obvious rather than more.
 *
 * The list is the section's lead and nothing else. This table is a way **in** to
 * a class, not a second Lineup: the whole roster, the cap, the seat-sharing tags
 * and the class's own moves are the Offering page's, one click away, and stating
 * them twice is how two screens start disagreeing about what a section is.
 */
function Lead({ row }: { row: LineupRow }) {
  const shape = rosterShape(row.roster);

  switch (shape.kind) {
    case "vacant":
      return (
        <Text size="sm" c="dimmed" fs="italic">
          Needs an instructor
        </Text>
      );
    case "led":
      return <NamedLine who={shape.lead} />;
    case "leaderless":
      return (
        <Text size="sm" c="orange.8" fw={600}>
          No lead instructor
        </Text>
      );
  }
}

/**
 * The three meeting kinds, read as they are on the Lineup: the **kind is
 * declared** and this switch reads it, never inferring it from which columns
 * happen to be filled (issues/10).
 */
function Meets({ meetings }: { meetings: readonly Meeting[] }) {
  if (meetings.length === 0) {
    return (
      <Text size="sm" c="dimmed" fs="italic">
        Not scheduled
      </Text>
    );
  }

  return (
    <Stack gap={2}>
      {meetings.map((meeting, index) => (
        <Box key={index}>{slot(meeting)}</Box>
      ))}
    </Stack>
  );
}

function slot(meeting: Meeting) {
  switch (meeting.kind) {
    case "weekly":
      return (
        <Text size="sm" ff="monospace">
          {DAYS[meeting.dayOfWeek] ?? "?"} {meeting.startTime}–{meeting.endTime}
          {meeting.room ? ` · ${meeting.room}` : ""}
        </Text>
      );
    case "dates":
      return (
        <Text size="sm" ff="monospace">
          {day(meeting.startDate)} – {day(meeting.endDate)}, {meeting.startTime}–{meeting.endTime}
          {meeting.room ? ` · ${meeting.room}` : ""}
        </Text>
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
 * *5 Jan*, formatted in **UTC** on purpose: `offering_meeting.start_date` is a
 * bare `date` and parsing one as an instant puts it at midnight UTC, which a
 * westward local zone would render as the day before.
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

/** The Offering states as tone, typed total over the union so a new state is a compiler error. */
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
