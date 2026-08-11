/**
 * **Seam 1 — `applyTransition`** (issues/74, issues/77).
 *
 * A test here asserts external behaviour at the seam: given a small world and a
 * netid, calling the writer produces this row, this log line or this refusal. It
 * never reaches for a private helper, never asserts the shape of a query and
 * never asserts that some internal function was called.
 *
 * It runs against a **real** database pair, which is forced rather than
 * preferred: a fake could not exercise the locking transaction, the generated
 * `status` column, the CHECK constraints or the cross-project check that a netid
 * is somebody the directory knows — which is most of what there is to get wrong.
 */
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import {
  course,
  courseArea,
  courseTransition,
  offering,
  offeringInstructor,
  offeringTransition,
} from "@/db/classes/schema";
import { classesDb } from "@/db/handles";

import { applyTransition } from "./apply-transition";
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
import { writeFields } from "./write-fields";

const classes = classesDb;

describe.skipIf(!DATABASES_CONFIGURED)("applyTransition", () => {
  let world: World;

  beforeEach(async () => {
    world = await freshWorld();
  });

  // --- The commit, and the refusal that is not one -------------------------

  test("a permitted actor's transition commits the snapshot and the log row together", async () => {
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

    expect(await statusOfOffering(offeringId)).toBe("Staffed");
    expect(await logOf(offeringId)).toEqual([
      {
        event: "staff",
        fromState: "Slated",
        toState: "Staffed",
        actorNetid: WHO.itpDirector,
        subjectNetid: WHO.instructor,
        reason: null,
      },
    ]);
  });

  test("a refused actor's transition commits nothing — not the snapshot and not the log row", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    const offeringId = await slateOffering(world, courseId);

    // `staff` is the offering's director alone: the pick is a decision, where
    // `offer` is only the asking (issues/8, issues/15).
    await expect(
      writeToClasses((tx) =>
        applyTransition(
          tx,
          { machine: "offering", id: offeringId },
          { type: "staff", netid: WHO.instructor },
          WHO.coordinator,
        ),
      ),
    ).rejects.toBeInstanceOf(WriteRefused);

    expect(await statusOfOffering(offeringId)).toBe("Slated");
    expect(await logOf(offeringId)).toEqual([]);
    expect(await rosterOf(offeringId)).toEqual([]);
  });

  test("the refusal names the role that could have done it, never the rule", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    const offeringId = await slateOffering(world, courseId);

    const refused = await refusalFrom(
      writeToClasses((tx) =>
        applyTransition(
          tx,
          { machine: "offering", id: offeringId },
          { type: "staff", netid: WHO.instructor },
          WHO.student,
        ),
      ),
    );

    expect(refused.refusals[0]!.sentence).toBe("Only ITP's program director can staff this class.");
  });

  // --- What the chair's clause does not reach ------------------------------

  test("a machine-illegal event is refused for everyone, the chair included", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    const offeringId = await slateOffering(world, courseId);

    for (const actor of [WHO.chair, WHO.itpDirector, WHO.coordinator]) {
      await expect(
        writeToClasses((tx) =>
          applyTransition(tx, { machine: "offering", id: offeringId }, { type: "publish" }, actor),
        ),
      ).rejects.toBeInstanceOf(WriteRefused);
    }

    expect(await statusOfOffering(offeringId)).toBe("Slated");
    expect(await logOf(offeringId)).toEqual([]);
  });

  test("an invariant refuses the chair — standing principle 6 binds the subject side", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    const offeringId = await slateOffering(world, courseId);

    const refused = await refusalFrom(
      writeToClasses((tx) =>
        applyTransition(
          tx,
          { machine: "offering", id: offeringId },
          { type: "staff", netid: WHO.student },
          WHO.chair,
        ),
      ),
    );

    expect(refused.refusals[0]!.sentence).toContain("without the instructor role");
    expect(await rosterOf(offeringId)).toEqual([]);
  });

  test("`retry` is refused when the course is retired, and the refusal reaches the chair too", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    const offeringId = await slateOffering(world, courseId);

    await move(offeringId, { type: "staff", netid: WHO.instructor }, WHO.itpDirector);
    await move(offeringId, { type: "offer" }, WHO.coordinator);
    await move(offeringId, { type: "decline" }, WHO.instructor);
    // `Declined` is not live, so the course may now be retired.
    await writeToClasses((tx) =>
      applyTransition(tx, { machine: "course", id: courseId }, { type: "retire" }, WHO.itpDirector),
    );

    await expect(
      writeToClasses((tx) =>
        applyTransition(tx, { machine: "offering", id: offeringId }, { type: "retry" }, WHO.chair),
      ),
    ).rejects.toBeInstanceOf(WriteRefused);

    expect(await statusOfOffering(offeringId)).toBe("Declined");
  });

  test("`retire` names the classes standing in its way and lists them", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    await slateOffering(world, courseId);

    const refused = await refusalFrom(
      writeToClasses((tx) =>
        applyTransition(tx, { machine: "course", id: courseId }, { type: "retire" }, WHO.itpDirector),
      ),
    );

    expect(refused.refusals[0]!.sentence).toContain("1 class that has not finished teaching");
    expect(refused.refusals[0]!.dependencies).toEqual(["20253 — Slated"]);
  });

  // --- The two `staff` refusals --------------------------------------------

  test("`staff` refuses a netid holding no instructor role", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    const offeringId = await slateOffering(world, courseId);

    const refused = await refusalFrom(
      writeToClasses((tx) =>
        applyTransition(
          tx,
          { machine: "offering", id: offeringId },
          { type: "staff", netid: WHO.student },
          WHO.itpDirector,
        ),
      ),
    );

    expect(refused.refusals[0]!.sentence).toBe(
      `${WHO.student} cannot be given a class to teach without the instructor role.`,
    );
    expect(await statusOfOffering(offeringId)).toBe("Slated");
  });

  test("`staff` refuses a netid the directory does not know — a check, not a constraint", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    const offeringId = await slateOffering(world, courseId);

    const refused = await refusalFrom(
      writeToClasses((tx) =>
        applyTransition(
          tx,
          { machine: "offering", id: offeringId },
          { type: "staff", netid: WHO.ghost },
          WHO.itpDirector,
        ),
      ),
    );

    expect(refused.refusals[0]!.sentence).toBe(`${WHO.ghost} is not a person the directory knows.`);
    expect(await rosterOf(offeringId)).toEqual([]);
  });

  // --- The side effects ----------------------------------------------------

  test("`approve` on a review mints a course in the approving program's catalog, body and assignment copied", async () => {
    const { reviewId, courseId } = await mintCourse(world, {
      courseNumber: "ITPG-GT 2233",
      credits: 4,
    });

    const [minted] = await classes()
      .select({
        programCode: course.programCode,
        courseNumber: course.courseNumber,
        title: course.title,
        credits: course.credits,
        areaHead: course.areaHead,
        edition: course.edition,
        status: course.status,
        mintedFromReviewId: course.mintedFromReviewId,
        createdBy: course.createdBy,
      })
      .from(course)
      .where(eq(course.courseId, courseId));

    expect(minted).toMatchObject({
      programCode: "ITP",
      courseNumber: "ITPG-GT 2233",
      title: "A course numbered ITPG-GT 2233",
      credits: 4,
      // Copied forward from the review, because areas are program-scoped.
      areaHead: WHO.areaHead,
      edition: 1,
      status: "Approved",
      mintedFromReviewId: reviewId,
      // The approving actor, which may be the area head rather than a director.
      createdBy: WHO.itpDirector,
    });

    const areas = await classes()
      .select({ areaId: courseArea.areaId, programCode: courseArea.programCode })
      .from(courseArea)
      .where(eq(courseArea.courseId, courseId));
    expect(areas).toEqual([{ areaId: world.itpAreaId, programCode: "ITP" }]);
  });

  test("`approve` on a course bumps its edition, in the same transaction as the transition", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });

    await writeToClasses((tx) =>
      applyTransition(tx, { machine: "course", id: courseId }, { type: "revise" }, WHO.itpDirector),
    );
    expect(await editionOf(courseId)).toBe(1);

    await writeToClasses((tx) =>
      applyTransition(tx, { machine: "course", id: courseId }, { type: "approve" }, WHO.areaHead),
    );

    expect(await editionOf(courseId)).toBe(2);
    expect(await statusOfCourse(courseId)).toBe("Approved");
    expect(
      (await classes().select({ event: courseTransition.event }).from(courseTransition)).map(
        (row) => row.event,
      ),
    ).toEqual(["revise", "approve"]);
  });

  test("`decline` deletes position 0, leaves everything below it, and records who declined", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    const offeringId = await slateOffering(world, courseId);

    await move(offeringId, { type: "staff", netid: WHO.instructor }, WHO.itpDirector);
    await coInstructor(offeringId, WHO.areaHead);
    await move(offeringId, { type: "offer" }, WHO.coordinator);
    await move(offeringId, { type: "decline" }, WHO.coordinator);

    expect(await statusOfOffering(offeringId)).toBe("Declined");
    // A section may legally hold co-instructors and no lead — `Declined.retry`
    // produces exactly that shape (issues/61).
    expect(await rosterOf(offeringId)).toEqual([{ position: 1, netid: WHO.areaHead }]);

    const log = await logOf(offeringId);
    expect(log.at(-1)).toMatchObject({
      event: "decline",
      // Who clicked was the coordinator, taking a refusal by email.
      actorNetid: WHO.coordinator,
      // Who said no survives nowhere else, the roster row having gone.
      subjectNetid: WHO.instructor,
    });
  });

  test("`withdraw` vacates position 0 the same way and lands in Slated", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    const offeringId = await slateOffering(world, courseId);

    await move(offeringId, { type: "staff", netid: WHO.instructor }, WHO.itpDirector);
    await move(offeringId, { type: "offer" }, WHO.coordinator);
    await move(offeringId, { type: "withdraw" }, WHO.itpDirector);

    expect(await statusOfOffering(offeringId)).toBe("Slated");
    expect(await rosterOf(offeringId)).toEqual([]);
    expect((await logOf(offeringId)).at(-1)).toMatchObject({
      event: "withdraw",
      subjectNetid: WHO.instructor,
    });
  });

  test("`offer` and `accept` carry a subject too — the roster survives the event but not the offering", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    const offeringId = await slateOffering(world, courseId);

    await move(offeringId, { type: "staff", netid: WHO.instructor }, WHO.itpDirector);
    await move(offeringId, { type: "offer" }, WHO.coordinator);
    await move(offeringId, { type: "accept" }, WHO.instructor);

    const log = await logOf(offeringId);
    expect(log.map((row) => [row.event, row.subjectNetid])).toEqual([
      ["staff", WHO.instructor],
      ["offer", WHO.instructor],
      ["accept", WHO.instructor],
    ]);
  });

  test("a `cancel` may carry a free-text reason, and a `defer` carries no subject", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    const offeringId = await slateOffering(world, courseId);

    await move(offeringId, { type: "staff", netid: WHO.instructor }, WHO.itpDirector);
    await move(offeringId, { type: "offer" }, WHO.coordinator);
    await move(offeringId, { type: "defer" }, WHO.instructor);
    await move(offeringId, { type: "accept" }, WHO.instructor);
    await move(offeringId, { type: "cancel", reason: "Enrolment of four." }, WHO.itpDirector);

    const log = await logOf(offeringId);
    expect(log.find((row) => row.event === "defer")).toMatchObject({ subjectNetid: null });
    expect(log.at(-1)).toMatchObject({ event: "cancel", reason: "Enrolment of four." });
  });
});

