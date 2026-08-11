import { Badge, Group, Text } from "@mantine/core";

import type { Role } from "@/lib/permissions";

/**
 * A person's roles, as the dev bar and the picker both label them (issues/79).
 *
 * **Labels, not an actor's role set.** They are one of the two anonymous reads
 * `READ_TIERS` allows for this machinery, and the SSO swap deletes both. Nothing
 * downstream reads a chip: a permission check re-reads `user_role` inside its own
 * locking transaction.
 *
 * issues/11 refuses role-narrowing, so all of a person's roles show at once and
 * none of them is selectable. *See it as instructor-only* is a fixture concern —
 * be a person who holds only `instructor`.
 */
export function RoleChips({ roles }: { roles: readonly Role[] }) {
  if (roles.length === 0) {
    return (
      <Text size="xs" c="dimmed">
        no roles
      </Text>
    );
  }

  return (
    <Group gap={4}>
      {roles.map((role) => (
        <Badge key={role} size="xs" variant="light" color={role === "chair" ? "grape" : "gray"}>
          {role.replace("_", " ")}
        </Badge>
      ))}
    </Group>
  );
}
