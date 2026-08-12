import { redirect } from "next/navigation";
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Container,
  Grid,
  GridCol,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import { getOfferingPage } from "@/db/read/offering";
import type { ForeignTag, Meeting } from "@/db/read/shape";
import { getActor } from "@/lib/auth/actor";

import { OfferingHistory } from "./offering-history";
import { OfferingRail } from "./offering-rail";
import { OfferingRoster } from "./offering-roster";

/**
 * **The Offering page — *a class*, in the department's words** (issues/41,
 * issues/84).
 *
 * It takes the Course page's conventions unchanged — the record on the left, a
 * sticky rail on the right, the history in sentences at the foot of the main
 * column — and it is where two of issues/41's decisions land for the first time.
 *
 * **The record itself may be refused, and the refusal names no state.** A list
 * row outside its tier is simply absent; a page has a URL and has to answer.
 * `NoClassHere` below is that answer.
 *
 * **The roster is the page's centre**, because a class is a thing somebody has
 * agreed to teach: it renders in position order, the lead is whoever holds
 * position 0, and both shapes with a vacant 0 say so in issues/15's own words.
 *
 * This page holds no database handle and writes no `WHERE` clause. It calls one
 * view-shaped read module and receives a finished page — the record, its roster
 * with every name already stitched in from the other project, what this actor may
 * do about it, the refusal for what they may not, and the history already
 * resolved to names *and to the people its acts were about*.
 */
export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/be-somebody");

  const { offeringId } = await params;
  const read = await getOfferingPage(offeringId, actor);

  if (!read.visible) return <NoClassHere />;

  const page = read.page;
  const where = `${page.course.courseNumber} §${page.sectionNumber}`;

  return (
    <Container size="xl" py="xl">
      <Group gap={6} mb="md">
        <Anchor href="/lineup" size="sm">
          Lineup
        </Anchor>
        <Text size="sm" c="dimmed">
          /
        </Text>
        <Anchor href={`/courses/${page.course.courseId}`} size="sm" ff="monospace">
          {page.course.courseNumber}
        </Anchor>
        <Text size="sm" c="dimmed">
          /
        </Text>
        <Text size="sm" ff="monospace">
          §{page.sectionNumber}
        </Text>
      </Group>

      <Grid gap="xl">
        <GridCol span={{ base: 12, md: 8 }}>
          <Stack gap="xl">
            <Stack gap={4}>
              <Text ff="monospace" c="dimmed">
                {where} · {page.termLabel}
              </Text>
              <Title order={1}>{page.course.title}</Title>
              <Group gap="sm" mt={4}>
                <Badge variant="light">{page.course.programCode}</Badge>
                <Text size="sm" c="dimmed">
                  {page.course.credits} credits
                </Text>
                {/*
                  **The link up to the course** (issues/41). The course's facts
                  are stated once, here, and the rest of them are one click away
                  — the same division the Lineup makes between its group header
                  and its section rows.
                */}
                <Anchor href={`/courses/${page.course.courseId}`} size="sm">
                  The course this is a section of
                </Anchor>
              </Group>
            </Stack>

            <Section title="Who is teaching it">
              <OfferingRoster roster={page.roster} />
            </Section>

            <Section title="When it meets">
              <Meetings meetings={page.meetings} mode={page.mode} />
            </Section>

            <Section title="How it is run">
              <Stack gap="sm">
                <Fact label="Cap">
                  {page.enrollmentLimit === null ? (
                    <Absent>Not set</Absent>
                  ) : (
                    <Text size="sm">{page.enrollmentLimit} students</Text>
                  )}
                </Fact>
                {/*
                  **The three columns a list has no room for** (issues/9,
                  issues/10). A call number and a SIS class number are what the
                  registrar's systems key this class by, and nobody scans a list
                  for them — which is exactly why they belong on the record.
                */}
                <Fact label="Call number">
                  {page.callNumber ? (
                    <Text size="sm" ff="monospace">
                      {page.callNumber}
                    </Text>
                  ) : (
                    <Absent>Not assigned</Absent>
                  )}
                </Fact>
                <Fact label="SIS class">
                  {page.sisClassNumber === null ? (
                    <Absent>Not assigned</Absent>
                  ) : (
                    <Text size="sm" ff="monospace">
                      {page.sisClassNumber}
                    </Text>
                  )}
                </Fact>
                <Fact label="Link">
                  {page.url ? (
                    <Anchor href={page.url} size="sm">
                      {page.url}
                    </Anchor>
                  ) : (
                    <Absent>None</Absent>
                  )}
                </Fact>
              </Stack>
            </Section>

            <Section title="Also counts toward">
              <ForeignTags tags={page.foreignTags} />
            </Section>

            {/*
              **Absent, not empty, for `student` and `advisor`** — Tier 2's
              boundary (issues/28, issues/41). Not a greyed section and not an
              explanation of why there is no section: *if you can do nothing, you
              may not see the record of who did*, and a sentence saying so would
              be the announcement the tier exists to avoid.
            */}
            {page.history ? <OfferingHistory history={page.history} /> : null}
          </Stack>
        </GridCol>

        <GridCol span={{ base: 12, md: 4 }}>
          <Box style={{ position: "sticky", top: "1rem" }}>
            <OfferingRail
              offeringId={page.offeringId}
              where={where}
              status={page.status}
              actions={page.actions}
              edit={page.edit}
              lastChanged={page.lastChanged}
              showLastChanged={page.history !== null}
            />
          </Box>
        </GridCol>
      </Grid>
    </Container>
  );
}

