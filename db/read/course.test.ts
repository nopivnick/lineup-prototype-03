/**
 * **Seam 2 — `getCoursePage`** (issues/74, issues/83).
 *
 * A test here asserts external behaviour at the seam: given a small world and an
 * actor, calling the read module returns this record, these term groups, this
 * permitted-action set, this edit affordance and this history. It never reaches
 * for a private helper and never asserts the shape of a query.
 *
 * Five properties are the ticket's, and none is provable by reading the module:
 *
 *   * **a record the actor may not read comes back not-visible rather than
 *     throwing** — and for a course that is *does not exist*, `course` being
 *     Tier 1.
 *   * **`student` and `advisor` get no history section — absent, not empty** —
 *     and nothing else the section hides reaches them either, which is asserted
 *     over the serialised page rather than field by field.
 *   * **the permitted-action set matches what the write path will accept from
 *     that actor.** `wouldAccept` calls `applyTransition` for real and rolls the
 *     transaction back, so the comparison is against the writer's own answer
 *     rather than against a second copy of the rules written to make the test
 *     pass.
 *   * **`getCoursePage` computes the edit affordance**, both refusals per class,
 *     with the chair ahead of *Not yours* and never ahead of *Not now*.
 *   * **the distinct states each render as themselves** — a course never
 *     offered, a record with no history, a netid the directory does not know
 *     landing on a history line, an unassignable course, and never changed.
 *
 * It runs against a **real** database pair, like Seam 1 and for the same reason.
 */
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { classesDb } from "@/db/handles";
import { applyTransition, type CourseEvent } from "@/db/write/apply-transition";
import { createProposal } from "@/db/write/create-proposal";
import { WriteRefused } from "@/db/write/refusal";
import {
  DATABASES_CONFIGURED,
  driveOffering,
  freshWorld,
  mintCourse,
  slateOffering,
  WHO,
  type World,
} from "@/db/write/test-world";
import { writeToClasses, type Id } from "@/db/write/transaction";
import { writeFields } from "@/db/write/write-fields";

import { getActorFacts } from "./actor-facts";
import { getCoursePage, type CoursePage } from "./course";
import type { CourseEventName } from "./course-rows";

/**
 * **The round-trip counter**, the same device `db/read/lineup.test.ts` uses:
 * `db/read/course.ts` reaches `db/handles.ts` through this mock, so every query
 * either side of the project boundary increments a counter — including one added
 * later, and including one inside a helper the module borrows.
 */
const { trips } = vi.hoisted(() => ({ trips: { classes: 0, people: 0 } }));

vi.mock("@/db/handles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/handles")>();
  return {
    ...actual,
    classesDb: () => {
      trips.classes += 1;
      return actual.classesDb();
    },
    peopleDb: () => {
      trips.people += 1;
      return actual.peopleDb();
    },
  };
});

const AS = { netid: WHO.itpDirector };

