"use client";

import { useState, useTransition } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";

import type { SlateCourseChoice, TakenSection, TermChoice } from "@/db/read/offering";
import type { Refusal } from "@/db/read/shape";

import { FormSection } from "../form-section";
import { hueOf } from "../program-hue";
import { Refused } from "../refused";
import { slateClass } from "./actions";
import {
  nextSectionNumber,
  newMeeting,
  sectionCollision,
  slateProblem,
  takenIn,
  type DraftMeeting,
  type Slated,
} from "./slated";

/**
 * **The form, and the interesting parts of it are the course picker and the
 * meeting rows** (issues/10, issues/32, issues/43, issues/89).
 *
 * **The gate both pre-empts and explains.** The picker keeps every course this
 * actor may slate, sorted into *Can be offered*, *Not yet — assignments missing*
 * and *Retired*, with the refused ones unselectable and carrying the writer's own
 * sentence on the line. Hiding them was rejected **structurally** rather than by
 * preference: a course reached from its own page has no list to be omitted from,
 * so the refusal has to exist on this page regardless — and a form that could
 * state it in one place and not the other would have two answers to one question.
 * Area and head are separate assignments (issues/32), so a course missing only one
 * of them says which.
 *
 * **Meetings are asked here and not deferred**, which is the whole reason
 * `offering_meeting` has a declared `kind`: a form that left them for the class
 * page would make the LowRes intensive, the asynchronous course and the merely
 * unscheduled one one and the same thing at the moment of creation.
 *
 * **The program is never asked for**, and the form says so where the course is
 * chosen rather than leaving a gap: an offering's program is always its course's
 * (issues/30), and a picker whose entire domain is one value exists only to be got
 * wrong.
 *
 * **It computes no permission.** Whether this form exists at all was decided by
 * the page from the create act's own term, and which courses are on the picker was
 * decided by the same function that greys the control the reader arrived by.
 */