/**
 * **The record-level refusal, and it names no state** (issues/28, issues/41,
 * issues/84) — the settled rule under *Two rules whose only statement is a
 * rendering* in `docs/prototypes/README.md`.
 *
 * This is the page the rule was written for. `getOfferingPage` answers
 * `{ visible: false }` for three different worlds — an address that is not an id,
 * an id that names nothing, and a class this reader's tier does not reach — and
 * they are **one answer in one wording**, because the moment they differ the
 * difference *is* the leak.
 *
 * Saying `Declined` leaks exactly what hiding it is for. *"Not visible to you"*
 * was rejected for confirming that a section exists at that number, which is half
 * the same leak. A silent redirect was rejected on issues/9's rule that a
 * cosmetic fault must not masquerade as a broken link.
 *
 * **It also names no section and no course**, which is where the rendering
 * departs from the wording quoted in the prototypes package — recorded there as
 * an amendment. That sentence names a course number, a section and a term, and
 * every one of them is a fact this page can only have by reading the row it is
 * refusing: an address that names nothing yields none of them, so a page that
 * used them would answer *those two worlds differently* and hand a reader the
 * distinction the rule exists to withhold. What survives is the clause that was
 * always load-bearing — *that you can see* — carried by the whole sentence
 * instead of a trailing qualifier.
 */
function NoClassHere() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>Class</Title>
        <Alert color="gray" title="There is no class here">
          <Stack gap="xs">
            <Text size="sm">
              Nothing at this address is a class you can open. Try{" "}
              <Anchor href="/lineup">the Lineup</Anchor>, which lists the classes running in a
              term, or <Anchor href="/catalog">the Catalog</Anchor>, which lists every course the
              department can offer.
            </Text>
          </Stack>
        </Alert>
      </Stack>
    </Container>
  );
}

/**
 * **The three meeting kinds read differently at a glance** (issues/10,
 * issues/37), and the kind is **declared** on the row — this switch reads it and
 * never infers it from which columns happen to be filled, which is the legacy
 * failure issues/10 declared the column to fix.
 *
 * **No meetings is a legal state and not a fourth kind.** The create path writes
 * meeting rows only when it is given some, so a class can be slated with none —
 * and issues/43 wanted meetings at slating precisely so that *the asynchronous
 * class* and *the unscheduled one* stay distinguishable, which means the
 * unscheduled one has to say so.
 *
 * `mode` is rendered **either way**: it is a column on `offering` and not on the
 * meeting, so an unscheduled class can perfectly well already be known to be
 * online.
 */