describe.skipIf(!DATABASES_CONFIGURED)("getCoursePage", () => {
  let world: World;
  let course: Catalog;

  beforeEach(async () => {
    world = await freshWorld();
    course = await aCatalog(world);
  });

  // --- The record -----------------------------------------------------------

  test("hands back the course, its tags, its head and the edition the Catalog dropped", async () => {
    const page = await open(course.physicalComputing, AS.netid);

    expect(page).toMatchObject({
      courseId: String(course.physicalComputing),
      courseNumber: "ITPG-GT 2233",
      title: "A course numbered ITPG-GT 2233",
      programCode: "ITP",
      credits: 4,
      // issues/10 stored it because the number is read by people; issues/37 then
      // dropped it from the one view where people would have read it. It sits
      // here, beside the approval history that explains it.
      edition: 1,
      status: "Approved",
      areas: [{ name: "Physical Computing" }],
      requirementCategories: [{ name: "Core" }],
      // The one place a Course presents a person as a person, so pronouns are on
      // the shape whether or not this fixture fills them (issues/40).
      areaHead: { netid: WHO.areaHead, displayName: "NA Example", pronouns: null },
      notOfferableYet: null,
    });
  });

  test("a course that does not exist comes back not-visible rather than throwing", async () => {
    expect(await getCoursePage(String(course.physicalComputing + 9_000), AS)).toEqual({
      visible: false,
    });
    // A URL is a public input, so the answer has to survive one that is not a
    // number at all — and it is the same answer, in the same words.
    expect(await getCoursePage("not-a-course", AS)).toEqual({ visible: false });
  });

  // --- The sections, grouped by term, newest first ---------------------------

  test("groups the course's sections by term, newest first, term-lessly", async () => {
    const page = await open(course.liveWeb, AS.netid);

    expect(page.sections.map((group) => group.termCode)).toEqual([
      world.laterTermCode,
      world.termCode,
    ]);
    expect(page.sections[0]!.offerings.map((one) => one.sectionNumber)).toEqual(["1"]);
    expect(page.sections[1]!.offerings.map((one) => one.sectionNumber)).toEqual(["1", "2"]);

    // The rows are the Lineup's rows and carry what a section row carries — no
    // course number, no title, no term: those are the page's and the group's.
    expect(Object.keys(page.sections[1]!.offerings[0]!).sort()).toEqual([
      "actions",
      "enrollmentLimit",
      "foreignTags",
      "meetings",
      "mode",
      "offeringId",
      "roster",
      "sectionNumber",
      "status",
    ]);
  });

  test("a course never offered says so rather than rendering an empty term", async () => {
    const page = await open(course.neverOffered, AS.netid);
    expect(page.sections).toEqual([]);
  });

  test("a student sees the committed sections and no group for a term that holds none", async () => {
    const asStudent = await open(course.liveWeb, WHO.student);

    // Live Web section 1 of the earlier term is `Accepted`; everything else about
    // the course is inside the department's staffing process. A term whose every
    // section is outside the tier is not a term this page mentions — the group is
    // built from the rows, so *no empty groups* arrives by construction.
    expect(asStudent.sections.map((group) => group.termCode)).toEqual([world.termCode]);
    expect(asStudent.sections[0]!.offerings.map((one) => one.status)).toEqual(["Accepted"]);

    const asDirector = await open(course.liveWeb, AS.netid);
    expect(sectionCount(asDirector)).toBeGreaterThan(sectionCount(asStudent));
  });

  // --- The review it was minted from, and the drift line ---------------------

  test("links the review whose approve minted the course, and says nothing has drifted", async () => {
    const page = await open(course.physicalComputing, AS.netid);
    expect(page.mintedFrom).toEqual({
      reviewId: String(course.physicalComputingReview),
      programCode: "ITP",
      bodyHasDriftedSince: false,
    });
  });

  test("the drift line fires when the proposal's body stops matching the course's", async () => {
    // **The scenario issues/42 is about, built the only way it happens.** ITP's
    // review approves and mints; IMA is still reading the same body, and its
    // `develop` opens an edit that changes what ITP already copied. The ITP
    // review is `Approved` and final, so this cannot be staged from ITP's side —
    // which is the point: the course's own program cannot see the drift coming.
    const drifted = await aSharedProposal(world);

    await writeToClasses((open) =>
      applyTransition(
        open,
        { machine: "course_proposal_review", id: drifted.imaReviewId },
        { type: "develop" },
        WHO.imaDirector,
      ),
    );
    await writeToClasses((open) =>
      writeFields(
        open,
        {
          record: { machine: "course_proposal_review", id: drifted.imaReviewId },
          columns: { "course_proposal.title": "A course under a different name" },
        },
        WHO.imaDirector,
      ),
    );

    const page = await open(drifted.courseId, AS.netid);
    expect(page.mintedFrom.bodyHasDriftedSince).toBe(true);
    // And the course itself is untouched, which is the whole content of the line:
    // two records that disagree, with nothing else in the system recording it.
    expect(page.title).toBe("A course two programs are reading");
  });

  // --- The history -----------------------------------------------------------

  test("opens with a derived creation line, and a record with no history has only that", async () => {
    const page = await open(course.physicalComputing, AS.netid);

    // issues/13 refused a genesis row, so this line is read off `created_by` /
    // `created_at` on the entity. `created_by` is the **approving actor**
    // (issues/32 amending issues/13), which is ITP's director here.
    expect(page.history?.creation).toEqual({
      by: { netid: WHO.itpDirector, displayName: "PR Example" },
      at: expect.any(String),
    });
    expect(page.history?.moves).toEqual([]);
  });

  test("a move lands as a history line carrying the machine's own values and its reason", async () => {
    await writeToClasses((open) =>
      applyTransition(
        open,
        { machine: "course", id: course.physicalComputing },
        { type: "revise", reason: "The credits were wrong." },
        WHO.itpDirector,
      ),
    );

    const page = await open(course.physicalComputing, AS.netid);
    expect(page.history?.moves).toEqual([
      {
        // Exactly machine values: the log is not a general audit log (issues/13).
        event: "revise",
        fromState: "Approved",
        toState: "Revising",
        actor: { netid: WHO.itpDirector, displayName: "PR Example" },
        subject: null,
        reason: "The credits were wrong.",
        at: expect.any(String),
      },
    ]);
  });

  test("a netid the directory does not know lands on a history line, with no name", async () => {
    await aDirectorTheDirectoryDoesNotKnow();
    await writeToClasses((open) =>
      applyTransition(
        open,
        { machine: "course", id: course.physicalComputing },
        { type: "revise" },
        WHO.ghost,
      ),
    );

    const page = await open(course.physicalComputing, AS.netid);
    // Never dropped and never an error: the log keeps a netid forever and the NYU
    // feed can stop knowing the person (issues/9, issues/69).
    expect(page.history?.moves[0]!.actor).toEqual({ netid: WHO.ghost, displayName: null });
  });

  test("student and advisor get no history section at all — absent, not empty", async () => {
    for (const netid of [WHO.student, WHO.advisor]) {
      const page = await open(course.physicalComputing, netid);
      expect(page.history).toBeNull();
      // The rail's *last changed* box is the same class of fact and goes with it,
      // so nothing about who touched the record reaches a Tier 2 reader.
      expect(page.lastChanged).toBeNull();
      expect(page.actions).toBeNull();
      expect(page.edit).toBeNull();
    }
  });

  test("nothing the history section hides reaches a Tier 2 reader in the payload", async () => {
    await writeToClasses((open) =>
      applyTransition(
        open,
        { machine: "course", id: course.physicalComputing },
        { type: "revise", reason: "A reason a student may not read." },
        WHO.itpDirector,
      ),
    );

    const asStudent = JSON.stringify(await open(course.physicalComputing, WHO.student));
    expect(asStudent).not.toContain("A reason a student may not read.");
    expect(asStudent).not.toContain("revise");
  });

  // --- Last changed ----------------------------------------------------------

  test("never changed is a fact the page states, and an edit is the only trace of itself", async () => {
    // A course nothing has written to since the `approve` that minted it. Physical
    // Computing is not that course — the world builder gave it a requirement
    // category, and a field write is exactly what this box exists to show.
    expect((await open(course.neverOffered, AS.netid)).lastChanged).toBeNull();

    await writeToClasses((open) =>
      applyTransition(
        open,
        { machine: "course", id: course.physicalComputing },
        { type: "revise" },
        WHO.itpDirector,
      ),
    );
    await writeToClasses((open) =>
      writeFields(
        open,
        {
          record: { machine: "course", id: course.physicalComputing },
          columns: { "course.title": "A course under a corrected name" },
        },
        WHO.itpDirector,
      ),
    );

    const page = await open(course.physicalComputing, AS.netid);
    expect(page.lastChanged).toEqual({
      by: { netid: WHO.itpDirector, displayName: "PR Example" },
      at: expect.any(String),
    });
    // issues/17 deleted the transition a field write used to fire, so the title
    // change is in the stamp and **nowhere in the log** — which is what makes the
    // stamp worth a box of its own.
    expect(page.history?.moves.map((move) => move.event)).toEqual(["revise"]);
  });

  // --- The unassignable course ----------------------------------------------

  test("an unassignable course names which half of the assignment is missing", async () => {
    expect((await open(course.unassignable, AS.netid)).notOfferableYet).toEqual({
      missingArea: true,
      missingAreaHead: true,
    });
    // Half missing is a real state with its own answer, because area and head are
    // separate assignments (issues/32, issues/43).
    expect((await open(course.headless, AS.netid)).notOfferableYet).toEqual({
      missingArea: false,
      missingAreaHead: true,
    });
  });

  // --- The permitted-action set ----------------------------------------------

  test("lists every move the machine offers, and none it does not", async () => {
    expect(events(await open(course.physicalComputing, AS.netid))).toEqual(["revise", "retire"]);

    await writeToClasses((open) =>
      applyTransition(
        open,
        { machine: "course", id: course.physicalComputing },
        { type: "revise" },
        WHO.itpDirector,
      ),
    );
    expect(events(await open(course.physicalComputing, AS.netid))).toEqual(["approve", "retire"]);
  });

  test("the retire invariant carries the writer's own sentence, and lists what blocks it", async () => {
    const refused = refusalFor(await open(course.liveWeb, AS.netid), "retire");

    expect(refused.sentence).toBe("This course has 3 classes that have not finished teaching.");
    // The list **is** the refusal's content, so it is ordered — two orderings of
    // the same rows are two refusals as far as a reader is concerned (issues/38).
    expect(refused.dependencies).toEqual([
      `${world.termCode} — Accepted`,
      `${world.termCode} — Slated`,
      `${world.laterTermCode} — Slated`,
    ]);
  });

  test("a refusal names the person or the role, never the rule", async () => {
    const refused = refusalFor(await open(course.physicalComputing, WHO.coordinator), "revise");
    expect(refused.sentence).toBe(
      "Only ITP's program director or this course's area head can revise this course.",
    );
    expect(refused.dependencies).toEqual([]);
  });

  test("no actions and no refusals for an actor who can never act", async () => {
    for (const netid of [WHO.student, WHO.advisor]) {
      expect((await open(course.physicalComputing, netid)).actions).toBeNull();
    }
    for (const netid of [WHO.itpDirector, WHO.areaHead, WHO.coordinator, WHO.instructor, WHO.chair]) {
      expect((await open(course.physicalComputing, netid)).actions).not.toBeNull();
    }
  });

  // --- The edit affordance ---------------------------------------------------

  test("the affordance is the three field classes a course has, and the count is actor-shaped", async () => {
    // Three since issues/106 classified `course_requirement_category`, which took
    // the page from two sections to three without anybody editing a screen.
    const asDirector = (await open(course.physicalComputing, AS.netid)).edit!;
    expect([...asDirector.open, ...asDirector.refused.map((one) => one.fieldClass)].sort()).toEqual([
      "Course assignment",
      "Course body",
      "Course requirement categories",
    ]);

    // `Approved` shuts the body — the state asserts the body was approved, so
    // editing it must be confined to `Revising` or `revise` asserts nothing. The
    // director keeps the two state-blind classes.
    expect(asDirector.open).toEqual(["Course assignment", "Course requirement categories"]);
    expect(asDirector.refused).toEqual([
      {
        fieldClass: "Course body",
        notYours: null,
        notNow: {
          sentence:
            "Course body can only be changed while the course is Revising; this one is Approved.",
          dependencies: [],
        },
      },
    ]);
  });

  test("two refusals per class, not one, where both predicates fail", async () => {
    // IMA's director is neither this course's director nor its area head, and the
    // course is `Approved`: the body is refused on **both** counts, and stating
    // one would hide the wall the reader walks into next (issues/28, issues/62).
    const edit = (await open(course.physicalComputing, WHO.imaDirector)).edit!;
    expect(edit.open).toEqual([]);

    const body = edit.refused.find((one) => one.fieldClass === "Course body")!;
    expect(body.notYours?.sentence).toBe(
      "Only ITP's program director or this course's area head can change this record's course body.",
    );
    expect(body.notNow?.sentence).toBe(
      "Course body can only be changed while the course is Revising; this one is Approved.",
    );
  });

  test("the chair is one clause ahead of Not yours and never ahead of Not now", async () => {
    const edit = (await open(course.physicalComputing, WHO.chair)).edit!;

    // The chair gets the `Edit` control on an `Approved` course…
    expect(edit.open).toEqual(["Course assignment", "Course requirement categories"]);
    // …and the body section is still absent from it, because a state gate names
    // no actor and is therefore an invariant (issues/34, issues/62).
    const body = edit.refused.find((one) => one.fieldClass === "Course body")!;
    expect(body.notYours).toBeNull();
    expect(body.notNow).not.toBeNull();
  });

  test("the area head's affordance is the body alone, and only once revising", async () => {
    expect((await open(course.physicalComputing, WHO.areaHead)).edit!.open).toEqual([]);

    await writeToClasses((open) =>
      applyTransition(
        open,
        { machine: "course", id: course.physicalComputing },
        { type: "revise" },
        WHO.itpDirector,
      ),
    );

    // A head heads an *area*: the body opens, the assignment and the categories
    // stay the director's (issues/32, issues/106).
    expect((await open(course.physicalComputing, WHO.areaHead)).edit!.open).toEqual(["Course body"]);
  });

  // --- The round trips -------------------------------------------------------

  test("three classes statements and one people statement, and the log is not read for Tier 2", async () => {
    const facts = await cost(() => getActorFacts(AS.netid));
    const studentFacts = await cost(() => getActorFacts(WHO.student));

    const asDirector = await cost(() => getCoursePage(String(course.liveWeb), AS));
    expect(subtract(asDirector, facts)).toEqual({ classes: 3, people: 1 });

    // A `student` gets no history section, so the log is not read at all: a query
    // issued for them would buy a round trip to build something nobody may read.
    const asStudent = await cost(() =>
      getCoursePage(String(course.liveWeb), { netid: WHO.student }),
    );
    expect(subtract(asStudent, studentFacts)).toEqual({ classes: 2, people: 1 });
  });

  // --- The property the whole set exists for --------------------------------

  test(
    "the permitted set on the page is exactly what the write path accepts from that actor",
    async () => {
      const actors = [
        WHO.itpDirector,
        WHO.imaDirector,
        WHO.areaHead,
        WHO.coordinator,
        WHO.instructor,
        WHO.chair,
      ];
      // Two courses, and the two that differ: one whose `retire` is free, and one
      // held down by three live classes, so the invariant is exercised from both
      // sides against every route in the Course matrix.
      const covered = [course.physicalComputing, course.liveWeb];

      for (const netid of actors) {
        for (const courseId of covered) {
          const page = await open(courseId, netid);
          for (const action of page.actions ?? []) {
            const asked = { netid, courseId, event: action.event };
            expect({
              ...asked,
              accepted: await wouldAccept(netid, courseId, action.event),
            }).toEqual({ ...asked, accepted: action.permitted });
          }
        }
      }
    },
    // Every probe is a real transaction against a real pooler, and there are two
    // dozen of them.
    120_000,
  );
});

