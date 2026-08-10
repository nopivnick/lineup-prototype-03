/**
 * **Seam 1 — `writeFields`** (issues/74, issues/77).
 *
 * The class this file exists for is the one issues/28 settled and issues/62 gave
 * a screen: two predicates, ANDed and **checked separately**, so both can fail at
 * once and both can be reported. Everything else here is one of the actorless
 * refusals the writer carries over and above them.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import {
  course,
  courseProposal,
  offeringArea,
  offeringInstructor,
  offeringMeeting,
  userRole,
} from "@/db/classes/schema";
import { classesDb } from "@/db/handles";

import { applyTransition } from "./apply-transition";
import { createProposal } from "./create-proposal";
import { WriteRefused } from "./refusal";
import {
  DATABASES_CONFIGURED,
  refusalFrom,
  freshWorld,
  mintCourse,
  slateOffering,
  WHO,
  type World,
} from "./test-world";
import { writeToClasses, type Id } from "./transaction";
import { writeFields, type FieldWrite } from "./write-fields";

const classes = classesDb;

describe.skipIf(!DATABASES_CONFIGURED)("writeFields", () => {
  let world: World;

  beforeEach(async () => {
    world = await freshWorld();
  });

  // --- The two predicates ---------------------------------------------------

  test("the state gate and the role gate fail independently, and both are reported", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });

    // An `Approved` course read by **another program's** director: the body is
    // refused because she is not its director, *and* because the course is not
    // `Revising`. Stating one would hide the wall she walks into next.
    const both = await refusalFrom(
      write({ record: { machine: "course", id: courseId }, columns: { "course.title": "New" } }, WHO.imaDirector),
    );
    expect(both.refusals).toHaveLength(2);
    expect(both.refusals.map((refusal) => refusal.sentence)).toEqual([
      "Course body can only be changed while the course is Revising; this one is Approved.",
      "Only ITP's program director or this course's area head can change this record's course body.",
    ]);

    // Her own program's director fails the state gate alone.
    const stateAlone = await refusalFrom(
      write({ record: { machine: "course", id: courseId }, columns: { "course.title": "New" } }, WHO.itpDirector),
    );
    expect(stateAlone.refusals.map((refusal) => refusal.sentence)).toEqual([
      "Course body can only be changed while the course is Revising; this one is Approved.",
    ]);

    // And with the course revising, the wrong director fails the role gate alone.
    await writeToClasses((tx) =>
      applyTransition(tx, { machine: "course", id: courseId }, { type: "revise" }, WHO.itpDirector),
    );
    const roleAlone = await refusalFrom(
      write({ record: { machine: "course", id: courseId }, columns: { "course.title": "New" } }, WHO.imaDirector),
    );
    expect(roleAlone.refusals.map((refusal) => refusal.sentence)).toEqual([
      "Only ITP's program director or this course's area head can change this record's course body.",
    ]);
  });

  test("the chair is ahead of the role gate and never ahead of the state gate", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });

    const refused = await refusalFrom(
      write({ record: { machine: "course", id: courseId }, columns: { "course.title": "New" } }, WHO.chair),
    );
    // One refusal, not two: the chair clears the role predicate and is stopped by
    // the invariant (issues/62).
    expect(refused.refusals).toHaveLength(1);
    expect(refused.refusals[0]!.sentence).toContain("only be changed while the course is Revising");

    await writeToClasses((tx) =>
      applyTransition(tx, { machine: "course", id: courseId }, { type: "revise" }, WHO.itpDirector),
    );
    await write(
      { record: { machine: "course", id: courseId }, columns: { "course.title": "The chair's title" } },
      WHO.chair,
    );
    expect(await titleOf(courseId)).toBe("The chair's title");
  });

  test("a permitted write commits, and stamps `updated_at` / `updated_by` itself", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    await writeToClasses((tx) =>
      applyTransition(tx, { machine: "course", id: courseId }, { type: "revise" }, WHO.itpDirector),
    );

    await write(
      {
        record: { machine: "course", id: courseId },
        columns: { "course.title": "Physical Computing", "course.credits": 2 },
      },
      WHO.areaHead,
    );

    const [row] = await classes()
      .select({
        title: course.title,
        credits: course.credits,
        updatedBy: course.updatedBy,
        updatedAt: course.updatedAt,
      })
      .from(course)
      .where(eq(course.courseId, courseId));

    expect(row).toMatchObject({ title: "Physical Computing", credits: 2, updatedBy: WHO.areaHead });
    // The only trace a field write leaves — issues/17 deleted the transition one
    // used to fire.
    expect(row!.updatedAt).not.toBeNull();
  });

  // --- The classes with no writer at all -----------------------------------

  test("an unclassified column is unwritable, and so is an immutable one", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });

    const structural = await refusalFrom(
      write({ record: { machine: "course", id: courseId }, columns: { "course.program_code": "IMA" } }, WHO.chair),
    );
    expect(structural.refusals[0]!.sentence).toBe("Structural is not editable anywhere in the system.");

    const machineOwned = await refusalFrom(
      write({ record: { machine: "course", id: courseId }, columns: { "course.edition": 9 } }, WHO.chair),
    );
    expect(machineOwned.refusals[0]!.sentence).toBe(
      "Machine-owned is not editable anywhere in the system.",
    );

    const unknown = await refusalFrom(
      write({ record: { machine: "course", id: courseId }, columns: { "course.invented": 1 } }, WHO.chair),
    );
    expect(unknown.refusals[0]!.sentence).toBe(
      "Unclassified — unwritable is not editable anywhere in the system.",
    );
  });

  // --- The roster ----------------------------------------------------------

  test("position 0 is not a field write in any state — it is `staff`", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    const offeringId = await slateOffering(world, courseId);

    const refused = await refusalFrom(
      write(
        {
          record: { machine: "offering", id: offeringId },
          rows: [
            {
              table: "offering_instructor",
              op: "insert",
              values: { offering_id: offeringId, position: 0, netid: WHO.instructor },
            },
          ],
        },
        WHO.chair,
      ),
    );

    expect(refused.refusals[0]!.sentence).toContain("Position 0 is not a field");
    expect(await rosterOf(offeringId)).toEqual([]);

    // And vacating it is the same refusal from the other side: `Staffed` means
    // exactly *position 0 is occupied*, so a field write that emptied it would
    // leave the roster and the machine state disagreeing (issues/15).
    await writeToClasses((tx) =>
      applyTransition(
        tx,
        { machine: "offering", id: offeringId },
        { type: "staff", netid: WHO.instructor },
        WHO.itpDirector,
      ),
    );
    await expect(
      write(
        {
          record: { machine: "offering", id: offeringId },
          rows: [
            {
              table: "offering_instructor",
              op: "delete",
              key: { offering_id: offeringId, position: 0 },
            },
          ],
        },
        WHO.itpDirector,
      ),
    ).rejects.toBeInstanceOf(WriteRefused);
    expect(await rosterOf(offeringId)).toEqual([{ position: 0, netid: WHO.instructor }]);
  });

  test("a co-instructor write refuses a netid with no instructor role, and one the directory does not know", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    const offeringId = await slateOffering(world, courseId);

    const noRole = await refusalFrom(coInstructor(offeringId, WHO.student, WHO.itpDirector));
    expect(noRole.refusals[0]!.sentence).toContain("without the instructor role");

    const noPerson = await refusalFrom(coInstructor(offeringId, WHO.ghost, WHO.itpDirector));
    expect(noPerson.refusals[0]!.sentence).toBe(`${WHO.ghost} is not a person the directory knows.`);

    expect(await rosterOf(offeringId)).toEqual([]);

    // And the write that is legal writes its own provenance.
    await coInstructor(offeringId, WHO.areaHead, WHO.itpDirector);
    const [seated] = await classes()
      .select({ netid: offeringInstructor.netid, grantedBy: offeringInstructor.grantedBy })
      .from(offeringInstructor)
      .where(eq(offeringInstructor.offeringId, offeringId));
    expect(seated).toMatchObject({ netid: WHO.areaHead, grantedBy: WHO.itpDirector });
  });

  test("a co-instructor write is the offering's director alone, and state-blind", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    const offeringId = await slateOffering(world, courseId);

    await expect(coInstructor(offeringId, WHO.instructor, WHO.coordinator)).rejects.toBeInstanceOf(
      WriteRefused,
    );

    // Drive the class to a state that asserts nothing about the rows below 0.
    await writeToClasses((tx) =>
      applyTransition(
        tx,
        { machine: "offering", id: offeringId },
        { type: "staff", netid: WHO.instructor },
        WHO.itpDirector,
      ),
    );
    await writeToClasses((tx) =>
      applyTransition(tx, { machine: "offering", id: offeringId }, { type: "offer" }, WHO.coordinator),
    );
    await coInstructor(offeringId, WHO.areaHead, WHO.itpDirector);

    expect((await rosterOf(offeringId)).map((row) => row.position)).toEqual([0, 1]);
  });

  test("a row lands on the record that was opened, whatever id its payload names", async () => {
    const itp = await mintCourse(world, { courseNumber: "ITPG-GT 2233", programCode: "ITP" });
    const itpOffering = await slateOffering(world, itp.courseId, { actor: WHO.itpDirector });
    const ima = await mintCourse(world, { courseNumber: "IMNY-UT 105", programCode: "IMA" });
    const imaOffering = await slateOffering(world, ima.courseId, { actor: WHO.imaDirector });

    // IMA's director edits her **own** class, so the role gate is satisfied, and
    // names ITP's offering id inside the row. The parent key is derived from the
    // record rather than taken from her, so the write cannot leave her program.
    await write(
      {
        record: { machine: "offering", id: imaOffering },
        rows: [
          {
            table: "offering_meeting",
            op: "insert",
            values: { offering_id: itpOffering, kind: "async" },
          },
        ],
      },
      WHO.imaDirector,
    );

    expect(await meetingCountOf(itpOffering)).toBe(1);
    expect(await meetingCountOf(imaOffering)).toBe(2);
  });

  test("a write may not name a table its record does not own", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    const offeringId = await slateOffering(world, courseId);

    await expect(
      write(
        { record: { machine: "offering", id: offeringId }, columns: { "course.area_head": WHO.areaHead } },
        WHO.chair,
      ),
    ).rejects.toThrow(/may not name course/);
  });

  // --- Seat sharing: the one scope that points away from the record ---------

  test("a seat-sharing tag is written by the other program's director, and refuses the record's own", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    const offeringId = await slateOffering(world, courseId);

    const ownProgram = await refusalFrom(
      write(
        {
          record: { machine: "offering", id: offeringId },
          rows: [
            {
              table: "offering_area",
              op: "insert",
              values: { offering_id: offeringId, area_id: world.itpAreaId },
            },
          ],
        },
        WHO.itpDirector,
      ),
    );
    expect(ownProgram.refusals[0]!.sentence).toContain("cannot share seats with its own program");

    // ITP's own director cannot write IMA's claim either — it would let one
    // program declare that its course satisfies another's requirements.
    await expect(
      write(
        {
          record: { machine: "offering", id: offeringId },
          rows: [
            {
              table: "offering_area",
              op: "insert",
              values: { offering_id: offeringId, area_id: world.imaAreaId },
            },
          ],
        },
        WHO.itpDirector,
      ),
    ).rejects.toBeInstanceOf(WriteRefused);

    await write(
      {
        record: { machine: "offering", id: offeringId },
        rows: [
          {
            table: "offering_area",
            op: "insert",
            values: { offering_id: offeringId, area_id: world.imaAreaId },
          },
        ],
      },
      WHO.imaDirector,
    );

    const shared = await classes()
      .select({ areaId: offeringArea.areaId, grantedBy: offeringArea.grantedBy })
      .from(offeringArea)
      .where(eq(offeringArea.offeringId, offeringId));
    expect(shared).toEqual([{ areaId: world.imaAreaId, grantedBy: WHO.imaDirector }]);
  });

  // --- The assignment is monotone ------------------------------------------

  test("an area head can be swapped but never removed, and never named without the role", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });

    const emptied = await refusalFrom(
      write(
        { record: { machine: "course", id: courseId }, columns: { "course.area_head": null } },
        WHO.itpDirector,
      ),
    );
    expect(emptied.refusals[0]!.sentence).toContain("swapped but never removed");

    const unqualified = await refusalFrom(
      write(
        { record: { machine: "course", id: courseId }, columns: { "course.area_head": WHO.instructor } },
        WHO.itpDirector,
      ),
    );
    expect(unqualified.refusals[0]!.sentence).toContain("without the area head role");

    expect(await areaHeadOf(courseId)).toBe(WHO.areaHead);
  });

  // --- Authorization -------------------------------------------------------

  test("a role grant is the chair's alone", async () => {
    await expect(
      write(
        {
          record: { authorization: true },
          rows: [{ table: "user_role", op: "insert", values: { netid: WHO.student, role: "coordinator" } }],
        },
        WHO.itpDirector,
      ),
    ).rejects.toBeInstanceOf(WriteRefused);

    await write(
      {
        record: { authorization: true },
        rows: [{ table: "user_role", op: "insert", values: { netid: WHO.student, role: "coordinator" } }],
      },
      WHO.chair,
    );
    expect(await rolesOf(WHO.student)).toEqual(["coordinator", "student"]);
  });

  test("the last chair cannot be removed", async () => {
    const refused = await refusalFrom(
      write(
        {
          record: { authorization: true },
          rows: [{ table: "user_role", op: "delete", key: { netid: WHO.chair, role: "chair" } }],
        },
        WHO.chair,
      ),
    );
    expect(refused.refusals[0]!.sentence).toBe("The last chair cannot be removed.");
    expect(await rolesOf(WHO.chair)).toEqual(["chair"]);
  });

  test("a role is not revocable while a live relationship depends on it, and the refusal lists them", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    const offeringId = await slateOffering(world, courseId);
    await writeToClasses((tx) =>
      applyTransition(
        tx,
        { machine: "offering", id: offeringId },
        { type: "staff", netid: WHO.instructor },
        WHO.itpDirector,
      ),
    );

    const instructor = await refusalFrom(revoke(WHO.instructor, "instructor"));
    expect(instructor.refusals[0]!.sentence).toContain("has not finished");
    expect(instructor.refusals[0]!.dependencies).toHaveLength(1);

    const head = await refusalFrom(revoke(WHO.areaHead, "area_head"));
    expect(head.refusals[0]!.sentence).toContain("not been retired");
    expect(head.refusals[0]!.dependencies).toEqual(["ITPG-GT 2233 — Approved"]);

    const directorRefusal = await refusalFrom(revoke(WHO.itpDirector, "program_director"));
    expect(directorRefusal.refusals[0]!.dependencies).toEqual(["ITP"]);
  });

  test("appointing a director refuses a netid without the role — principle 6 again", async () => {
    const refused = await refusalFrom(
      write(
        {
          record: { authorization: true },
          rows: [
            { table: "program_director", op: "insert", values: { program_code: "ITP", netid: WHO.instructor } },
          ],
        },
        WHO.chair,
      ),
    );
    expect(refused.refusals[0]!.sentence).toContain("without the program director role");
  });

  // --- The proposal body's gate is not a state of the record ---------------

  test("the proposal body opens while any of its reviews is developing, and its author writes under that floor", async () => {
    const { proposalId, reviewId } = await mintCourseAtProposal();

    const closed = await refusalFrom(
      write(
        {
          record: { machine: "course_proposal_review", id: reviewId },
          columns: { "course_proposal.title": "Renamed" },
        },
        WHO.instructor,
      ),
    );
    expect(closed.refusals[0]!.sentence).toContain("under development");

    await writeToClasses((tx) =>
      applyTransition(
        tx,
        { machine: "course_proposal_review", id: reviewId },
        { type: "develop" },
        WHO.itpDirector,
      ),
    );

    await write(
      {
        record: { machine: "course_proposal_review", id: reviewId },
        columns: { "course_proposal.title": "Renamed by its author" },
      },
      WHO.instructor,
    );

    expect(await proposalTitleOf(proposalId)).toBe("Renamed by its author");
  });
});

// ---------------------------------------------------------------------------

function write(fieldWrite: FieldWrite, actor: string): Promise<void> {
  return writeToClasses((tx) => writeFields(tx, fieldWrite, actor));
}

function coInstructor(offeringId: Id, netid: string, actor: string): Promise<void> {
  return write(
    {
      record: { machine: "offering", id: offeringId },
      rows: [
        {
          table: "offering_instructor",
          op: "insert",
          values: { offering_id: offeringId, position: 1, netid },
        },
      ],
    },
    actor,
  );
}

function revoke(netid: string, role: string): Promise<void> {
  return write(
    {
      record: { authorization: true },
      rows: [{ table: "user_role", op: "delete", key: { netid, role } }],
    },
    WHO.chair,
  );
}

/** A proposal with one `Proposed` review and no course behind it yet. */
async function mintCourseAtProposal(): Promise<{ proposalId: Id; reviewId: Id }> {
  const { proposalId, reviewIds } = await writeToClasses((tx) =>
    createProposal(
      tx,
      { title: "A body to develop", description: null, credits: 4, programs: ["ITP"] },
      WHO.instructor,
    ),
  );
  return { proposalId, reviewId: reviewIds[0]! };
}