function Meetings({ meetings, mode }: { meetings: readonly Meeting[]; mode: string | null }) {
  return (
    <Stack gap="xs">
      {meetings.length === 0 ? (
        <Absent>This class has no meeting pattern yet.</Absent>
      ) : (
        <Stack gap={6}>
          {meetings.map((meeting, index) => (
            <Slot key={index} meeting={meeting} />
          ))}
        </Stack>
      )}
      <Fact label="Mode">{mode ? <Text size="sm">{mode}</Text> : <Absent>Not stated</Absent>}</Fact>
    </Stack>
  );
}

function Slot({ meeting }: { meeting: Meeting }) {
  switch (meeting.kind) {
    case "weekly":
      return (
        <Group gap="sm" align="baseline">
          <Text size="sm" ff="monospace">
            {DAYS[meeting.dayOfWeek] ?? "?"} {meeting.startTime}–{meeting.endTime}
          </Text>
          {meeting.room ? (
            <Text size="sm" c="dimmed">
              {meeting.room}
            </Text>
          ) : null}
        </Group>
      );

    case "dates":
      return (
        <Group gap="sm" align="baseline">
          {/*
            *Intensive* is the reader's word and `dates` is the column's. A
            LowRes residency is not a weekly class with unusual dates, and
            reading the two as variants of one thing is what the `kind` column
            exists to stop.
          */}
          <Text size="xs" c="grape.7" tt="uppercase" fw={700}>
            Intensive
          </Text>
          <Text size="sm" ff="monospace">
            {day(meeting.startDate)} – {day(meeting.endDate)}, {meeting.startTime}–{meeting.endTime}
          </Text>
          {meeting.room ? (
            <Text size="sm" c="dimmed">
              {meeting.room}
            </Text>
          ) : null}
        </Group>
      );

    case "async":
      // No time and no room, both of which the shape CHECK enforces as absences
      // rather than as blanks.
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

/**
 * **Four signals for one fact, so it does not rest on colour** (issues/37): the
 * other program's **name** in the label, its **hue**, a **dashed edge** and a
 * **`↳`**. Seat sharing is the only place in the whole model where a program
 * other than the course's own appears (issues/25, issues/30), so it is the one
 * chip that must not read as decoration.
 *
 * **The grant is stated in the open here rather than in a tooltip**, which is the
 * Lineup's treatment and lost for the reason every reasons-in-the-open decision
 * on a detail page has: the tooltip was bought by row height in a grouped table
 * (issues/37), and a one-record page does not have that premise (issues/38).
 * issues/40 found the chip rendering with neither `granted_by` nor `granted_at`,
 * hiding the sole cross-program act in the system.
 *
 * Keyed by position: the read module `UNION ALL`s two tables, so `programCode`
 * and `name` together do not identify a row even in principle.
 */
function ForeignTags({ tags }: { tags: readonly ForeignTag[] }) {
  if (tags.length === 0) {
    return <Absent>No other program shares seats on this class.</Absent>;
  }

  return (
    <Stack gap="xs">
      {tags.map((tag, index) => (
        <Group key={index} gap="sm" align="baseline" wrap="wrap">
          <Badge
            color={HUE[tag.programCode] ?? "gray"}
            variant="outline"
            size="sm"
            style={{ borderStyle: "dashed" }}
            leftSection="↳"
          >
            {tag.programCode} · {tag.name}
          </Badge>
          <Text size="xs" c="dimmed">
            Granted by {tag.grantedBy.displayName ?? tag.grantedBy.netid} on{" "}
            {granted(tag.grantedAt)}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

/**
 * One hue per program. **Not read off the database**, because a program's colour
 * is not a fact the schema holds; and not hashed from the code either, because
 * three named programs whose chips a reader learns are worth more than a rule
 * that survives a fourth. An unknown code falls back to grey, which still carries
 * the other three signals.
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap="xs">
      <Text fw={600} size="lg">
        {title}
      </Text>
      {children}
    </Stack>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Group gap="md" align="flex-start" wrap="nowrap">
      <Text size="sm" c="dimmed" w={120} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Box>{children}</Box>
    </Group>
  );
}

/** An absence stated in words, never as a blank — the page's one treatment for all of them. */
function Absent({ children }: { children: React.ReactNode }) {
  return (
    <Text size="sm" c="dimmed" fs="italic">
      {children}
    </Text>
  );
}
