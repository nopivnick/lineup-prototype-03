import { Group, Stack, Text } from "@mantine/core";

import type { History, HistoryLine } from "@/db/read/shape";

import { Named } from "../../named";
import { HistoryRow } from "../../history-row";

/**
 * **History is a sentence per row, full width, at the foot of the main column**
 * (issues/41), inherited from the Course page and differing in exactly one line.
 *
 * **The creation line names the proposer *and the program that was asked***:
 * *"DH Example proposed this and asked ITP to review it"*. On the other two record
 * pages the line reads *created it*, because a course and a class are one record
 * that came from somewhere; a review is **a request**, and issues/10 built the
 * request out of the row itself rather than out of a requested-programs table. So
 * the one screen where that absence would be felt is the one screen that states
 * it, and it states it out of two columns this row really holds — `created_by`
 * and `program_code`.
 *
 * **It is never absent here**, which is the tier rather than a choice:
 * `course_proposal_review_transition` rows are Tier 3's own subject and Tier 3's
 * may-read is what admitted this reader, so unlike a Course or an Offering page
 * there is no reader with the record and without its log.
 *
 * **The reasons are the point.** issues/42 bought the read-only fidelity on the
 * argument that *the reason another program gave is the most useful thing on this
 * page to a director still deciding* — so the quotation marks below are not
 * decoration, they are what the whole widening was for.
 */
export function ReviewHistory({
  history,
  programCode,
}: {
  history: History;
  programCode: string;
}) {
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
              <Named who={history.creation.by} /> proposed this and asked {programCode} to review
              it
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
 * The review machine offers three moves and each gets a sentence. An event with
 * no sentence falls back to its own name, which is honest rather than tidy: a
 * fourth event added to the machine would read as `withdraw` in the middle of a
 * paragraph, which is a missing line of copy and looks like one.
 *
 * `approve` says **what it did**, because it is the one move in the system that
 * creates a record on another screen and the rail's link to that course is the
 * only other place the reader learns it.
 */
const SAID: Readonly<Record<string, string>> = {
  develop: "sent it back for development",
  approve: "approved it and minted a course",
  reject: "rejected it",
};

function said(move: HistoryLine): string {
  return SAID[move.event] ?? move.event;
}
