/**
 * **The moment a write happened, and where it rides** (issues/49, issues/78,
 * issues/107).
 *
 * issues/49 made the seed's dates literal: the world sits on 20 October 2026 and
 * its history runs from 2018, so a run of `db:reset` may not stamp its own
 * instant on a single row. Every timestamp column in both schemas defaults to
 * `now()`, which is the right answer for every caller but that one.
 *
 * issues/107 settled where the exception lives: **on the transaction, not on the
 * writer**. A transaction is opened *at* a moment and everything written while
 * it is open carries that moment, which is what actually happened — one
 * transaction is one act. The four write paths take no moment of their own.
 *
 * The door itself is fenced. `writeToClassesAt` is importable from `db/seed.ts`
 * alone, enforced by the same `no-restricted-imports` rule that keeps database
 * handles out of pages, because a caller-supplied date is the one way to write a
 * plausible lie into the transition log. This file is inside the boundary and so
 * may open one; nothing in `app/` can.
 */
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import {
  course,
  courseProposal,
  courseProposalReview,
  courseTransition,
  offering,
  userRole,
} from "@/db/classes/schema";
import { classesDb } from "@/db/handles";

import { applyTransition } from "./apply-transition";
import { createOffering } from "./create-offering";
import { createProposal } from "./create-proposal";
import { writeToClassesAt } from "./dated-transaction";
import {
  A_MEETING,
  DATABASES_CONFIGURED,
  freshWorld,
  mintCourse,
  WHO,
  type World,
} from "./test-world";
import { writeToClasses } from "./transaction";
import { writeFields } from "./write-fields";

const classes = classesDb;

/**
 * A moment in the seed's world rather than a plausible one: seven years before
 * any run of this suite, so a stamp that came from the database's clock cannot
 * pass by coincidence.
 */
const A_MOMENT = new Date("2019-03-04T14:00:00.000Z");

/** A second one, to show that the moment is the transaction's and not the file's. */
const ANOTHER_MOMENT = new Date("2021-11-19T09:30:00.000Z");

const A_PROPOSAL = {
  title: "A course proposed in the past",
  description: "Written by a dated transaction.",
  credits: 4,
  programs: ["ITP"],
} as const;

