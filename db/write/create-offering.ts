import "server-only";

import { eq } from "drizzle-orm";

import { course, courseArea, offering, offeringMeeting } from "@/db/classes/schema";
import { machine as offeringMachine } from "@/lib/machines/offering.machine";
import { MATRICES, NOBODY } from "@/lib/permissions";

import { initialSnapshot } from "./apply-transition";
import { refuse, WriteRefused } from "./refusal";
import { notYours, permitted, readActorFacts, type Subject } from "./rules";
import { moment, type Id, type Netid, type OpenTransaction } from "./transaction";

/**
 * One meeting slot, `kind`-discriminated exactly as `offering_meeting`'s shape
 * CHECK requires (issues/10). The three kinds are what make LowRes visibly
 * different from ITP and IMA, and the kind is **declared** rather than inferred
 * from which columns are filled — the legacy failure the CHECK exists to fix.
 */
export type Meeting =
  | { kind: "weekly"; dayOfWeek: number; startTime: string; endTime: string; room: string | null }
  | {
      kind: "dates";
      startDate: string;
      endDate: string;
      startTime: string;
      endTime: string;
      room: string | null;
    }
  | { kind: "async" };

/**
 * Everything the form asks for, and nothing derived (issues/43).
 *
 * **`programCode` never appears here.** The path derives it from the course
 * inside the transaction (issues/30) — a parameter whose entire domain is one
 * value is a program picker that must track the chosen course, and fails as a
 * constraint violation rather than as a validation. Stated as: **nothing outside
 * this path ever writes `offering.program_code`.**
 *
 * `sectionNumber` is asked, pre-filled with the next free number and editable:
 * two sections of one course in one term are real, and the number is what tells
 * them apart. **Meetings are part of slating**, so that the asynchronous class
 * and the unscheduled one are distinguishable at the moment of creation.
 */
export type CreateOfferingInput = {
  courseId: Id;
  termCode: string;
  sectionNumber: string;
  meetings: readonly Meeting[];
  mode: string | null;
  enrollmentLimit: number | null;
  callNumber: string | null;
  sisClassNumber: number | null;
  url: string | null;
};

/**
 * **The Offering create path** (issues/30, issues/43).
 *
 * Creation is an act and not a transition (issues/13), so it fires no event and
 * **writes no log row anywhere**: the trace is `created_by` / `created_at` on the
 * row, which the detail page renders as a derived creation line. That is exactly
 * why the two invariants below live here — a `retry` at least logs who fired it,
 * while a create writes nothing at all, so the unguarded door was the silent one.
 *
 * Both invariants name no actor, so they bind the chair and the seed script too,
 * and both refuse before anything is written. Both land here because the path
 * already loads the course row to derive `program_code`.
 */
export async function createOffering(
  open: OpenTransaction,
  input: CreateOfferingInput,
  actor: Netid,
): Promise<{ offeringId: Id }> {
  const { tx, at } = open;

  // `FOR SHARE` rather than `FOR UPDATE`: this path does not write the course, it
  // depends on the course not changing underneath it — on its program, its state
  // and its area head all still being what they were when they were checked.
  const [parent] = await tx
    .select({
      programCode: course.programCode,
      status: course.status,
      areaHead: course.areaHead,
    })
    .from(course)
    .where(eq(course.courseId, input.courseId))
    .for("share");
  if (!parent) throw new Error(`No course ${input.courseId}.`);

  // **An Offering may not be created against a `Retired` Course** (issues/43,
  // completing issues/14 from the other end). `retire` requires no live
  // offerings; without this, a director could slate a fresh section straight back
  // into the state that guard exists to forbid.
  if (parent.status === "Retired") {
    refuse("This course has been retired, so no new class can be scheduled from it.");
  }

  // **No area and no area head → no offering** (issues/32). The assignment is
  // monotone — areas and heads may be swapped but never emptied — which is what
  // makes a create-time check sufficient forever.
  const areas = await tx
    .select({ areaId: courseArea.areaId })
    .from(courseArea)
    .where(eq(courseArea.courseId, input.courseId));

  const missing = [
    areas.length === 0 ? "area" : null,
    parent.areaHead === null ? "area head" : null,
  ].filter((absent): absent is string => absent !== null);

  if (missing.length > 0) {
    refuse(`This course cannot be scheduled yet: it has no ${missing.join(" and no ")}.`);
  }

  // The program is checked against the value being written, which issues/30 made
  // unforgeable by deriving it here rather than accepting it.
  const facts = await readActorFacts(tx, actor);
  const subject: Subject = { offering: { programCode: parent.programCode, lead: null } };
  const routes = MATRICES.offering.find((row) => (row.acts as readonly string[]).includes("create"))?.routes ?? NOBODY;
  if (!permitted(routes, facts, subject)) {
    throw new WriteRefused([notYours("schedule", "a class", routes, subject)]);
  }

  const [created] = await tx
    .insert(offering)
    .values({
      courseId: input.courseId,
      programCode: parent.programCode,
      termCode: input.termCode,
      sectionNumber: input.sectionNumber,
      callNumber: input.callNumber,
      sisClassNumber: input.sisClassNumber,
      url: input.url,
      mode: input.mode,
      enrollmentLimit: input.enrollmentLimit,
      snapshot: initialSnapshot(offeringMachine),
      createdBy: actor,
      createdAt: moment(at),
    })
    .returning({ offeringId: offering.offeringId });
  if (!created) throw new Error("The create path wrote no offering.");

  if (input.meetings.length > 0) {
    await tx.insert(offeringMeeting).values(
      input.meetings.map((meeting) => ({
        offeringId: created.offeringId,
        createdBy: actor,
        createdAt: moment(at),
        ...meetingColumns(meeting),
      })),
    );
  }

  return { offeringId: created.offeringId };
}

/** The discriminated union back into `offering_meeting`'s nullable columns, which its shape CHECK then re-asserts. */
function meetingColumns(meeting: Meeting) {
  switch (meeting.kind) {
    case "weekly":
      return {
        kind: meeting.kind,
        dayOfWeek: meeting.dayOfWeek,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        room: meeting.room,
      };
    case "dates":
      return {
        kind: meeting.kind,
        startDate: meeting.startDate,
        endDate: meeting.endDate,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        room: meeting.room,
      };
    case "async":
      return { kind: meeting.kind };
  }
}
