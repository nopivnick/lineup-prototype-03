"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  NumberInput,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";

import type { ProgramChoice } from "@/db/read/proposals";
import type { Refusal } from "@/db/read/shape";

import { hueOf } from "../program-hue";
import { Refused } from "../refused";
import { proposeCourse } from "./actions";

/**
 * **The form, and the interesting part of it is the program section**
 * (issues/10, issues/43, issues/88).
 *
 * There is no requested-programs table: a `course_proposal_review` row **is** the
 * request. So *which programs* is not a field beside the form — it is the rows
 * the form mints, and variant A says so in **three places**, all of which are
 * here: in the section header, on each option, and in a live count that names the
 * number of rows the submit will write.
 *
 * **The empty set is refused, and the sentence under the count is the reason
 * rather than a validation message**: a proposal with no reviews is a record
 * nothing in the skeleton can reach again — the list groups proposals and its
 * rows are reviews, and issues/7 gave the proposal no state and no page of its
 * own. The rule itself is `createProposal`'s, which is why the disabled button
 * here and the writer's refusal say the same thing.
 *
 * **It computes no permission.** Whether this form exists at all was decided by
 * the page from the create act's own permission term, and a refused reader never
 * reaches this component.
 */
export function ProposeForm({ programs }: { programs: readonly ProgramChoice[] }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [credits, setCredits] = useState<number | string>("");
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [refused, setRefused] = useState<readonly Refusal[] | null>(null);
  const [submitting, startSubmitting] = useTransition();

  const problem = firstProblem({ title, credits, chosen });

  const submit = () => {
    if (problem) return;
    startSubmitting(async () => {
      setRefused(null);
      // On success this never returns: the action redirects to the proposals
      // list, at the group it just wrote (issues/43).
      const outcome = await proposeCourse({ title, description, credits, programs: chosen });
      setRefused(outcome?.refusals ?? null);
    });
  };

  return (
    <Stack gap="lg">
      {refused ? (
        <Alert
          color="orange"
          title="That proposal was refused"
          withCloseButton
          onClose={() => setRefused(null)}
        >
          <Stack gap={4}>
            {refused.map((refusal) => (
              <Refused key={refusal.sentence} refusal={refusal} />
            ))}
          </Stack>
        </Alert>
      ) : null}

      <Section
        title="The course"
        sub="This is the body every program reads. It stays editable while a review is Developing."
      >
        <TextInput
          label="Title"
          placeholder="Physical Computing II"
          required
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        <Textarea
          label="Description"
          description="What the course is. It travels into the catalog of every program that approves it."
          autosize
          minRows={4}
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
        <NumberInput
          label="Credits"
          description="The course's, not a section's."
          required
          min={1}
          step={1}
          allowDecimal={false}
          // Narrow, because the answer is one or two digits — but not so narrow
          // that the line beneath the label wraps into a column three words wide.
          w={260}
          value={credits}
          onChange={setCredits}
        />
      </Section>

      {/*
        **The section header is the first of the three statements.** It says what
        the checkboxes are before the reader meets one: nothing stores a list of
        requested programs, so the boxes are the rows.
      */}
      <Section
        title="Programs"
        sub="Nothing anywhere records which programs were asked — the reviews are the request. Each box you check is one review this form writes."
      >
        <Checkbox.Group
          label="Request a review from"
          required
          value={[...chosen]}
          onChange={setChosen}
        >
          <Stack gap="xs" mt="xs">
            {programs.map((choice) => (
              <Checkbox
                key={choice.code}
                value={choice.code}
                label={
                  // **The second statement: on each option.** The program, what
                  // it is, and what checking it does — a review of its own, which
                  // it decides on its own. Two lines rather than one, so the
                  // sentence sits under the name on every option instead of
                  // wrapping wherever the name happens to end.
                  <Stack gap={2}>
                    <Group gap={8}>
                      <Badge color={hueOf(choice.code)} variant="light">
                        {choice.code}
                      </Badge>
                      <Text size="sm">{choice.name}</Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {choice.degreeLevel} — writes one review, which this program decides on its
                      own and may approve where another rejects.
                    </Text>
                  </Stack>
                }
              />
            ))}
          </Stack>
        </Checkbox.Group>

        {/*
          **The third statement: a live count**, which is the one that makes the
          fan-out arithmetic rather than prose. Where the set is empty it states
          the rule instead, in the writer's own terms.
        */}
        {chosen.length > 0 ? (
          <Text size="sm">
            Submitting writes <b>{chosen.length}</b> {chosen.length === 1 ? "review" : "reviews"} —{" "}
            {[...chosen].sort().join(", ")}.
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            No programs checked, so submitting would write no reviews. A proposal with none is a
            record nothing here can reach again, so at least one is required.
          </Text>
        )}
      </Section>

      <Group gap="md" align="center">
        <Button onClick={submit} disabled={problem !== null} loading={submitting}>
          Submit proposal
        </Button>
        <Button component="a" href="/proposals" variant="default">
          Cancel
        </Button>
        {/*
          A disabled control says what would make it live, rather than leaving the
          reader to work out which of four fields it is waiting on.
        */}
        {problem ? (
          <Text size="sm" c="dimmed">
            {problem}
          </Text>
        ) : null}
      </Group>

      <Absences />
    </Stack>
  );
}

/**
 * **What this form does not ask, stated rather than left as a gap** (issues/43).
 *
 * Every line is a fact about where the missing thing comes from instead, which is
 * the difference between an absence a reader can reason about and one they go
 * looking for a screen to fill.
 */
function Absences() {
  return (
    <Stack gap={4} maw={760}>
      <Text size="sm" c="dimmed">
        <b>No course number.</b> Each approving program mints its own course, in its own catalog,
        numbered at the approval.
      </Text>
      <Text size="sm" c="dimmed">
        <b>No area and no area head.</b> Each program&rsquo;s director assigns those on its own
        review, while it is being read.
      </Text>
      <Text size="sm" c="dimmed">
        <b>Nothing is approved by submitting.</b> Every review starts at Proposed, and the programs
        may answer differently.
      </Text>
      <Text size="sm" c="dimmed">
        <b>Nothing else is created anywhere.</b> No course — only an approval mints one — and no
        person, role, term, program, area or requirement category. Those are the department&rsquo;s
        reference data, and nothing in this skeleton makes them.
      </Text>
    </Stack>
  );
}

function Section({
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

/**
 * The first thing standing between this form and a submit, in the order the
 * fields are asked — one sentence, because a list of four is a wall and the
 * reader fixes them one at a time anyway.
 *
 * The program rule is the writer's and is stated in its own words above; the
 * other two are this form's own validity, and `asWritten` in `./actions` refuses
 * a post that carries them anyway.
 */
function firstProblem({
  title,
  credits,
  chosen,
}: {
  title: string;
  credits: number | string;
  chosen: readonly string[];
}): string | null {
  if (title.trim().length === 0) return "A proposal needs a title.";
  if (!(Number(credits) > 0)) return "A proposal needs a credit value greater than zero.";
  if (chosen.length === 0) return "Check at least one program to review it.";
  return null;
}