async function titleOf(courseId: Id): Promise<string | undefined> {
  const [row] = await classes().select({ title: course.title }).from(course).where(eq(course.courseId, courseId));
  return row?.title;
}

async function areaHeadOf(courseId: Id): Promise<string | null | undefined> {
  const [row] = await classes()
    .select({ areaHead: course.areaHead })
    .from(course)
    .where(eq(course.courseId, courseId));
  return row?.areaHead;
}

async function proposalTitleOf(proposalId: Id): Promise<string | undefined> {
  const [row] = await classes()
    .select({ title: courseProposal.title })
    .from(courseProposal)
    .where(eq(courseProposal.courseProposalId, proposalId));
  return row?.title;
}

async function rosterOf(offeringId: Id) {
  return classes()
    .select({ position: offeringInstructor.position, netid: offeringInstructor.netid })
    .from(offeringInstructor)
    .where(eq(offeringInstructor.offeringId, offeringId))
    .orderBy(offeringInstructor.position);
}

async function meetingCountOf(offeringId: Id): Promise<number> {
  return (
    await classes()
      .select({ id: offeringMeeting.offeringMeetingId })
      .from(offeringMeeting)
      .where(eq(offeringMeeting.offeringId, offeringId))
  ).length;
}

async function rolesOf(netid: string): Promise<string[]> {
  const rows = await classes().select({ role: userRole.role }).from(userRole).where(eq(userRole.netid, netid));
  return rows.map((row) => row.role).sort();
}

