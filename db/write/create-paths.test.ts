/**
 * **Seam 1 — the two create paths** (issues/74, issues/77).
 *
 * Creation is an act and not a transition (issues/13), so neither of these writes
 * a log row anywhere: the trace is `created_by` / `created_at` on the row. That
 * is exactly why the invariants below live in the writers — a `retry` at least
 * logs who fired it, while a create writes nothing at all.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import {
  courseProposal,
  courseProposalReview,
  offering,
  offeringMeeting,
} from "@/db/classes/schema";
import { classesDb } from "@/db/handles";

import { applyTransition } from "./apply-transition";
import { createOffering } from "./create-offering";
import { createProposal } from "./create-proposal";
import { WriteRefused } from "./refusal";
import {
  A_MEETING,
  DATABASES_CONFIGURED,
  freshWorld,
  mintCourse,
  refusalFrom,
  WHO,
  type World,
} from "./test-world";
import { writeToClasses, type Id } from "./transaction";

const classes = classesDb;

describe.skipIf(!DATABASES_CONFIGURED)("createOffering", () => {
  let world: World;

  beforeEach(async () => {
    world = await freshWorld();
  });

  test("derives program_code from the course rather than taking it, and slates in `Slated`", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });

    const { offeringId } = await slate(world, courseId, WHO.itpDirector);

    const [created] = await classes()
      .select({
        programCode: offering.programCode,
        termCode: offering.termCode,
        sectionNumber: offering.sectionNumber,
        status: offering.status,
        createdBy: offering.createdBy,
      })
      .from(offering)
      .where(eq(offering.offeringId, offeringId));

    expect(created).toMatchObject({
      // Never in the signature: a parameter whose entire domain is one value is
      // a program picker that must track the chosen course (issues/30).
      programCode: "ITP",
      termCode: world.termCode,
      sectionNumber: "1",
      status: "Slated",
      createdBy: WHO.itpDirector,
    });

    const meetings = await classes()
      .select({ kind: offeringMeeting.kind, room: offeringMeeting.room, createdBy: offeringMeeting.createdBy })
      .from(offeringMeeting)
      .where(eq(offeringMeeting.offeringId, offeringId));
    expect(meetings).toEqual([{ kind: "weekly", room: "370J", createdBy: WHO.itpDirector }]);
  });

  test("refuses a retired course — the second door onto `noLiveOfferings`", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
    await writeToClasses((tx) =>
      applyTransition(tx, { machine: "course", id: courseId }, { type: "retire" }, WHO.itpDirector),
    );

    const refused = await refusalFrom(slate(world, courseId, WHO.itpDirector));

    expect(refused.refusals[0]!.sentence).toContain("retired");
    expect(await offeringCount()).toBe(0);
  });

  test("refuses a course with no area, naming which half is missing", async () => {
    const { courseId } = await mintCourse(world, {
      courseNumber: "ITPG-GT 2048",
      withArea: false,
    });

    const refused = await refusalFrom(slate(world, courseId, WHO.itpDirector));

    expect(refused.refusals[0]!.sentence).toBe(
      "This course cannot be scheduled yet: it has no area.",
    );
    expect(await offeringCount()).toBe(0);
  });

  test("refuses a course with no area head", async () => {
    const { courseId } = await mintCourse(world, {
      courseNumber: "ITPG-GT 1010",
      withAreaHead: false,
    });

    const refused = await refusalFrom(slate(world, courseId, WHO.itpDirector));

    expect(refused.refusals[0]!.sentence).toContain("no area head");
    expect(await offeringCount()).toBe(0);
  });

  test("the area-and-head invariant refuses the chair, who cannot violate an invariant", async () => {
    const { courseId } = await mintCourse(world, {
      courseNumber: "ITPG-GT 2999",
      withArea: false,
      withAreaHead: false,
    });

    await expect(slate(world, courseId, WHO.chair)).rejects.toBeInstanceOf(WriteRefused);
    expect(await offeringCount()).toBe(0);
  });

  test("refuses a director of another program — the check is against the derived value", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });

    const refused = await refusalFrom(slate(world, courseId, WHO.imaDirector));

    expect(refused.refusals[0]!.sentence).toBe("Only ITP's program director can schedule a class.");
    expect(await offeringCount()).toBe(0);
  });
});

describe.skipIf(!DATABASES_CONFIGURED)("createProposal", () => {
  let world: World;

  beforeEach(async () => {
    world = await freshWorld();
  });

  test("mints one review per requested program, in one transaction", async () => {
    const { proposalId, reviewIds } = await writeToClasses((tx) =>
      createProposal(
        tx,
        {
          title: "Machine Vision Systems",
          description: "One body, two catalogs.",
          credits: 4,
          programs: ["ITP", "IMA"],
        },
        WHO.instructor,
      ),
    );

    expect(reviewIds).toHaveLength(2);

    const [proposal] = await classes()
      .select({ title: courseProposal.title, createdBy: courseProposal.createdBy })
      .from(courseProposal)
      .where(eq(courseProposal.courseProposalId, proposalId));
    expect(proposal).toMatchObject({ title: "Machine Vision Systems", createdBy: WHO.instructor });

    const reviews = await classes()
      .select({ programCode: courseProposalReview.programCode, status: courseProposalReview.status })
      .from(courseProposalReview)
      .where(eq(courseProposalReview.courseProposalId, proposalId));
    expect(reviews.map((row) => row.programCode).sort()).toEqual(["IMA", "ITP"]);
    // A review row *is* the request, and a review is opened by being created —
    // there is no `propose` event (issues/7, issues/10).
    expect(reviews.every((row) => row.status === "Proposed")).toBe(true);
  });

  test("refuses an empty program set — the only way to create an unreachable record", async () => {
    const refused = await refusalFrom(
      writeToClasses((tx) =>
        createProposal(
          tx,
          { title: "Nobody will review this", description: null, credits: 4, programs: [] },
          WHO.instructor,
        ),
      ),
    );

    expect(refused.refusals[0]!.sentence).toBe(
      "A proposal has to ask at least one program to review it.",
    );
    expect(await proposalCount()).toBe(0);
  });

  test("refuses an empty program set for the chair too — it names no actor", async () => {
    await expect(
      writeToClasses((tx) =>
        createProposal(tx, { title: "Still nobody", description: null, credits: 4, programs: [] }, WHO.chair),
      ),
    ).rejects.toBeInstanceOf(WriteRefused);
    expect(await proposalCount()).toBe(0);
  });

  test("refuses a `student`, who holds nothing anywhere in the matrix", async () => {
    await expect(
      writeToClasses((tx) =>
        createProposal(
          tx,
          { title: "A student's proposal", description: null, credits: 4, programs: ["ITP"] },
          WHO.student,
        ),
      ),
    ).rejects.toBeInstanceOf(WriteRefused);
    expect(await proposalCount()).toBe(0);
  });

  test("accepts all three flat arms, the act being flat by construction", async () => {
    for (const actor of [WHO.instructor, WHO.itpDirector, WHO.areaHead]) {
      await writeToClasses((tx) =>
        createProposal(
          tx,
          { title: `Proposed by ${actor}`, description: null, credits: 2, programs: ["ITP"] },
          actor,
        ),
      );
    }
    expect(await proposalCount()).toBe(3);
    expect(world.termCode).toBe("20253");
  });
});

// ---------------------------------------------------------------------------

function slate(world: World, courseId: Id, actor: string) {
  return writeToClasses((tx) =>
    createOffering(
      tx,
      {
        courseId,
        termCode: world.termCode,
        sectionNumber: "1",
        meetings: [A_MEETING],
        mode: null,
        enrollmentLimit: null,
        callNumber: null,
        sisClassNumber: null,
        url: null,
      },
      actor,
    ),
  );
}

async function offeringCount(): Promise<number> {
  return (await classes().select({ offeringId: offering.offeringId }).from(offering)).length;
}

async function proposalCount(): Promise<number> {
  return (
    await classes().select({ id: courseProposal.courseProposalId }).from(courseProposal)
  ).length;
}

