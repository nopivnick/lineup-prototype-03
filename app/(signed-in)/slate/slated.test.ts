/**
 * **The slating form's own validity** (issues/43, issues/89).
 *
 * It needs **no database**, like `db/machine-states.test.ts` and
 * `scripts/deployment-protection.test.ts`, and it runs in CI for the same reason:
 * what it reasons about is a pure function over a post, and the two sides that
 * read it — the disabled submit and the Server Action's own guard — coming apart
 * is precisely the failure issues/88 found in the propose form, where the client
 * asked `Number(credits) > 0` and the action asked for a safe integer.
 *
 * Nothing here is a departmental rule. Who may slate, the retired course and the
 * missing assignments are `createOffering`'s, and every one of them reaches the
 * screen as that writer's own `Refusal` — asserted against the writer in
 * `db/read/offering.test.ts`.
 */
import { describe, expect, test } from "vitest";

import type { TakenSection } from "@/db/read/offering";

import {
  nextSectionNumber,
  newMeeting,
  sectionCollision,
  slatedOf,
  slateProblem,
  takenIn,
  type Slated,
} from "./slated";

const WELL_FORMED: Slated = {
  courseId: "1",
  termCode: "20253",
  sectionNumber: "2",
  meetings: [],
  mode: "",
  enrollmentLimit: "",
  callNumber: "",
  sisClassNumber: "",
  url: "",
};

const TAKEN: readonly TakenSection[] = [
  { courseId: "1", termCode: "20253", sectionNumber: "1" },
  { courseId: "1", termCode: "20253", sectionNumber: "3" },
  { courseId: "1", termCode: "20261", sectionNumber: "1" },
  { courseId: "2", termCode: "20253", sectionNumber: "1" },
];

describe("the section number", () => {
  test("defaults past what is taken, counting from 1 and filling gaps", () => {
    // §1 and §3 exist, so the next free number is §2 rather than §4: nothing in
    // the schema says a killed section's number is spent forever.
    expect(nextSectionNumber(TAKEN, "1", "20253")).toBe("2");
    expect(nextSectionNumber(TAKEN, "1", "20261")).toBe("2");
    // Two sections of one course in one term are real, so the numbers are scoped
    // to the pair and nothing else.
    expect(nextSectionNumber(TAKEN, "2", "20261")).toBe("1");
    expect(nextSectionNumber(TAKEN, "3", "20253")).toBe("1");
  });

  test("is scoped to the course and the term together", () => {
    expect(takenIn(TAKEN, "1", "20253")).toEqual(["1", "3"]);
    expect(takenIn(TAKEN, "1", "20261")).toEqual(["1"]);
    expect(takenIn(TAKEN, "9", "20253")).toEqual([]);
  });

  test("stays editable, and a collision is stated rather than prevented", () => {
    // The default is free, so nothing is wrong with the form as it opens.
    expect(sectionCollision(WELL_FORMED, TAKEN, "Fall 2025")).toBe(null);

    expect(sectionCollision({ ...WELL_FORMED, sectionNumber: "3" }, TAKEN, "Fall 2025")).toBe(
      "Section 3 already exists in Fall 2025.",
    );
  });
});

