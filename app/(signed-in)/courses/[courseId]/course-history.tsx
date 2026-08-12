import { Box, Group, Stack, Text } from "@mantine/core";

import type { History, HistoryLine } from "@/db/read/shape";

import { Named } from "../../named";
import { stamp } from "../../stamp";

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
              <Named who={history.creation.by} /> created it
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
                <Named who={move.actor} bold /> {said(move)}
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
