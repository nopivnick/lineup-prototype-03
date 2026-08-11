"use client";

import { useTransition } from "react";
import { Group, Stack, Text, UnstyledButton } from "@mantine/core";

import type { DirectoryPerson } from "@/db/read/directory";
import { beSomebody } from "@/lib/auth/actions";

import { RoleChips } from "../role-chips";

/**
 * The entry screen: thirteen people, one click each (issues/11, issues/79).
 *
 * There is no password and no fallback user. A fixture default was rejected for
 * making *nobody chose* indistinguishable from *someone chose the first person*,
 * and this screen is what stands in its place — the shape SSO replaces rather
 * than deletes.
 */
export function Picker({ people }: { people: readonly DirectoryPerson[] }) {
  const [choosing, startChoosing] = useTransition();

  return (
    <Stack gap={0}>
      {people.map((person) => (
        <UnstyledButton
          key={person.netid}
          disabled={choosing}
          onClick={() => startChoosing(async () => void (await beSomebody(person.netid)))}
          p="sm"
          bd="0 0 1px 0 solid var(--mantine-color-default-border)"
        >
          <Group justify="space-between" wrap="nowrap">
            <Stack gap={2}>
              <Text size="sm" fw={500}>
                {person.displayName}
              </Text>
              <Text size="xs" c="dimmed" ff="monospace">
                {person.netid}
              </Text>
            </Stack>
            <RoleChips roles={person.roles} />
          </Group>
        </UnstyledButton>
      ))}
    </Stack>
  );
}
