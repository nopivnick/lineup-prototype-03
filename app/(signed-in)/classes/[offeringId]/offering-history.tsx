import { Group, Stack, Text } from "@mantine/core";

import type { History, HistoryLine } from "@/db/read/shape";

import { Named } from "../../named";
import { HistoryRow } from "../../history-row";

/**
 * **History is a sentence per row, full width, at the foot of the main column**
 * (issues/41) — the Course page's treatment unchanged, and one thing it does not
 * have.
 *
 * **The sentence names the person the act was about, not whoever holds the seat
 * now** (issues/41 amending issues/15). This is the whole reason `offer` and
 * `accept` gained `subject_netid`: the roster is present-tense and the log is
 * not, so a lead who was swapped leaves an `offer` row attributable to nobody and
 * an `accept` row attributable to whoever holds position 0 today. A page that
 * read the roster to fill in those names would be inventing a **fact**, which is
 * the one thing a history sentence may not do — inventing wording the machine
 * never said is fine and is what every line below is.
 *
 * Six of this machine's events carry a subject and the rest carry none, and that
 * is a fact about the event rather than a gap in the log: `defer` has no subject
 * because the roster row survives it and position 0 is frozen from `Offered`
 * onward, so the roster still answers who was asked.
 *
 * **It opens with a derived creation line, marked by a hollow dot and nothing
 * else** (issues/13, issues/41). There is no genesis row — `from_state` is
 * `NOT NULL`, because creation is an act but not a transition — so a history
 * showing only log rows would begin mid-story.
 *
 * **A record with no history is one of issues/41's states and says so.** A class
 * slated this morning and not yet staffed has a creation line and nothing under
 * it, which is not an error and not an empty table.
 */
export function OfferingHistory({ history }: { history: History }) {
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
        <HistoryRow
          derived
          said={
            <Text size="sm">
              <Named who={history.creation.by} /> slated it
            </Text>
          }
          at={history.creation.at}
        />

        {history.moves.map((move, index) => (
          <HistoryRow
            key={index}
            said={
              <Text size="sm">
                <Named who={move.actor} bold /> {said(move)}
                {move.subject ? (
                  <>
                    {" "}
                    <Named who={move.subject} bold />
                  </>
                ) : null}
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

/**
 * **The wording, and it is the screen's rather than the machine's** (issues/41).
 *
 * Each clause is written to end where its subject begins, because six of these
 * events carry one and the sentence has to read either way: *"Cass Oyelaran
 * offered it to Theo Vance"* and *"Cass Oyelaran scheduled it"* are the same
 * template with the second half absent. `staff` and `unstaff` are in the map and
 * never rendered from a control — nothing user-facing may name them (issues/15)
 * — but the **log holds their rows**, and a history that skipped them would drop
 * the only record of who a class was staffed with before it was offered.
 *
 * An event with no sentence falls back to its own name, which is honest rather
 * than tidy: a fifteenth event added to the machine reads as `develop` in the
 * middle of a paragraph, which is a missing line of copy and looks like one.
 */
const SAID: Readonly<Record<string, string>> = {
  staff: "named the lead instructor,",
  unstaff: "took the class back from",
  offer: "offered it to",
  accept: "recorded the acceptance of",
  decline: "recorded the refusal of",
  defer: "recorded that the lead asked for time",
  withdraw: "withdrew the offer from",
  cancel: "cancelled it",
  schedule: "scheduled it",
  publish: "published it",
  list: "listed it",
  run: "started teaching it",
  evaluate: "sent it for evaluation",
  conclude: "concluded it",
  retry: "put it back in play",
  kill: "killed it",
};

function said(move: HistoryLine): string {
  return SAID[move.event] ?? move.event;
}
