import { Box, Group, Text } from "@mantine/core";

import { stamp } from "./stamp";

/**
 * **The history's chrome, which is the same on all three record pages**
 * (issues/41, issues/86).
 *
 * A sentence per row, full width, at the foot of the main column, each marked by
 * a dot and stamped underneath. **The sentences are not here** and must not be:
 * issues/41 settled that a history line may invent wording the machine never said
 * and may never invent a **fact**, so each page keeps its own `SAID` map — a
 * course is revised, a class is offered to somebody, a review is sent back — and
 * the three read differently on purpose.
 *
 * It moved up beside `named.tsx`, `stamp.ts`, `program-hue.ts`, `verdicts.tsx`
 * and `refused.tsx` when the review page became the third page to render one. Two
 * identical copies were tolerable; three is where the shape stops being a
 * coincidence, and the hollow-versus-filled dot in particular is a **rule** —
 * issues/13 refused a genesis row, so the opening line is derived rather than
 * logged, and the dot is the only thing that says so.
 */
export function HistoryRow({
  said,
  at,
  derived = false,
}: {
  said: React.ReactNode;
  at: string;
  /** The derived creation line (issues/13, issues/41) — hollow dot, and nothing else. */
  derived?: boolean;
}) {
  return (
    <Group gap="sm" align="flex-start" wrap="nowrap" py={6}>
      <Box pt={5}>
        <Dot derived={derived} />
      </Box>
      <Box>
        {said}
        <Text size="xs" c="dimmed">
          {stamp(at)}
        </Text>
      </Box>
    </Group>
  );
}

/**
 * **Hollow for the derived creation line, filled for a move the log actually
 * holds** (issues/13, issues/41).
 *
 * The dot is what says *not a move*. A caption explaining why creation is an act
 * and not a transition is not something a coordinator needs read to them, and a
 * history that simply omitted the line would begin mid-story and send the reader
 * elsewhere to learn where the record came from.
 */
function Dot({ derived }: { derived: boolean }) {
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