export function SlateForm({
  courses,
  terms,
  taken,
  chosenCourseId,
}: {
  courses: readonly SlateCourseChoice[];
  terms: readonly TermChoice[];
  taken: readonly TakenSection[];
  chosenCourseId: string | null;
}) {
  const [courseId, setCourseId] = useState(chosenCourseId ?? "");
  const [termCode, setTermCode] = useState("");
  const [sectionNumber, setSectionNumber] = useState("");
  /**
   * **The number is a default and not a decision** (issues/43). Until the reader
   * types one it is derived from what is taken, so changing the course or the
   * term moves it — and the moment they type, it is theirs and nothing moves it
   * back.
   */
  const [sectionTouched, setSectionTouched] = useState(false);
  const [meetings, setMeetings] = useState<readonly DraftMeeting[]>([]);
  const [mode, setMode] = useState("");
  const [enrollmentLimit, setEnrollmentLimit] = useState<number | string>("");
  const [callNumber, setCallNumber] = useState("");
  const [sisClassNumber, setSisClassNumber] = useState<number | string>("");
  const [url, setUrl] = useState("");
  const [refused, setRefused] = useState<readonly Refusal[] | null>(null);
  const [submitting, startSubmitting] = useTransition();
  /**
   * **Nothing is wrong with a form nobody has filled in yet**, which is variant
   * A's `F.touched`: an empty form opening with *Pick a course* tells the reader
   * off for arriving.
   */
  const [touched, setTouched] = useState(false);

  const chosen = courses.find((choice) => choice.courseId === courseId) ?? null;
  const term = terms.find((option) => option.code === termCode) ?? null;
  const already = courseId && termCode ? takenIn(taken, courseId, termCode) : [];
  const suggested = courseId && termCode ? nextSectionNumber(taken, courseId, termCode) : "1";
  const section = sectionTouched ? sectionNumber : suggested;

  const slated: Slated = {
    courseId,
    termCode,
    sectionNumber: section,
    meetings,
    mode,
    enrollmentLimit,
    callNumber,
    sisClassNumber,
    url,
  };

  /**
   * **Three kinds of *no*, in the order a reader can act on them.** The form's own
   * validity first, because a course that has not been picked cannot be refused;
   * then the writer's refusal on the chosen course, which is its sentence and not
   * a paraphrase; then the section collision, which is the schema's constraint
   * stated one step early.
   */
  const problem =
    slateProblem(slated) ??
    chosen?.refusal?.sentence ??
    (term ? sectionCollision(slated, taken, term.label) : null);

  const change = <T,>(set: (value: T) => void) => (value: T) => {
    setTouched(true);
    set(value);
  };

  const submit = () => {
    if (problem) return;
    startSubmitting(async () => {
      setRefused(null);
      // On success this never returns: the action redirects to the new class's
      // own page, complete (issues/43).
      const outcome = await slateClass(slated);
      setRefused(outcome?.refusals ?? null);
    });
  };

  return (
    <Stack gap="lg">
      {refused ? (
        <Alert
          color="orange"
          title="That class was refused"
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

      {/*
        **The gate, stated in the open above the form it has shut** — the
        treatment issues/40 bought a page for. It is the same sentence the picker
        carries on the line, because it is the same object: a reader who arrived
        from this course's own page never saw a list, and this is what stands in
        for the line they never read.
      */}
      {chosen?.refusal ? (
        <Alert color="gray" title="No class can be scheduled from this course">
          <Refused refusal={chosen.refusal} />
        </Alert>
      ) : null}

      <FormSection title="Which class" sub="A course, a term, and the number that tells sibling sections apart.">
        <CoursePicker
          courses={courses}
          value={courseId}
          onChange={change((value: string) => {
            setCourseId(value);
            setRefused(null);
          })}
        />

        {/*
          **The one field that is stated rather than asked** (issues/30). It
          appears with the course because it *is* the course's, and it is a
          sentence rather than a disabled input: a greyed picker still says
          *there was a choice here*.
        */}
        {chosen ? (
          <Group gap={8}>
            <Badge color={hueOf(chosen.programCode)} variant="light">
              {chosen.programCode}
            </Badge>
            <Text size="sm" c="dimmed">
              The class&rsquo;s program is its course&rsquo;s, so it is derived rather than asked
              for.
            </Text>
          </Group>
        ) : null}

        <Select
          label="Term"
          placeholder="Choose a term"
          required
          data={terms.map((option) => ({ value: option.code, label: option.label }))}
          value={termCode || null}
          onChange={change((value: string | null) => setTermCode(value ?? ""))}
          w={260}
        />

        <TextInput
          label="Section"
          description={sectionNote({
            chosen: Boolean(courseId && termCode),
            already,
            suggested,
            // **The default is only described while it is still the default.**
            // Once the reader has typed a number, saying *this defaults to §3*
            // would be describing a field they are looking at the contents of.
            defaulted: !sectionTouched,
          })}
          required
          w={260}
          value={section}
          onChange={change((event: React.ChangeEvent<HTMLInputElement>) => {
            setSectionTouched(true);
            setSectionNumber(event.currentTarget.value);
          })}
        />
      </FormSection>

      <FormSection
        title="Meetings"
        sub="One row per slot, three kinds. Add none if it is not scheduled yet — an unscheduled class is a real thing, and a different one from an asynchronous class."
      >
        <Meetings meetings={meetings} onChange={change(setMeetings)} />
      </FormSection>

      <FormSection
        title="Details"
        sub="All of these are optional here and editable later, in any state, by a coordinator or the program's director."
      >
        <Group grow align="flex-start">
          <TextInput
            label="Mode"
            placeholder="In person"
            description="How it is taught. Kept beside the class rather than on a meeting, so an unscheduled class can already be known to be online."
            value={mode}
            onChange={change((event: React.ChangeEvent<HTMLInputElement>) => setMode(event.currentTarget.value))}
          />
          <NumberInput
            label="Enrollment limit"
            description="A published fact. Nothing enforces it — registration is elsewhere."
            min={1}
            step={1}
            allowDecimal={false}
            value={enrollmentLimit}
            onChange={change(setEnrollmentLimit)}
          />
        </Group>
        <Group grow align="flex-start">
          <TextInput
            label="Call number"
            value={callNumber}
            onChange={change((event: React.ChangeEvent<HTMLInputElement>) => setCallNumber(event.currentTarget.value))}
          />
          <NumberInput
            label="SIS class number"
            min={1}
            step={1}
            allowDecimal={false}
            value={sisClassNumber}
            onChange={change(setSisClassNumber)}
          />
        </Group>
        <TextInput
          label="URL"
          placeholder="https://"
          value={url}
          onChange={change((event: React.ChangeEvent<HTMLInputElement>) => setUrl(event.currentTarget.value))}
        />
      </FormSection>

      <Group gap="md" align="center">
        <Button onClick={submit} disabled={problem !== null} loading={submitting}>
          Slate the class
        </Button>
        {/*
          **Cancel goes back to where the reader came from**, which is a course's
          page — the form's only door. It follows the course *currently* picked
          rather than the one they arrived with, because changing the picker is a
          reader changing their mind about which course they are looking at, and
          landing them back on the first one would be the form remembering
          something they revised. With nothing picked there is no course to go
          back to and the Catalog is the honest answer.
        */}
        <Button
          component="a"
          href={chosen ? `/courses/${chosen.courseId}` : "/catalog"}
          variant="default"
        >
          Cancel
        </Button>
        {/*
          A disabled control says what would make it live, rather than leaving
          the reader to work out which of a dozen fields it is waiting on — but
          only once they have started, which is variant A's `F.touched`.
        */}
        {problem && touched ? (
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
 * **What is taken, and what this field did about it** (issues/43).
 *
 * Two sentences, because they are two facts and only one of them keeps changing:
 * what already exists in this course and this term, and — while the field is
 * still holding its default — what that made the number. A form that stated the
 * second after the reader had typed would be describing a field they can see the
 * contents of.
 */
function sectionNote({
  chosen,
  already,
  suggested,
  defaulted,
}: {
  chosen: boolean;
  already: readonly string[];
  suggested: string;
  defaulted: boolean;
}): string {
  if (!chosen) return "Pick a course and a term and this fills itself in with the next free number.";

  const world =
    already.length > 0
      ? `${already.map((number) => `§${number}`).join(", ")} already ${already.length === 1 ? "exists" : "exist"} in this term.`
      : "Nothing is slated for this course in this term yet.";

  return defaulted ? `${world} This defaults to §${suggested}, and it is yours to change.` : world;
}

/**
 * **The picker, and the gate is pre-empted in it** (issues/32, issues/43).
 *
 * Three groups, and the refused options are **disabled with their reason
 * underneath** rather than dropped. *Can be offered* and *Not yet — assignments
 * missing* are the two the gate produces; *Retired* is neither, because *not yet*
 * is a promise and retirement is the department deciding there will be no more
 * classes. Which group an option sits in is the read module's answer, computed by
 * the same function that greys the control on a course's own page.
 *
 * The reason is rendered **on the line** and not in a tooltip: a disabled option
 * nobody can hover is a dead end, and the refusal is the only thing that turns it
 * into an instruction.
 */
function CoursePicker({
  courses,
  value,
  onChange,
}: {
  courses: readonly SlateCourseChoice[];
  value: string;
  onChange: (value: string) => void;
}) {
  const byId = new Map(courses.map((choice) => [choice.courseId, choice]));

  const group = (label: string, kind: SlateCourseChoice["group"]) => {
    const items = courses.filter((choice) => choice.group === kind);
    return items.length === 0
      ? []
      : [
          {
            group: label,
            items: items.map((choice) => ({
              value: choice.courseId,
              label: `${choice.courseNumber} — ${choice.title}`,
              disabled: choice.refusal !== null,
            })),
          },
        ];
  };

  return (
    <Select
      label="Course"
      placeholder="Choose a course"
      required
      searchable
      description="Every course you may schedule a class from. The ones that cannot be scheduled are kept here, refused, rather than hidden."
      data={[
        ...group("Can be offered", "offerable"),
        ...group("Not yet — assignments missing", "assignments-missing"),
        ...group("Retired — no more classes", "retired"),
      ]}
      renderOption={({ option }) => {
        const choice = byId.get(option.value);
        return (
          <Box>
            <Text size="sm">{option.label}</Text>
            {choice?.refusal ? (
              <Text size="xs" c="dimmed">
                {choice.refusal.sentence}
              </Text>
            ) : null}
          </Box>
        );
      }}
      value={value || null}
      onChange={(chosen) => onChange(chosen ?? "")}
    />
  );
}

/**
 * **The meeting rows, and all three kinds can be expressed here** (issues/10,
 * issues/43).
 *
 * The **kind is chosen first** and decides what the row asks for, which is the
 * declared column arriving one step before the row is written — never a set of
 * fields from which a kind is later inferred, that being the legacy failure
 * issues/10 named.
 *
 * **No rows at all is a legal state and says so.** A class can be slated with no
 * meeting pattern, and the empty state states that rather than reading as a form
 * nobody has finished — because the whole point of asking meetings here is that
 * *unscheduled* and *asynchronous* have to be distinguishable at creation.
 */
function Meetings({
  meetings,
  onChange,
}: {
  meetings: readonly DraftMeeting[];
  onChange: (meetings: readonly DraftMeeting[]) => void;
}) {
  const replace = (index: number, next: Partial<DraftMeeting>) =>
    onChange(meetings.map((meeting, at) => (at === index ? { ...meeting, ...next } : meeting)));

  return (
    <Stack gap="sm">
      {meetings.length === 0 ? (
        <Text size="sm" c="dimmed">
          No meetings. A class with no meeting rows is legal — an unscheduled section is a real
          thing, and a different one from a section that is deliberately asynchronous.
        </Text>
      ) : null}

      {meetings.map((meeting, index) => (
        <Card key={index} withBorder padding="sm" bg="var(--mantine-color-body)">
          <Stack gap="sm">
            <Group justify="space-between" align="flex-start">
              <Select
                aria-label="Meeting kind"
                data={[
                  { value: "weekly", label: "Weekly" },
                  { value: "dates", label: "Date range" },
                  { value: "async", label: "Asynchronous" },
                ]}
                value={meeting.kind}
                onChange={(kind) =>
                  replace(index, { kind: (kind ?? "weekly") as DraftMeeting["kind"] })
                }
                w={200}
              />
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Remove this meeting"
                onClick={() => onChange(meetings.filter((_, at) => at !== index))}
              >
                ✕
              </ActionIcon>
            </Group>

            {meeting.kind === "async" ? (
              <Text size="sm" c="dimmed">
                No time and no room. That is a positive statement about the class, not a gap in
                this form.
              </Text>
            ) : (
              <>
                {meeting.kind === "weekly" ? (
                  <Select
                    label="Day"
                    data={DAYS.map((day, ordinal) => ({ value: String(ordinal), label: day }))}
                    value={String(meeting.dayOfWeek)}
                    onChange={(day) => replace(index, { dayOfWeek: Number(day ?? 1) })}
                    w={200}
                  />
                ) : (
                  <Group grow>
                    <TextInput
                      label="First day"
                      type="date"
                      value={meeting.startDate}
                      onChange={(event) => replace(index, { startDate: event.currentTarget.value })}
                    />
                    <TextInput
                      label="Last day"
                      type="date"
                      value={meeting.endDate}
                      onChange={(event) => replace(index, { endDate: event.currentTarget.value })}
                    />
                  </Group>
                )}
                <Group grow>
                  <TextInput
                    label="From"
                    type="time"
                    value={meeting.startTime}
                    onChange={(event) => replace(index, { startTime: event.currentTarget.value })}
                  />
                  <TextInput
                    label="To"
                    type="time"
                    value={meeting.endTime}
                    onChange={(event) => replace(index, { endTime: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Room"
                    placeholder="370J-447"
                    value={meeting.room}
                    onChange={(event) => replace(index, { room: event.currentTarget.value })}
                  />
                </Group>
              </>
            )}
          </Stack>
        </Card>
      ))}

      <Group gap="xs">
        <Button variant="default" size="xs" onClick={() => onChange([...meetings, newMeeting("weekly")])}>
          Add a weekly slot
        </Button>
        <Button variant="default" size="xs" onClick={() => onChange([...meetings, newMeeting("dates")])}>
          Add a date range
        </Button>
        <Button variant="default" size="xs" onClick={() => onChange([...meetings, newMeeting("async")])}>
          Add an asynchronous slot
        </Button>
      </Group>
    </Stack>
  );
}

/**
 * **What this form does not create, stated rather than left as a gap**
 * (issues/43), which is the propose form's `Absences` one act along.
 *
 * Every line is a fact about where the missing thing comes from instead, which is
 * the difference between an absence a reader can reason about and one they go
 * looking for a screen to fill.
 */
function Absences() {
  return (
    <Stack gap={4} maw={760}>
      <Text size="sm" c="dimmed">
        <b>No program to pick.</b> A class&rsquo;s program is always its course&rsquo;s, so it is
        derived from the course inside the same transaction that writes the class.
      </Text>
      <Text size="sm" c="dimmed">
        <b>No instructor.</b> Staffing is a separate act with its own permission, which is why this
        class starts <b>Slated</b> — decided to run, nobody picked to ask yet.
      </Text>
      <Text size="sm" c="dimmed">
        <b>No seat sharing.</b> Another program&rsquo;s claim on this section is written by that
        program&rsquo;s director, on the class, after it exists.
      </Text>
      <Text size="sm" c="dimmed">
        <b>Nothing else is created anywhere.</b> No course — only an approved review mints one — and
        no person, role, term, program, area or requirement category. Those are the
        department&rsquo;s reference data, and nothing in this skeleton makes them.
      </Text>
    </Stack>
  );
}


/**
 * Days in full, because a picker is not a list. The three screens that *render* a
 * weekly slot abbreviate — `Mon 18:30–21:00` — and a control being chosen from is
 * the one place the whole word is worth the width. The ordinals are
 * `offering_meeting.day_of_week`'s own, Sunday first.
 */
const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