describe.skipIf(!DATABASES_CONFIGURED)("a dated transaction", () => {
  let world: World;

  beforeEach(async () => {
    world = await freshWorld();
  });

  test("stamps its moment on the rows the create paths write", async () => {
    const { proposalId, reviewIds } = await writeToClassesAt(A_MOMENT, (tx) =>
      createProposal(tx, A_PROPOSAL, WHO.instructor),
    );

    const [proposal] = await classes()
      .select({ createdAt: courseProposal.createdAt })
      .from(courseProposal)
      .where(eq(courseProposal.courseProposalId, proposalId));
    const [review] = await classes()
      .select({ createdAt: courseProposalReview.createdAt })
      .from(courseProposalReview)
      .where(eq(courseProposalReview.courseProposalReviewId, reviewIds[0]!));

    expect(proposal!.createdAt).toEqual(A_MOMENT);
    expect(review!.createdAt).toEqual(A_MOMENT);
  });

  test("stamps it on an offering, whose create path writes meeting rows too", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 4001" });

    const { offeringId } = await writeToClassesAt(ANOTHER_MOMENT, (tx) =>
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
        WHO.itpDirector,
      ),
    );

    const [created] = await classes()
      .select({ createdAt: offering.createdAt })
      .from(offering)
      .where(eq(offering.offeringId, offeringId));

    expect(created!.createdAt).toEqual(ANOTHER_MOMENT);
  });

  test("stamps it on the transition log, which is the row that would otherwise lie", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 4002" });

    await writeToClassesAt(A_MOMENT, (tx) =>
      applyTransition(tx, { machine: "course", id: courseId }, { type: "revise" }, WHO.itpDirector),
    );

    const [logged] = await classes()
      .select({ at: courseTransition.at, event: courseTransition.event })
      .from(courseTransition)
      .where(eq(courseTransition.courseId, courseId));

    expect(logged).toMatchObject({ event: "revise", at: A_MOMENT });
  });

  test("stamps it on the field writer's `updated_at` and on a grant's `granted_at`", async () => {
    const { courseId } = await mintCourse(world, { courseNumber: "ITPG-GT 4003" });

    // The course's requirement categories: state-blind and director-written
    // (issues/106), so this needs no `revise` window and the stamp is the whole
    // of what the test is about. The field writer stamps the record any row
    // write hangs off (issues/10).
    await writeToClassesAt(A_MOMENT, (tx) =>
      writeFields(
        tx,
        {
          record: { machine: "course", id: courseId },
          rows: [
            {
              table: "course_requirement_category",
              op: "insert",
              values: { requirement_category_id: world.itpCategoryId },
            },
          ],
        },
        WHO.itpDirector,
      ),
    );
    await writeToClassesAt(ANOTHER_MOMENT, (tx) =>
      writeFields(
        tx,
        {
          record: { authorization: true },
          rows: [{ table: "user_role", op: "insert", values: { netid: WHO.instructor, role: "advisor" } }],
        },
        WHO.chair,
      ),
    );

    const [edited] = await classes()
      .select({ updatedAt: course.updatedAt })
      .from(course)
      .where(eq(course.courseId, courseId));
    const [granted] = await classes()
      .select({ grantedAt: userRole.grantedAt })
      .from(userRole)
      .where(and(eq(userRole.netid, WHO.instructor), eq(userRole.role, "advisor")));

    expect(edited!.updatedAt).toEqual(A_MOMENT);
    expect(granted!.grantedAt).toEqual(ANOTHER_MOMENT);
  });

  /**
   * The claim issues/107 chose this shape for. Two write paths inside one
   * transaction get **one** moment, because the moment belongs to the
   * transaction — there is no second argument for a caller to pass differently
   * the second time.
   */
  test("covers every write path called inside it with one moment", async () => {
    const { proposalId, reviewIds } = await writeToClassesAt(A_MOMENT, async (tx) => {
      const created = await createProposal(tx, A_PROPOSAL, WHO.instructor);
      await writeFields(
        tx,
        {
          record: { machine: "course_proposal_review", id: created.reviewIds[0]! },
          columns: { "course_proposal_review.area_head": WHO.areaHead },
        },
        WHO.itpDirector,
      );
      return created;
    });

    const [proposal] = await classes()
      .select({ createdAt: courseProposal.createdAt })
      .from(courseProposal)
      .where(eq(courseProposal.courseProposalId, proposalId));
    const [review] = await classes()
      .select({ createdAt: courseProposalReview.createdAt, updatedAt: courseProposalReview.updatedAt })
      .from(courseProposalReview)
      .where(eq(courseProposalReview.courseProposalReviewId, reviewIds[0]!));

    expect(proposal!.createdAt).toEqual(A_MOMENT);
    expect(review!.createdAt).toEqual(A_MOMENT);
    expect(review!.updatedAt).toEqual(A_MOMENT);
  });
});

describe.skipIf(!DATABASES_CONFIGURED)("an undated transaction", () => {
  beforeEach(async () => {
    await freshWorld();
  });

  /**
   * The ordinary case, and the reason the moment is optional rather than
   * required: a Server Action opens a transaction and says nothing about when,
   * so the column defaults answer. Nothing in `app/` can do anything else.
   */
  test("leaves every stamp to the database's own clock", async () => {
    const openedAt = Date.now();

    const { proposalId } = await writeToClasses((tx) =>
      createProposal(tx, A_PROPOSAL, WHO.instructor),
    );

    const [proposal] = await classes()
      .select({ createdAt: courseProposal.createdAt })
      .from(courseProposal)
      .where(eq(courseProposal.courseProposalId, proposalId));

    const stamped = proposal!.createdAt.getTime();
    expect(stamped).toBeGreaterThan(openedAt - 60_000);
    expect(stamped).toBeLessThan(Date.now() + 60_000);
  });
});
