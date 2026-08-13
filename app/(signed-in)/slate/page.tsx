import { redirect } from "next/navigation";
import { Alert, Anchor, Container, Group, Stack, Text, Title } from "@mantine/core";

import { getSlateForm } from "@/db/read/offering";
import { getActor } from "@/lib/auth/actor";

import { Refused } from "../refused";
import { SlateForm } from "./slate-form";

/**
 * **Slate a class — the ninth screen, and the second that creates a record rather
 * than moving one** (issues/43, issues/89).
 *
 * **One full page, everything asked at once**, which is variant A and the shape
 * the propose form settled one ticket earlier. Course, term, section number,
 * **meeting rows** and the operational fields are one act: a form that deferred
 * the meetings would make the LowRes intensive, the asynchronous course and the
 * unscheduled one indistinguishable at the moment of creation, which is exactly
 * the legacy failure `offering_meeting.kind` exists to fix (issues/10).
 *
 * **The page is refused rather than emptied** for a reader who may slate no
 * course at all — issues/88's rule, arriving at the second create route. What it
 * states is the **writer's own sentence**, so the refusal a coordinator reads here
 * and the one `createOffering` would throw at a hand-written post are one object
 * (issues/14).
 *
 * **`?course=` is a prefill and never a permission.** The door is the Course
 * page's rail, which is already refused for a reader who may not slate that
 * course, so a `?course=` naming one is simply not on the picker and selects
 * nothing — issues/88's reading of `?new=`, one screen along: a query parameter
 * naming something the reader cannot reach says nothing rather than announcing
 * that it exists.
 *
 * This page holds no database handle and writes no `WHERE` clause. It calls one
 * read module, which is `db/read/offering.ts` and not a module of its own — the
 * create route adds none, as issues/62's three edit routes add none and issues/88's
 * `/propose` adds none.
 */
export default async function SlatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/be-somebody");

  const params = await searchParams;
  const form = await getSlateForm(actor, one(params.course));

  return (
    <Container size="md" py="xl">
      <Group gap={6} mb="md">
        <Anchor href="/catalog" size="sm">
          Catalog
        </Anchor>
        <Text size="sm" c="dimmed">
          /
        </Text>
        <Text size="sm">Slate a class</Text>
      </Group>

      <Stack gap="lg">
        <Stack gap={4} maw={720}>
          <Title order={1}>Slate a class</Title>
          <Text c="dimmed">
            A section of a course in a term. It starts <b>Slated</b> — decided to run, nobody picked
            to ask yet.
          </Text>
        </Stack>

        {form.maySlate ? (
          <SlateForm
            courses={form.courses}
            terms={form.terms}
            taken={form.taken}
            chosenCourseId={form.chosenCourseId}
          />
        ) : (
          <Alert color="gray" title="You cannot slate a class">
            <Stack gap="xs">
              <Refused refusal={form.refusal} />
              <Text size="sm">
                <Anchor href="/catalog">The Catalog</Anchor> holds every course the department can
                offer, and <Anchor href="/lineup">the Lineup</Anchor> holds the classes already
                scheduled.
              </Text>
            </Stack>
          </Alert>
        )}
      </Stack>
    </Container>
  );
}

/**
 * A query parameter is a public input and Next hands a repeated one back as an
 * array. The Lineup says the same thing in the same shape: the first value is the
 * one honoured, and honouring it is all this does — whether it names a course the
 * reader may slate is `getSlateForm`'s answer and not this page's.
 */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
