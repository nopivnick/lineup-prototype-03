import { Box, Group, Stack, Text } from "@mantine/core";

import type { History, HistoryLine } from "@/db/read/shape";
import type { StitchedName } from "@/db/read/stitch";

import { stamp } from "./stamp";

/**
 * **History is a sentence per row, full width, at the foot of the main column**
 * (issues/41).
 *
 * The sentences **invent wording the machine never said and that is accepted;
 * inventing a fact is not.** Every clause below is built from a column the log
 * actually holds — the event, the actor, the subject where the event carries one,
 * and issues/10's free-text `reason` in quotation marks, which is what makes the
 * log read like a real one rather than as a set of bare state changes. Nothing
 * here says *why* unless a human wrote a why.
 *
 * **It opens with a derived creation line, marked by a hollow dot and nothing
 * else** (issues/13, issues/41). There is no genesis row — `from_state` is
 * `NOT NULL`, because creation is an act but not a transition — so a history
 * showing only log rows would begin mid-story, at *"opened it for revision"*, and
 * send the reader elsewhere to learn where the course came from. The dot is what
 * says *not a move*; a caption explaining issues/13's reasoning is not something a
 * coordinator needs read to them.
 *
 * The line's arrival here is what let the rail drop to *last changed* alone, and
 * since issues/17 deleted the transition a field write used to fire, that stamp
 * is the only trace of the edits this log is forbidden to record.
 *
 * **A record with no history is one of issues/41's seven states and says so.** It
 * is not an error and not an empty table: creating is not a transition, so a
 * course nobody has revised or retired has a creation line and nothing under it.
 */
export function CourseHistory({ history }: { history: History }) {
  return (
    <Stack gap="xs">
      <Group gap="sm" align="baseline">
        <Text fw={600} size="lg">
          History
        </Text>
        <Text size="sm" c="dimmed">
          {history.moves.length === 0
            ? "no moves yet"
            : `${history.moves.length} ${history.moves.length === 1 ? "move" : "moves"}`}
        </Text>
      </Group>

      <Stack gap={0}>
        <Line
          dot={<Dot derived />}
          said={
            <Text size="sm">
              <Person who={history.creation.by} /> created it
            </Text>
          }
          at={history.creation.at}
        />

        {history.moves.map((move, index) => (
          <Line
            key={index}
            dot={<Dot />}
            said={
              <Text size="sm">
                <Person who={move.actor} bold /> {said(move)}
                {move.reason ? (
                  <Text span c="dimmed" fs="italic">
                    {" "}
                    — “{move.reason}”
                  </Text>
                ) : null}
              </Text>
            }
            at={move.at}
          />
        ))}
      </Stack>

      {history.moves.length === 0 ? (
        <Text size="sm" c="dimmed">
          Nothing has happened to this course since it was minted. Creating is not a transition, so
          the log has no row for it — the line above is read off the record itself.
        </Text>
      ) : null}
    </Stack>
  );
}

function Line({
  dot,
  said,
  at,
}: {
  dot: React.ReactNode;
  said: React.ReactNode;
  at: string;
}) {
  return (
    <Group gap="sm" align="flex-start" wrap="nowrap" py={6}>
      <Box pt={5}>{dot}</Box>
      <Box>
        {said}
        <Text size="xs" c="dimmed">
          {stamp(at)}
        </Text>
      </Box>
    </Group>
  );
}

/** Hollow for the derived creation line, filled for a move the log actually holds. */
function Dot({ derived = false }: { derived?: boolean }) {
  return (
    <Box
      w={9}
      h={9}
      style={{
        borderRadius: "50%",
        border: "1.5px solid var(--mantine-color-dimmed)",
        background: derived ? "transparent" : "var(--mantine-color-dimmed)",
      }}
    />
  );
}

/**
 * **A netid with no directory row lands here**, and it is one of issues/41's
 * seven states: the netid in monospace plus a quiet *no name on file*,
 * deliberately not styled as an error (issues/9, issues/37). A history line is
 * where it is most likely to be seen, because the log keeps a netid forever and
 * the NYU feed can stop knowing the person.
 *
 * **No pronouns.** A history line presents a person as the subject of a
 * timestamp rather than as a person (issues/40); the area head above is where
 * `StitchedPerson` belongs.
 */
function Person({ who, bold = false }: { who: StitchedName; bold?: boolean }) {
  if (who.displayName) {
    return (
      <Text span fw={bold ? 600 : undefined}>
        {who.displayName}
      </Text>
    );
  }
  return (
    <>
      <Text span ff="monospace" fw={bold ? 600 : undefined}>
        {who.netid}
      </Text>
      <Text span size="xs" c="dimmed" fs="italic">
        {" "}
        no name on file
      </Text>
    </>
  );
}

/**
 * **The wording, and it is the screen's rather than the machine's** (issues/41).
 *
 * The Course machine offers three moves and each gets a sentence. An event with
 * no sentence falls back to its own name, which is honest rather than tidy: a
 * fourth event added to the machine would read as `develop` in the middle of a
 * paragraph, which is a missing line of copy and looks like one.
 */
const SAID: Readonly<Record<string, string>> = {
  revise: "opened it for revision",
  approve: "approved the revision",
  retire: "retired it",
};

function said(move: HistoryLine): string {
  return SAID[move.event] ?? move.event;
}