// ---------------------------------------------------------------------------
// The world this reads
// ---------------------------------------------------------------------------

type Catalog = {
  /** ITP, `Approved`, both tag sets, two sections this term. */
  physicalComputing: Id;
  physicalComputingReview: Id;
  /** ITP, three live sections across two terms, so `retire` is held down. */
  liveWeb: Id;
  /** ITP, never offered in any term. */
  neverOffered: Id;
  /** ITP, no area and no head — both halves of the assignment missing. */
  unassignable: Id;
  /** ITP, an area but no head — the half-missing state. */
  headless: Id;
};

async function aCatalog(world: World): Promise<Catalog> {
  const physical = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
  const liveWeb = await mintCourse(world, { courseNumber: "ITPG-GT 2048" });
  const neverOffered = await mintCourse(world, { courseNumber: "ITPG-GT 3080" });
  const unassignable = await mintCourse(world, {
    courseNumber: "ITPG-GT 4000",
    withArea: false,
    withAreaHead: false,
  });
  const headless = await mintCourse(world, {
    courseNumber: "ITPG-GT 4001",
    withAreaHead: false,
  });

  // What the course counts toward — the third field class, and the tag set
  // issues/106 gave a writer.
  await writeToClasses((open) =>
    writeFields(
      open,
      {
        record: { machine: "course", id: physical.courseId },
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

  // Physical Computing: two sections in the earlier term, neither of them live,
  // so its own `retire` is free.
  const killed = await slateOffering(world, physical.courseId, { sectionNumber: "1" });
  await driveOffering(killed, [{ type: "kill", by: WHO.itpDirector }]);
  const declined = await slateOffering(world, physical.courseId, { sectionNumber: "2" });
  await driveOffering(declined, [
    { type: "staff", netid: WHO.instructor, by: WHO.itpDirector },
    { type: "offer", by: WHO.coordinator },
    { type: "decline", by: WHO.instructor },
  ]);

  // Live Web: two sections this term and one in the next, all three live, so
  // `retire` is refused and its dependency list spans two terms.
  const accepted = await slateOffering(world, liveWeb.courseId, { sectionNumber: "1" });
  await driveOffering(accepted, [
    { type: "staff", netid: WHO.areaHead, by: WHO.itpDirector },
    { type: "offer", by: WHO.coordinator },
    { type: "accept", by: WHO.areaHead },
  ]);
  await slateOffering(world, liveWeb.courseId, { sectionNumber: "2" });
  await slateOffering(world, liveWeb.courseId, {
    sectionNumber: "1",
    termCode: world.laterTermCode,
  });

  return {
    physicalComputing: physical.courseId,
    physicalComputingReview: physical.reviewId,
    liveWeb: liveWeb.courseId,
    neverOffered: neverOffered.courseId,
    unassignable: unassignable.courseId,
    headless: headless.courseId,
  };
}

/**
 * A proposal **two programs are reading**, with ITP's review approved and IMA's
 * still in play — the shape `course.minted_from_review_id` exists to make
 * legible (issues/7, issues/42). The mint copies the body, so the two are free
 * to diverge from the moment the first `approve` lands.
 */
async function aSharedProposal(world: World): Promise<{ courseId: Id; imaReviewId: Id }> {
  const { proposalId, reviewIds } = await writeToClasses((open) =>
    createProposal(
      open,
      {
        title: "A course two programs are reading",
        description: "Written by the world builder.",
        credits: 4,
        programs: ["ITP", "IMA"],
      },
      WHO.instructor,
    ),
  );

  const [itpReviewId, imaReviewId] = reviewIds as readonly Id[];

  await writeToClasses((open) =>
    writeFields(
      open,
      {
        record: { machine: "course_proposal_review", id: itpReviewId! },
        columns: { "course_proposal_review.area_head": WHO.areaHead },
        rows: [
          {
            table: "course_proposal_review_area",
            op: "insert",
            values: { area_id: world.itpAreaId },
          },
        ],
      },
      WHO.itpDirector,
    ),
  );

  await writeToClasses((open) =>
    applyTransition(
      open,
      { machine: "course_proposal_review", id: itpReviewId! },
      { type: "approve", courseNumber: "ITPG-GT 5000" },
      WHO.itpDirector,
    ),
  );

  const [minted] = await classesDb().execute<{ course_id: number }>(
    sql`SELECT course_id FROM course WHERE minted_from_review_id = ${itpReviewId}`,
  );

  return { courseId: Number(minted!.course_id), imaReviewId: imaReviewId! };
}

/**
 * A second ITP director whom `people` has never heard of.
 *
 * The transition writer checks a netid against the directory nowhere — that check
 * belongs to the roster classes, where a name is what a section is waiting on
 * (issues/9) — so a real grant is all it takes to put an unresolvable netid on a
 * history line. That is the state issues/41 named and issues/69 confirmed is
 * reachable in production: the log keeps a netid forever, and the NYU feed can
 * stop knowing the person.
 */
function aDirectorTheDirectoryDoesNotKnow(): Promise<void> {
  return writeToClasses((open) =>
    writeFields(
      open,
      {
        record: { authorization: true },
        rows: [
          { table: "user_role", op: "insert", values: { netid: WHO.ghost, role: "program_director" } },
          {
            table: "program_director",
            op: "insert",
            values: { program_code: "ITP", netid: WHO.ghost },
          },
        ],
      },
      WHO.chair,
    ),
  );
}

// ---------------------------------------------------------------------------
// Asking the writer the same question the page answered
// ---------------------------------------------------------------------------

/** Thrown to roll the probe back once the writer has already said yes. */
class Rollback extends Error {}

/**
 * **Would `applyTransition` accept this?** — asked by calling it and then
 * throwing, so the answer is the writer's own and the world is unchanged.
 *
 * A `WriteRefused` is a no. Reaching the sentinel is a yes, and it means the
 * writer got past machine legality, the invariants and the permission term with
 * every row locked, which is the whole of what the page claimed.
 */
async function wouldAccept(
  actor: string,
  courseId: Id,
  event: CourseEventName,
): Promise<boolean> {
  try {
    await writeToClasses(async (open) => {
      await applyTransition(open, { machine: "course", id: courseId }, { type: event } as CourseEvent, actor);
      throw new Rollback();
    });
  } catch (thrown) {
    if (thrown instanceof Rollback) return true;
    if (thrown instanceof WriteRefused) return false;
    throw thrown;
  }
  throw new Error("The probe committed, which it must not.");
}

// ---------------------------------------------------------------------------
// Counting the round trips
// ---------------------------------------------------------------------------

type Trips = { classes: number; people: number };

async function cost(body: () => Promise<unknown>): Promise<Trips> {
  const before = { ...trips };
  await body();
  return { classes: trips.classes - before.classes, people: trips.people - before.people };
}

function subtract(total: Trips, part: Trips): Trips {
  return { classes: total.classes - part.classes, people: total.people - part.people };
}

// ---------------------------------------------------------------------------
// Reading the page
// ---------------------------------------------------------------------------

async function open(courseId: Id, netid: string): Promise<CoursePage> {
  const read = await getCoursePage(String(courseId), { netid });
  if (!read.visible) throw new Error(`Course ${courseId} was refused to ${netid}.`);
  return read.page;
}

function sectionCount(page: CoursePage): number {
  return page.sections.reduce((total, group) => total + group.offerings.length, 0);
}

function events(page: CoursePage): CourseEventName[] {
  return (page.actions ?? []).map((action) => action.event);
}

function refusalFor(page: CoursePage, event: CourseEventName) {
  const action = (page.actions ?? []).find((one) => one.event === event);
  if (!action || action.permitted) throw new Error(`${event} was not refused.`);
  return action.refusal;
}
