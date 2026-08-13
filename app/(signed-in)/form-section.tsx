import { Card, Stack, Text, Title } from "@mantine/core";

/**
 * **A titled section of a create form, with the sentence that says what it is
 * for** (issues/43, issues/88, issues/89).
 *
 * The seventh thing to move up beside `named.tsx`, `stamp.ts`, `program-hue.ts`,
 * `verdicts.tsx`, `refused.tsx` and `history-row.tsx`, and it moves for the reason
 * those moved: the two create forms are the same shape asked twice, and a card
 * that grew a different padding or a different heading level on one of them would
 * make them read as two conventions rather than one.
 *
 * **The sub-heading is not decoration and is required.** Both forms carry their
 * hardest argument in it — *the reviews are the request* on the propose form's
 * program section, *an unscheduled class is a real thing* on the slating form's
 * meetings — so a section without one is a section whose reason has gone missing,
 * and the type says so rather than defaulting it away.
 *
 * A Server Component, like `refused.tsx`: nothing here is interactive and there is
 * no hook to pull it across the boundary, so a `"use client"` form may import it
 * and so may a Server Component page.
 */
export function FormSection({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <Card withBorder padding="lg">
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={2} size="h4">
            {title}
          </Title>
          <Text size="sm" c="dimmed">
            {sub}
          </Text>
        </Stack>
        {children}
      </Stack>
    </Card>
  );
}
