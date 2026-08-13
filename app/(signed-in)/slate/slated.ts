import type { TakenSection } from "@/db/read/offering";
import type { CreateOfferingInput, Meeting } from "@/db/write/create-offering";

/**
 * **What the slating form asks for, and what makes it well formed** (issues/43,
 * issues/89).
 *
 * A plain module and not a `"use client"` one, deliberately — `propose/proposed.ts`
 * and `review-where.ts`'s reason: the Server Action imports it too, and a client
 * module's exports reach the server as client **references**, which typechecks and
 * builds before it fails (issues/85). The two `import type`s are erased, so
 * nothing `server-only` reaches the browser through them.
 *
 * **It holds no rule.** The rules of slating are `createOffering`'s — who may,
 * that the course is not `Retired`, and that it has both an area and an area head
 * — and all three reach the screen as the writer's own `Refusal`, shipped by
 * `getSlateForm` on the course they are about. What is here is the form's
 * *validity*: the columns the schema requires and the shape `offering_meeting`'s
 * CHECK requires, checked once and read by both sides so that the disabled submit
 * and the action's own guard cannot come apart.
 */

/** One editable meeting row, in the shape a form holds one. */
export type DraftMeeting = {
  /**
   * **Declared, never inferred** (issues/10). It is chosen first and it decides
   * which of the fields below are asked for at all — which is the whole of what
   * the column exists to fix, arriving one step before the row is written.
   */
  kind: Meeting["kind"];
  /** 0–6, Sunday first, as `offering_meeting.day_of_week` counts. */
  dayOfWeek: number;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  room: string;
};

/**
 * A fresh row of that kind, with every other field blank.
 *
 * **The fields survive a change of kind**, which is why one draft carries all of
 * them rather than being a union like the writer's: a reader who fills in a
 * weekly slot, realises it is an intensive and switches would otherwise lose the
 * times they had already typed. What is *written* is the union — `meetingsOf`
 * below reads the kind and takes only what that kind carries, so nothing typed
 * under an abandoned kind can reach the row.
 */
export function newMeeting(kind: Meeting["kind"]): DraftMeeting {
  return { kind, dayOfWeek: 1, startDate: "", endDate: "", startTime: "", endTime: "", room: "" };
}

/** The post, in the shape a browser sends it. */
export type Slated = {
  courseId: string;
  termCode: string;
  sectionNumber: string;
  meetings: readonly DraftMeeting[];
  mode: string;
  enrollmentLimit: number | string;
  callNumber: string;
  sisClassNumber: number | string;
  url: string;
};

/**
 * The post as the writer takes it, or `null` where the form is not well formed
 * yet — **one function, so *well formed* is one answer.**
 *
 * **`programCode` is absent from what this returns**, and that is the point of
 * the whole form: the path derives it from the course inside the transaction
 * (issues/30), so there is nothing here for a picker to get wrong.
 *
 * **A blank optional field is an absence and not an empty string**, the same
 * reading `bodyOf` gives a blank description: every one of these columns is
 * nullable, and *not stated* and *stated as nothing* are different facts.
 */
export function slatedOf(slated: Slated): CreateOfferingInput | null {
  if (slateProblem(slated) !== null) return null;

  return {
    courseId: Number(slated.courseId),
    termCode: slated.termCode,
    sectionNumber: slated.sectionNumber.trim(),
    meetings: meetingsOf(slated.meetings),
    mode: absent(slated.mode),
    enrollmentLimit: absentNumber(slated.enrollmentLimit),
    callNumber: absent(slated.callNumber),
    sisClassNumber: absentNumber(slated.sisClassNumber),
    url: absent(slated.url),
  };
}

/**
 * The first thing standing between this post and a well-formed submit, in the
 * order the fields are asked — one sentence, because a list of four is a wall and
 * the reader fixes them one at a time anyway.
 *
 * These are **the form's own validity and not the department's rules**, which is
 * why they are sentences here and refusals everywhere else in the map: nothing
 * about a person or a state decides any of them, and what they state one step
 * early is `offering`'s own `NOT NULL`s, its `enrollment_limit > 0` CHECK and
 * `offering_meeting`'s shape CHECK.
 */
export function slateProblem(slated: Slated): string | null {
  // **A course id and not merely a non-empty string.** The picker only ever
  // yields one, but a Server Action is a public endpoint and `Number("")`,
  // `Number(" 1 ")` and `Number("abc")` are three different kinds of wrong to
  // hand a `WHERE` clause — the same reading `db/read/offering.ts` gives an
  // address in a URL, one layer in.
  if (!COURSE_ID.test(slated.courseId)) return "Pick a course.";
  if (slated.termCode.trim().length === 0) return "Pick a term.";
  if (slated.sectionNumber.trim().length === 0) return "A section needs a number.";

  for (const meeting of slated.meetings) {
    const problem = meetingProblem(meeting);
    if (problem) return problem;
  }

  if (!optionalPositiveInteger(slated.enrollmentLimit)) {
    return "An enrollment limit is a whole number greater than zero, or nothing at all.";
  }
  if (!optionalPositiveInteger(slated.sisClassNumber)) {
    return "An SIS class number is a whole number, or nothing at all.";
  }

  return null;
}

