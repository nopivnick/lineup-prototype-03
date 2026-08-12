import { Alert, Badge, Group, Paper, Stack, Table, TableTbody, TableTd, TableTr, Text } from "@mantine/core";

import type { OfferingRosterEntry } from "@/db/read/offering";
import { rosterShape } from "@/lib/roster";

import { Named } from "../../named";

/**
 * **The roster, in `position` order, read through `rosterShape`** — never through
 * `roster[0]` (issues/15, issues/41, issues/61).
 *
 * Three shapes, and they are a union rather than a nullable lead so that the one
 * that is **less** obvious rather than more cannot be rendered as an ordinary
 * staffed roster by forgetting a case:
 *
 *   * **vacant** — nobody is seated. `Slated` says the same thing as a state.
 *   * **led** — position 0 is occupied, and the rows below it are non-gating
 *     co-instructors.
 *   * **leaderless** — rows below a vacant position 0, which is what `decline`
 *     and `withdraw` *produce*: each `DELETE`s position 0 and leaves everything
 *     under it, so `Declined.retry` → `Slated` lands exactly here.
 *
 * **Both of the empty shapes state issues/15's rule rather than showing a blank
 * table**, and the leaderless one states it *above a populated table* — the fact
 * is still true and is now harder to see, which is the whole of why issues/61
 * made it a state of its own.
 *
 * **This is one of the two places a person is presented as a person**, so
 * pronouns show (issues/40); the other is the area head on a Course page. And a
 * netid the directory does not know is rendered with **no name and no error** —
 * `Named` carries that treatment, and the roster is where it matters most,
 * because issues/15 built a lifecycle *state* on position 0 being occupied.
 */
export function OfferingRoster({ roster }: { roster: readonly OfferingRosterEntry[] }) {
  const shape = rosterShape(roster);

  if (shape.kind === "vacant") {
    return (
      <Paper withBorder p="md" radius="md">
        <Text fw={600}>Position 0 is empty, so this class cannot be offered to anyone.</Text>
        <Text size="sm" c="dimmed">
          Nobody is on the roster at all.
        </Text>
      </Paper>
    );
  }

  const seated = shape.kind === "led" ? [shape.lead, ...shape.others] : shape.others;

  return (
    <Stack gap="sm">
      {shape.kind === "leaderless" ? (
        /*
          **The state issues/61 added** — said out loud, above the people who are
          already seated, and said as the thing a coordinator can act on. One of
          them may well think they are leading it.
        */
        <Alert color="orange" variant="light" title="No lead instructor">
          <Text size="sm">
            Position 0 is empty, so this class cannot be offered to anyone. The people below are
            already on the roster; naming a lead is a separate act.
          </Text>
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <Table>
          <TableTbody>
            {seated.map((entry) => (
              <TableTr key={entry.position}>
                <TableTd w={110}>
                  {/*
                    **The position is a fact and is shown as one** (issues/61).
                    Below 0 it is a bare key — no promotion, no reorder, gaps
                    legal — so the number is not a rank and the page does not
                    imply one.
                  */}
                  {entry.position === 0 ? (
                    <Badge variant="light">Lead</Badge>
                  ) : (
                    <Text size="sm" c="dimmed">
                      Position {entry.position}
                    </Text>
                  )}
                </TableTd>
                <TableTd>
                  <Group gap={0} wrap="nowrap">
                    <Named who={entry} pronouns />
                  </Group>
                </TableTd>
              </TableTr>
            ))}
          </TableTbody>
        </Table>
      </Paper>
    </Stack>
  );
}
