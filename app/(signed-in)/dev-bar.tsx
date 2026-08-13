"use client";

import { useTransition } from "react";
import { Box, Button, Group, Menu, Stack, Text } from "@mantine/core";

import type { DirectoryPerson } from "@/db/read/directory";
import type { Role } from "@/lib/permissions";
import type { Actor } from "@/lib/auth/actor";
import { beNobody, beSomebody } from "@/lib/auth/actions";

import { RoleChips } from "../role-chips";

/**
 * **The dev bar** (issues/11, issues/79) — who you are, and one click to be
 * somebody else.
 *
 * It carries **only a netid**, and that is load-bearing rather than tidy: a
 * serialized `{netid, roles}` payload would make the JSON an interface, and the
 * role set has changed three times. Its own props say the same thing — the actor
 * is an `Actor`, and the roles beside it arrive from a lookup keyed by that
 * netid, which is the shape that survives the SSO swap.
 *
 * It is also not a role switcher. issues/8 evaluates each `(role, relationship)`
 * conjunction independently and ORs them, so an active-role filter would narrow
 * that OR and the thing under test would stop being the rule the app runs.
 * Switching **user** keeps it.
 *
 * **The SSO swap deletes this component.** Nothing else in the app renders it,
 * and nothing it does is a thing a signed-in user needs.
 */
export function DevBar({
  actor,
  roles,
  people,
  nav,
}: {
  actor: Actor;
  roles: readonly Role[];
  people: readonly DirectoryPerson[];
  /**
   * **PROTOTYPE seam — remove with `nav-prototype.tsx`.** Variant A of the nav
   * prototype puts its tabs in this row rather than in a deck of their own, and
   * this is the one slot that lets it do so without a second header. Nothing
   * else passes it, and absent it this component renders exactly as before.
   */
  nav?: React.ReactNode;
}) {
  const [switching, startSwitching] = useTransition();
  const you = people.find((person) => person.netid === actor.netid);

  // One click, and the page you are reading re-renders as them: `beSomebody`
  // revalidates rather than redirecting, so the same record can be watched
  // offering different moves to different people.
  const become = (netid: string) => startSwitching(async () => void (await beSomebody(netid)));

  return (
    <Box component="header" px="md" py="xs" bd="0 0 1px 0 solid var(--mantine-color-default-border)">
      <Group>
        <Text fw={700}>Lineup.</Text>
        {nav}

        <Group gap="xs" ml="auto">
          <Text size="sm" c="dimmed">
            Signed in as
          </Text>
          <RoleChips roles={roles} />

          <Menu position="bottom-end" shadow="md" width={280}>
            <Menu.Target>
              <Button variant="default" size="compact-sm" loading={switching}>
                {you?.displayName ?? actor.netid}
              </Button>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Label>Be somebody — the seed&rsquo;s {people.length} people</Menu.Label>
              {people.map((person) => (
                <Menu.Item
                  key={person.netid}
                  disabled={person.netid === actor.netid}
                  onClick={() => become(person.netid)}
                >
                  <Stack gap={2}>
                    <Text size="sm">{person.displayName}</Text>
                    <RoleChips roles={person.roles} />
                  </Stack>
                </Menu.Item>
              ))}

              <Menu.Divider />
              <Menu.Item onClick={() => startSwitching(async () => void (await beNobody()))}>
                <Text size="sm">Stop being somebody</Text>
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </Box>
  );
}
