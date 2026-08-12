"use client";

import { useTransition } from "react";
import { Alert, Badge, Box, Button, Card, Group, List, Stack, Text, ThemeIcon } from "@mantine/core";

import type { RoleGrant, RoleHolder, RolesPage } from "@/db/read/roles";
import type { Refusal } from "@/db/read/shape";

import { appointToProgram, grantRole, revokeRole } from "./actions";
import { granted, LABEL, WHAT_IT_LETS_YOU_DO } from "./role-copy";

/**
 * **One person, and all seven roles, held or not** (issues/38).
 *
 * `advisor` and `student` are marked as gating no action rather than left off:
 * leaving them off would make the page quietly disagree with the role list and
 * leave `advisor` ungrantable when advising lands, and showing them unmarked
 * invites a grant made in the belief it does something. The marking is *gates no
 * action*, which is true, rather than *does nothing*, which stopped being true when
 * this page gave `advisor` its first permission anywhere in the map.
 *
 * **Every refusal is stated in the open**, under the control it explains, with its
 * dependencies listed beneath it — the shape issues/37 rejected **on row height in
 * a grouped table**, a premise a one-record page does not have. For a non-chair the
 * control is absent, and the refusal with it: the server said so by shipping a
 * `null` action, and this component computes no rule of its own.
 */
