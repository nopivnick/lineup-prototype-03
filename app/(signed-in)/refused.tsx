import { Box, Group, List, Text } from "@mantine/core";

import type { Refusal } from "@/db/read/shape";

/**
 * **A refusal, rendered as the one value it is** (issues/14, issues/38,
 * issues/86).
 *
 * The refused thing and its explanation are one object, computed server-side and
 * shipped as data, so a rule and its explanation cannot drift — and where the
 * refusal's whole content is data elsewhere in the system, the dependency is
 * **listed beneath it** rather than summarised, which is clause 3 of the wording.
 *
 * **It moved up beside `named.tsx`, `stamp.ts`, `program-hue.ts` and
 * `verdicts.tsx` when the review page became the fourth screen to render one**,
 * for the reason those moved: two copies of a rendering the map spends three
 * clauses on is how one of them quietly stops listing its dependencies. Four
 * screens carried an identical private copy — the Catalog's menu, two rails, the
 * proposals list — and the fourth is the one that made the count worth the move.
 *
 * It is a Server Component, so a `"use client"` rail may import it and a Server
 * Component page may too: nothing here is interactive and there is no hook to
 * pull it across the boundary.
 */
export function Refused({ refusal }: { refusal: Refusal }) {
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

/**
 * ***Not yours*** and ***Not now***, labelled, **because both can be true at
 * once** (issues/28, issues/62).
 *
 * A field class ANDs a state predicate and a role predicate and the writer checks
 * them **separately**, so an `Approved` course read by another program's director
 * refuses its body on both counts — and stating one would hide the wall the
 * reader walks into next. That is why a field refusal is sometimes two sentences
 * where a transition refusal is always one, and why the label is here rather than
 * folded into the sentence: the two are different kinds of *no*, and only one of
 * them is about the reader.
 */
export function LabelledRefusal({ label, refusal }: { label: string; refusal: Refusal }) {
  return (
    <Group gap={6} align="flex-start" wrap="nowrap" mt={2}>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ whiteSpace: "nowrap" }}>
        {label}
      </Text>
      <Refused refusal={refusal} />
    </Group>
  );
}
