import { redirect } from "next/navigation";
import { Alert, Anchor, Container, Group, Stack, Text, Title } from "@mantine/core";

import { getProposeForm } from "@/db/read/proposals";
import { getActor } from "@/lib/auth/actor";

import { Refused } from "../refused";
import { ProposeForm } from "./propose-form";

/**
 * **Propose a course — the eighth screen, and the first that writes a record
 * rather than moving one** (issues/43, issues/88).
 *
 * **One full page, everything asked at once**, which is variant A and the first
 * outright win in four prototyped tickets. The three body fields and the program
 * set are one act: a wizard would ask the programs on a step of their own, and
 * the whole difficulty of this form is that *which programs* is not a fact beside
 * the body but the **rows the submit writes**.
 *
 * **The page is refused rather than emptied** for a reader with no create arm.
 * The control on the proposals list is already absent for them (issues/37's
 * *absent, never empty*), and this is the other half of that: a link nobody
 * rendered is not a check. What it states is the **writer's own sentence**, so
 * the refusal a coordinator reads here and the one `createProposal` would throw
 * at a hand-written post are one object (issues/14).
 *
 * This page holds no database handle and writes no `WHERE` clause. It calls one
 * read module, which is `db/read/proposals.ts` and not a module of its own — the
 * create route adds none, as issues/62's three edit routes add none.
 */
export default async function ProposePage() {
  const actor = await getActor();
  if (!actor) redirect("/be-somebody");

  const form = await getProposeForm(actor);

  return (
    <Container size="md" py="xl">
      <Group gap={6} mb="md">
        <Anchor href="/proposals" size="sm">
          Proposals
        </Anchor>
        <Text size="sm" c="dimmed">
          /
        </Text>
        <Text size="sm">Propose a course</Text>
      </Group>

      <Stack gap="lg">
        <Stack gap={4} maw={720}>
          <Title order={1}>Propose a course</Title>
          <Text c="dimmed">
            One body, reviewed separately by each program you ask. Each of them decides on its own,
            and they may disagree.
          </Text>
        </Stack>

        {form.mayPropose ? (
          <ProposeForm programs={form.programs} />
        ) : (
          <Alert color="gray" title="You cannot propose a course">
            <Stack gap="xs">
              <Refused refusal={form.refusal} />
              <Text size="sm">
                <Anchor href="/proposals">The proposals list</Anchor> holds every proposal that
                reaches you and every program&rsquo;s verdict on it.
              </Text>
            </Stack>
          </Alert>
        )}
      </Stack>
    </Container>
  );
}