export function RoleRecord({
  holder,
  page,
  onRefused,
}: {
  holder: RoleHolder;
  page: RolesPage;
  onRefused: (refusals: readonly Refusal[] | null) => void;
}) {
  return (
    <Card withBorder padding="lg">
      <Stack gap="md">
        <Stack gap={2}>
          <Group gap="xs">
            <Text fw={700} size="lg">
              {holder.displayName ?? holder.netid}
            </Text>
            {holder.isActor ? (
              <Badge size="sm" variant="outline" color="gray">
                you
              </Badge>
            ) : null}
          </Group>
          <Text size="sm" c="dimmed">
            <Text span ff="monospace" size="sm">
              {holder.netid}
            </Text>
            {holder.pronouns ? ` · ${holder.pronouns}` : null}
            {holder.displayName ? null : " · no name on file"}
          </Text>
        </Stack>

        <Stack gap="xs">
          {holder.roles.map((grant) => (
            <RoleRow key={grant.role} grant={grant} holder={holder} page={page} onRefused={onRefused} />
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

function RoleRow({
  grant,
  holder,
  page,
  onRefused,
}: {
  grant: RoleGrant;
  holder: RoleHolder;
  page: RolesPage;
  onRefused: (refusals: readonly Refusal[] | null) => void;
}) {
  const [firing, startFiring] = useTransition();
  const blocked = grant.action?.permitted === false ? grant.action.refusal : null;

  // The program picker belongs to `program_director` and is the chair's control for
  // it; a reader who cannot write sees the programs only where the role is actually
  // held, because *directs no program* under an ungranted role is a fact about
  // nothing.
  const showPrograms = grant.role === "program_director" && (page.mayWrite || grant.held);

  return (
    <Box
      p="sm"
      style={{
        border: "1px solid var(--mantine-color-default-border)",
        borderRadius: "var(--mantine-radius-sm)",
        opacity: grant.held || !grant.gatesNoAction ? 1 : 0.75,
      }}
    >
      <Group align="flex-start" wrap="nowrap" gap="sm">
        <ThemeIcon
          size="sm"
          radius="xl"
          variant={grant.held ? "filled" : "default"}
          color={blocked ? "orange" : grant.held ? "teal" : "gray"}
        >
          <Text size="xs">{grant.held ? (blocked ? "🔒" : "✓") : "○"}</Text>
        </ThemeIcon>

        <Stack gap={4} style={{ flex: 1 }}>
          <Group gap="xs">
            <Text fw={600} size="sm">
              {LABEL[grant.role]}
            </Text>
            <Badge size="xs" variant="default">
              {grant.gatesNoAction ? "gates no action yet" : grant.kind}
            </Badge>
          </Group>

          <Text size="sm" c="dimmed">
            {WHAT_IT_LETS_YOU_DO[grant.role]}
          </Text>

          {showPrograms ? <Programs holder={holder} page={page} onRefused={onRefused} /> : null}

          {blocked ? (
            <Alert color="orange" p="xs" variant="light">
              <Refused refusal={blocked} />
            </Alert>
          ) : null}

          {grant.held && grant.grantedBy ? (
            <Text size="xs" c="dimmed">
              Granted by {grant.grantedBy.displayName ?? grant.grantedBy.netid}
              {grant.grantedAt ? ` · ${granted(grant.grantedAt)}` : null}
            </Text>
          ) : null}
        </Stack>

        {grant.action ? (
          <Button
            size="compact-sm"
            variant={grant.held ? "light" : "filled"}
            color={grant.held ? "red" : "blue"}
            disabled={!grant.action.permitted}
            loading={firing}
            onClick={() =>
              startFiring(async () => {
                onRefused(null);
                const outcome = grant.held
                  ? await revokeRole(holder.netid, grant.role)
                  : await grantRole(holder.netid, grant.role);
                onRefused(outcome?.refusals ?? null);
              })
            }
          >
            {grant.held ? (grant.action.permitted ? "Revoke" : "Cannot revoke") : "Grant"}
          </Button>
        ) : null}
      </Group>
    </Box>
  );
}

/**
 * **Appointing is one control on the person** (issues/38): the role row rides along
 * with the program, inserted only if absent, so the chair never sees a director who
 * directs nothing and is never asked whether this person is a newcomer.
 *
 * There is **no un-appoint control**, which `docs/fixtures/fixtures.ts` records as
 * the reason a program with no director is seedable and unreachable at runtime
 * (issues/49). A program a director already has is therefore shown as taken rather
 * than as a toggle — the one thing this build does not take from variant D, and the
 * prototypes ledger says why.
 */
function Programs({
  holder,
  page,
  onRefused,
}: {
  holder: RoleHolder;
  page: RolesPage;
  onRefused: (refusals: readonly Refusal[] | null) => void;
}) {
  const [firing, startFiring] = useTransition();
  const directs = page.programs.filter((program) =>
    program.directors.some((director) => director.netid === holder.netid),
  );

  if (!page.mayWrite) {
    return (
      <Group gap={4}>
        {directs.map((program) => (
          <Badge key={program.code} size="sm" variant="light">
            {program.code}
          </Badge>
        ))}
      </Group>
    );
  }

  return (
    <Group gap={4}>
      {page.programs.map((program) => {
        const already = directs.some((one) => one.code === program.code);
        return (
          <Button
            key={program.code}
            size="compact-xs"
            variant={already ? "light" : "default"}
            color={already ? "teal" : "gray"}
            disabled={already}
            loading={firing}
            onClick={() =>
              startFiring(async () => {
                onRefused(null);
                onRefused((await appointToProgram(holder.netid, program.code))?.refusals ?? null);
              })
            }
          >
            {already ? `✓ ${program.code}` : `+ ${program.code}`}
          </Button>
        );
      })}
    </Group>
  );
}

/**
 * A refusal, rendered as the one value it is (issues/14): the sentence, and — where
 * the refusal's whole content is data elsewhere in the system — the dependency
 * listed beneath it (issues/38). Three of the four refusals here have one, which is
 * the clause this page added to the wording.
 */
export function Refused({ refusal }: { refusal: Refusal }) {
  return (
    <Box>
      <Text size="xs">{refusal.sentence}</Text>
      {refusal.dependencies.length > 0 ? (
        <List size="xs" withPadding>
          {refusal.dependencies.map((dependency) => (
            <List.Item key={dependency}>{dependency}</List.Item>
          ))}
        </List>
      ) : null}
    </Box>
  );
}