// ---------------------------------------------------------------------------
// Reading the world back
// ---------------------------------------------------------------------------

async function move(
  offeringId: Id,
  event: Parameters<typeof applyTransition<"offering">>[2],
  actor: string,
): Promise<void> {
  await writeToClasses((tx) => applyTransition(tx, { machine: "offering", id: offeringId }, event, actor));
}

/** A co-instructor, through the field writer — positions 1..n are its class, not the machine's. */
async function coInstructor(offeringId: Id, netid: string): Promise<void> {
  await writeToClasses((tx) =>
    writeFields(
      tx,
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
      WHO.itpDirector,
    ),
  );
}

async function statusOfOffering(offeringId: Id): Promise<string | null> {
  const [row] = await classes()
    .select({ status: offering.status })
    .from(offering)
    .where(eq(offering.offeringId, offeringId));
  return row?.status ?? null;
}

async function statusOfCourse(courseId: Id): Promise<string | null> {
  const [row] = await classes()
    .select({ status: course.status })
    .from(course)
    .where(eq(course.courseId, courseId));
  return row?.status ?? null;
}

async function editionOf(courseId: Id): Promise<number | null> {
  const [row] = await classes()
    .select({ edition: course.edition })
    .from(course)
    .where(eq(course.courseId, courseId));
  return row?.edition ?? null;
}

async function rosterOf(offeringId: Id) {
  return classes()
    .select({ position: offeringInstructor.position, netid: offeringInstructor.netid })
    .from(offeringInstructor)
    .where(eq(offeringInstructor.offeringId, offeringId))
    .orderBy(offeringInstructor.position);
}

async function logOf(offeringId: Id) {
  return classes()
    .select({
      event: offeringTransition.event,
      fromState: offeringTransition.fromState,
      toState: offeringTransition.toState,
      actorNetid: offeringTransition.actorNetid,
      subjectNetid: offeringTransition.subjectNetid,
      reason: offeringTransition.reason,
    })
    .from(offeringTransition)
    .where(and(eq(offeringTransition.offeringId, offeringId)))
    .orderBy(offeringTransition.offeringTransitionId);
}