describe("what makes a post well formed", () => {
  test("asks for the three columns the schema requires, in the order the form asks them", () => {
    expect(slateProblem({ ...WELL_FORMED, courseId: "" })).toBe("Pick a course.");
    expect(slateProblem({ ...WELL_FORMED, courseId: "", termCode: "" })).toBe("Pick a course.");
    expect(slateProblem({ ...WELL_FORMED, termCode: "" })).toBe("Pick a term.");
    expect(slateProblem({ ...WELL_FORMED, sectionNumber: "  " })).toBe(
      "A section needs a number.",
    );
    expect(slateProblem(WELL_FORMED)).toBe(null);
  });

  test("a class with no meeting rows is well formed, an unscheduled section being a real thing", () => {
    expect(slateProblem(WELL_FORMED)).toBe(null);
    expect(slatedOf(WELL_FORMED)?.meetings).toEqual([]);
  });

  test("an asynchronous slot can never be incomplete, which is the difference that matters", () => {
    // *No time and no room* is a positive statement (issues/10), so this row is
    // finished the moment it is added — and that is the whole reason meetings are
    // asked at slating: the asynchronous class and the unscheduled one have to be
    // distinguishable at the moment of creation.
    const asynchronous = { ...WELL_FORMED, meetings: [newMeeting("async")] };
    expect(slateProblem(asynchronous)).toBe(null);
    expect(slatedOf(asynchronous)?.meetings).toEqual([{ kind: "async" }]);
  });

  test("a weekly slot needs its times and an intensive needs its days", () => {
    expect(slateProblem({ ...WELL_FORMED, meetings: [newMeeting("weekly")] })).toBe(
      "A meeting needs a start and an end time.",
    );
    expect(slateProblem({ ...WELL_FORMED, meetings: [newMeeting("dates")] })).toBe(
      "An intensive needs a first and a last day.",
    );
    expect(
      slateProblem({
        ...WELL_FORMED,
        meetings: [
          { ...newMeeting("weekly"), startTime: "21:00", endTime: "18:30" },
        ],
      }),
    ).toBe("A meeting has to end after it starts.");
    expect(
      slateProblem({
        ...WELL_FORMED,
        meetings: [
          {
            ...newMeeting("dates"),
            startDate: "2026-01-16",
            endDate: "2026-01-05",
            startTime: "10:00",
            endTime: "16:00",
          },
        ],
      }),
    ).toBe("An intensive's last day cannot come before its first.");
  });

  test("the three kinds become the writer's union, and a kind takes only its own fields", () => {
    // The draft carries every field so that a reader switching kind does not lose
    // what they typed; what is **written** is read off the declared kind, so
    // nothing typed under an abandoned kind can reach the row (issues/10).
    const slated: Slated = {
      ...WELL_FORMED,
      meetings: [
        { ...newMeeting("weekly"), dayOfWeek: 1, startTime: "18:30", endTime: "21:00", room: "370J" },
        {
          ...newMeeting("dates"),
          startDate: "2026-01-05",
          endDate: "2026-01-16",
          startTime: "10:00",
          endTime: "16:00",
          room: " ",
          dayOfWeek: 4,
        },
        { ...newMeeting("async"), startTime: "10:00", room: "370J" },
      ],
    };

    expect(slatedOf(slated)?.meetings).toEqual([
      { kind: "weekly", dayOfWeek: 1, startTime: "18:30", endTime: "21:00", room: "370J" },
      {
        kind: "dates",
        startDate: "2026-01-05",
        endDate: "2026-01-16",
        startTime: "10:00",
        endTime: "16:00",
        room: null,
      },
      { kind: "async" },
    ]);
  });

  test("a blank optional column is an absence and not an empty string", () => {
    expect(slatedOf(WELL_FORMED)).toEqual({
      courseId: 1,
      termCode: "20253",
      sectionNumber: "2",
      meetings: [],
      mode: null,
      enrollmentLimit: null,
      callNumber: null,
      sisClassNumber: null,
      url: null,
    });
  });

  test("the two numeric columns are whole and positive, or absent", () => {
    expect(slateProblem({ ...WELL_FORMED, enrollmentLimit: 0 })).toBe(
      "An enrollment limit is a whole number greater than zero, or nothing at all.",
    );
    expect(slateProblem({ ...WELL_FORMED, enrollmentLimit: 12.5 })).toBe(
      "An enrollment limit is a whole number greater than zero, or nothing at all.",
    );
    expect(slateProblem({ ...WELL_FORMED, sisClassNumber: "many" })).toBe(
      "An SIS class number is a whole number, or nothing at all.",
    );
    expect(slatedOf({ ...WELL_FORMED, enrollmentLimit: 18, sisClassNumber: 7781 })).toMatchObject({
      enrollmentLimit: 18,
      sisClassNumber: 7781,
    });
  });

  test("nothing is well formed enough to be written while a problem stands", () => {
    expect(slatedOf({ ...WELL_FORMED, courseId: "" })).toBe(null);
    expect(slatedOf({ ...WELL_FORMED, meetings: [newMeeting("weekly")] })).toBe(null);
  });
});