/**
 * **The one thing the form checks against the world rather than against the
 * post** — and the one the Server Action therefore does not call (issues/43).
 *
 * `UNIQUE (course_id, term_code, section_number)` is the rule and the database
 * holds it. This states it one step early, from the section numbers
 * `getSlateForm` loaded, in exactly the standing `bodyProblem` gives
 * `course_proposal`'s `credits > 0` CHECK: a form may say what a constraint will
 * say, and the constraint is what actually refuses.
 *
 * It is **not** a refusal and there is no sentence of it in `db/write/rules.ts`,
 * because `createOffering` states no rule about section numbers — two sections of
 * one course in one term are real (issues/30) and the number is only what tells
 * them apart. What the form does with it is **default past it and stay editable**,
 * which is issues/43's *the form loads what is taken and defaults past it without
 * deciding*.
 */
export function sectionCollision(
  slated: Slated,
  taken: readonly TakenSection[],
  termLabel: string,
): string | null {
  const number = slated.sectionNumber.trim();
  return takenIn(taken, slated.courseId, slated.termCode).includes(number)
    ? `Section ${number} already exists in ${termLabel}.`
    : null;
}

/** The section numbers already used by this course in this term, in the order they were read. */
export function takenIn(
  taken: readonly TakenSection[],
  courseId: string,
  termCode: string,
): readonly string[] {
  return taken
    .filter((row) => row.courseId === courseId && row.termCode === termCode)
    .map((row) => row.sectionNumber);
}

/**
 * **The next free number, counting from 1** — a default and not a decision.
 *
 * It counts past what is taken rather than adding one to the highest, so a course
 * whose §2 was killed and whose §1 and §3 remain defaults to §2 rather than to
 * §4. Nothing in the schema says a number is spent forever, and the field stays
 * editable either way.
 */
export function nextSectionNumber(
  taken: readonly TakenSection[],
  courseId: string,
  termCode: string,
): string {
  const used = takenIn(taken, courseId, termCode);
  let candidate = 1;
  while (used.includes(String(candidate))) candidate += 1;
  return String(candidate);
}

// ---------------------------------------------------------------------------
// The pieces
// ---------------------------------------------------------------------------

/**
 * The drafts as the writer's discriminated union — **read off the declared kind**,
 * taking only the fields that kind carries (issues/10). An `async` slot is a
 * positive statement of *no time and no room*, so it drops everything, and
 * `offering_meeting`'s shape CHECK re-asserts the whole of this at the row.
 */
function meetingsOf(drafts: readonly DraftMeeting[]): readonly Meeting[] {
  return drafts.map((draft): Meeting => {
    switch (draft.kind) {
      case "weekly":
        return {
          kind: "weekly",
          dayOfWeek: draft.dayOfWeek,
          startTime: draft.startTime,
          endTime: draft.endTime,
          room: absent(draft.room),
        };
      case "dates":
        return {
          kind: "dates",
          startDate: draft.startDate,
          endDate: draft.endDate,
          startTime: draft.startTime,
          endTime: draft.endTime,
          room: absent(draft.room),
        };
      case "async":
        return { kind: "async" };
    }
  });
}

/**
 * What each kind requires, which is `offering_meeting`'s shape CHECK stated in
 * the reader's words. An `async` row requires nothing at all and can never be
 * incomplete — which is the difference between it and a row nobody has filled in,
 * and exactly the distinction issues/43 wanted meetings at slating to preserve.
 */
function meetingProblem(meeting: DraftMeeting): string | null {
  if (meeting.kind === "async") return null;

  if (meeting.kind === "dates" && (!meeting.startDate || !meeting.endDate)) {
    return "An intensive needs a first and a last day.";
  }
  if (meeting.kind === "dates" && meeting.endDate < meeting.startDate) {
    return "An intensive's last day cannot come before its first.";
  }
  if (!meeting.startTime || !meeting.endTime) {
    return "A meeting needs a start and an end time.";
  }
  if (meeting.endTime <= meeting.startTime) {
    return "A meeting has to end after it starts.";
  }
  return null;
}

/**
 * A course id as the picker yields one: digits, no sign, no space, no leading
 * zero. `db/read/course.ts` and `db/read/offering.ts` say the same of an address
 * in a URL, and for the same reason — one record has exactly one id.
 */
const COURSE_ID = /^(?:0|[1-9][0-9]*)$/;

/** Trimmed, or `null` where nothing was typed — the column being nullable in every case. */
function absent(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function absentNumber(value: number | string): number | null {
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? Number(trimmed) : null;
}

function optionalPositiveInteger(value: number | string): boolean {
  const trimmed = String(value).trim();
  if (trimmed.length === 0) return true;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0;
}
