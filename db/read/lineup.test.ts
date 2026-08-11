/**
 * **Seam 2 — `getLineupPage`** (issues/74, issues/82).
 *
 * A test here asserts external behaviour at the seam: given a small world and an
 * actor, calling the read module returns these groups, these rows, this
 * permitted-action set and this refusal. It never reaches for a private helper and
 * never asserts the shape of a query.
 *
 * Four properties are the ticket's, and none is provable by reading the module:
 *
 *   * **the stitch costs exactly two round trips, whatever the page's size.** Both
 *     handles are wrapped and counted, and the actor's facts — which are `cache()`d
 *     and shared with every other read on a page — are *measured* and subtracted
 *     rather than waved away.
 *   * **the read tiers narrow the row set, and invisible rows are absent rather
 *     than flagged** — including a course whose every section is invisible, which
 *     does not render as an empty group.
 *   * **the lead is whoever holds position 0, and a gap at 0 is reported as one.**
 *     The gap is produced here the way the machine produces it: by driving a real
 *     `decline` over a section that has a co-instructor.
 *   * **the permitted-action set matches what the write path will actually accept
 *     from that actor.** `wouldAccept` calls `applyTransition` for real and rolls
 *     the transaction back, so the comparison is against the writer's own answer
 *     rather than against a second copy of the rules written to make the test pass.
 *
 * It runs against a **real** database pair, like Seam 1 and for the same reason.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { peopleDb } from "@/db/handles";
import { person } from "@/db/people/schema";
import { applyTransition, type OfferingEvent } from "@/db/write/apply-transition";
import { WriteRefused } from "@/db/write/refusal";
import {
  AN_INTENSIVE,
  ASYNCHRONOUS,
  DATABASES_CONFIGURED,
  driveOffering,
  freshWorld,
  mintCourse,
  seatCoInstructor,
  shareSeats,
  slateOffering,
  WHO,
  type World,
} from "@/db/write/test-world";
import { writeToClasses, type Id } from "@/db/write/transaction";
import { writeFields } from "@/db/write/write-fields";
import { COMMITTED_STATES, type OfferingState } from "@/lib/machines/offering.machine";
import { rosterShape } from "@/lib/roster";

import { getActorFacts } from "./actor-facts";
import {
  getLineupPage,
  leadOf,
  listLineupTerms,
  type LineupFilters,
  type LineupGroup,
  type LineupRow,
  type OfferingEventName,
} from "./lineup";

/**
 * **The round-trip counter.** `db/read/lineup.ts` reaches `db/handles.ts` through
 * this mock, so every query either side of the project boundary increments a
 * counter — including one added later, and including one inside a helper the module
 * borrows. Each call to a handle is one statement, so the count *is* the count of
 * round trips.
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

describe.skipIf(!DATABASES_CONFIGURED)("getLineupPage", () => {
  let world: World;
  let lineup: Lineup;

  beforeEach(async () => {
    world = await freshWorld();
    lineup = await aLineup(world);
  });

  // --- The groups and the rows ---------------------------------------------

  test("groups on course and term, with the course's facts stated once on the group", async () => {
    const groups = await getLineupPage(AS, allOf(world));

    expect(numbersIn(groups)).toEqual([
      lineup.liveWeb.courseNumber,
      lineup.physicalComputing.courseNumber,
      lineup.sensors.courseNumber,
    ]);

    const physical = groupFor(groups, lineup.physicalComputing.courseNumber);
    expect(physical).toMatchObject({
      courseId: String(lineup.physicalComputing.courseId),
      title: "A course numbered ITPG-GT 2233",
      credits: 4,
      // Course-level, stated on the header and nowhere else.
      areas: [{ name: "Physical Computing" }],
      requirementCategories: [{ name: "Core" }],
      sectionCount: 2,
    });

    // And what a section row carries is only what differs between siblings — no
    // course number, no title, no credits, no term, no program.
    expect(Object.keys(physical.sections[0]!).sort()).toEqual([
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

  test("sections arrive in section-number order within their group", async () => {
    const groups = await getLineupPage(AS, allOf(world));
    expect(
      groupFor(groups, lineup.liveWeb.courseNumber).sections.map((one) => one.sectionNumber),
    ).toEqual(["1", "2", "3"]);
  });

  test("is scoped to the selected term, and the picker offers every term", async () => {
    const fall = await getLineupPage(AS, allOf(world));
    expect(numbersIn(fall)).not.toContain(lineup.videoSketchbook.courseNumber);

    const spring = await getLineupPage(AS, allOf(world, { termCode: world.laterTermCode }));
    expect(numbersIn(spring)).toEqual([lineup.videoSketchbook.courseNumber]);

    // Newest first, and **every** term whether or not it holds anything: *a term
    // with no offerings* is one of this view's two empty states, and a picker
    // listing only populated terms could never reach it.
    expect(await listLineupTerms()).toEqual([
      { code: world.emptyTermCode, year: 2026, semester: "Summer" },
      { code: world.laterTermCode, year: 2026, semester: "Spring" },
      { code: world.termCode, year: 2025, semester: "Fall" },
    ]);
  });

  test("a term with no offerings and a view filtered to nothing are the same answer here", async () => {
    // Both are no groups. **Which of the two a reader is looking at is the page's
    // to say**, from whether any filter is set — the module knows the term it was
    // asked about and nothing about what the reader clicked. There is no third
    // empty state, and in particular no empty group (issues/37).
    expect(await getLineupPage(AS, allOf(world, { termCode: world.emptyTermCode }))).toEqual([]);
    expect(await getLineupPage(AS, allOf(world, { search: "nothing matches this" }))).toEqual([]);
    expect(await getLineupPage(AS, allOf(world, { programCode: "IMA" }))).toEqual([]);
    expect(await getLineupPage(AS, allOf(world, { status: ["Concluded"] }))).toEqual([]);
  });

  test("narrows by program and by state", async () => {
    // Creative Coding is IMA and has no sections anywhere, so narrowing to IMA is
    // empty rather than a group with nothing in it.
    expect(await getLineupPage(AS, allOf(world, { programCode: "IMA" }))).toEqual([]);
    expect(numbersIn(await getLineupPage(AS, allOf(world, { programCode: "ITP" })))).toHaveLength(3);

    // *Who still needs an instructor?* is a status filter and not an anti-join,
    // which is what making occupancy a state bought (issues/15).
    const slated = await getLineupPage(AS, allOf(world, { status: ["Slated"] }));
    expect(sectionsIn(slated).map((one) => one.offeringId)).toEqual([String(lineup.slated)]);
  });

  test("searches title, number, instructor netid and instructor name", async () => {
    const byNumber = await getLineupPage(AS, allOf(world, { search: "GT 2233" }));
    expect(numbersIn(byNumber)).toEqual([lineup.physicalComputing.courseNumber]);
    // A number match keeps **every** section of the course, because the text a
    // section is matched against includes its course's.
    expect(sectionsIn(byNumber)).toHaveLength(2);

    const byTitle = await getLineupPage(AS, allOf(world, { search: "numbered ITPG-GT 2048" }));
    expect(numbersIn(byTitle)).toEqual([lineup.liveWeb.courseNumber]);

    // The netid half is an ordinary `classes`-side fact, and it reaches the one
    // roster entry the directory cannot name — which is the point: a person with no
    // name on file is still findable by the identifier that is really theirs.
    const byNetid = await getLineupPage(AS, allOf(world, { search: WHO.ghost }));
    expect(sectionsIn(byNetid).map((one) => one.offeringId)).toEqual([String(lineup.staffed)]);

    // The name half lives in the other project entirely, and reaches every section
    // that person is on, lead or co-instructor.
    const byName = await getLineupPage(AS, allOf(world, { search: "NA Example" }));
    expect(sectionsIn(byName).map((one) => one.offeringId).sort()).toEqual(
      [String(lineup.offered), String(lineup.accepted), String(lineup.declined)].sort(),
    );
  });

  // --- The stitch -----------------------------------------------------------

  test("the stitch is exactly two round trips, and neither grows with the page", async () => {
    // The actor's facts are `cache()`d and shared with every read module rendering
    // on one page, so they are not this page's cost. Measured rather than assumed,
    // because a claim about a count is worth nothing if part of the count is a
    // guess.
    const facts = await cost(() => getActorFacts(AS.netid));
    expect(facts.people).toBe(0);

    // Three courses, six sections, four people.
    const wholeTerm = await cost(() => getLineupPage(AS, allOf(world)));
    expect(subtract(wholeTerm, facts)).toEqual({ classes: 1, people: 1 });

    // One course, one section, one person — and the same two round trips.
    const oneSection = await cost(() => getLineupPage(AS, allOf(world, { status: ["Accepted"] })));
    expect(subtract(oneSection, facts)).toEqual({ classes: 1, people: 1 });
  });

  test("a roster entry whose netid the directory does not know renders anyway, with no name", async () => {
    const groups = await getLineupPage(AS, allOf(world));

    // Never dropped: an offering sitting in `Staffed` with an empty roster would be
    // a cosmetic problem masquerading as the lifecycle being broken (issues/9).
    expect(rosterOf(groups, lineup.physicalComputing.courseNumber, "2")).toEqual([
      { position: 0, netid: WHO.ghost, displayName: null },
    ]);

    // And the resolvable ones resolve, so the null above is the directory's answer
    // rather than a stitch that fetched nothing.
    expect(rosterOf(groups, lineup.liveWeb.courseNumber, "1")).toEqual([
      { position: 0, netid: WHO.areaHead, displayName: "NA Example" },
    ]);
  });

  // --- The lead is position 0 ------------------------------------------------

  test("the lead is whoever holds position 0, never the first element", async () => {
    const roster = rosterOf(
      await getLineupPage(AS, allOf(world)),
      lineup.physicalComputing.courseNumber,
      "1",
    );

    expect(roster.map((one) => one.position)).toEqual([0, 1]);
    expect(leadOf(roster)?.netid).toBe(WHO.instructor);
    expect(rosterShape(roster)).toMatchObject({ kind: "led" });
  });

  test("a section holding rows below a vacant position 0 is reported as one", async () => {
    // The shape the machine's own edges produce: `decline` DELETEs position 0 and
    // leaves everything below it (issues/61).
    await driveOffering(lineup.declined, [{ type: "decline", by: WHO.itpDirector }]);

    const roster = rosterOf(
      await getLineupPage(AS, allOf(world)),
      lineup.liveWeb.courseNumber,
      "2",
    );

    expect(roster.map((one) => one.position)).toEqual([1]);
    // `roster[0]` would report the co-instructor as the lead. `leadOf` reports the
    // truth, and `rosterShape` makes the gap its own case rather than *empty*.
    expect(leadOf(roster)).toBeUndefined();
    expect(rosterShape(roster)).toEqual({
      kind: "leaderless",
      others: [{ position: 1, netid: WHO.areaHead, displayName: "NA Example" }],
    });
  });

  // --- The three meeting kinds ---------------------------------------------

  test("the three meeting kinds arrive discriminated, never as nullable columns", async () => {
    const groups = await getLineupPage(AS, allOf(world));

    expect(sectionFor(groups, lineup.physicalComputing.courseNumber, "1").meetings).toEqual([
      { kind: "weekly", dayOfWeek: 1, startTime: "18:30", endTime: "21:00", room: "370J" },
    ]);

    expect(sectionFor(groups, lineup.liveWeb.courseNumber, "1").meetings).toEqual([
      { kind: "async" },
    ]);

    const spring = await getLineupPage(AS, allOf(world, { termCode: world.laterTermCode }));
    expect(sectionFor(spring, lineup.videoSketchbook.courseNumber, "1").meetings).toEqual([
      {
        kind: "dates",
        startDate: "2026-01-05",
        endDate: "2026-01-16",
        startTime: "10:00",
        endTime: "16:00",
        room: "370J-Commons",
      },
    ]);
  });

  // --- Seat sharing ---------------------------------------------------------

  test("a foreign tag carries the other program's name and who granted it", async () => {
    const groups = await getLineupPage(AS, allOf(world));

    expect(sectionFor(groups, lineup.physicalComputing.courseNumber, "1").foreignTags).toEqual([
      {
        programCode: "IMA",
        name: "Elective",
        // Stitched like a roster entry: issues/40 found the chip had been rendering
        // without one, hiding the only cross-program act in the system behind the
        // one control designed to be read at a glance.
        grantedBy: { netid: WHO.imaDirector, displayName: "RC Example" },
        grantedAt: expect.any(String),
      },
    ]);

    // A section sharing no seats carries none, and the group's own tags are not
    // foreign tags: every program name the Lineup renders is a grant.
    expect(sectionFor(groups, lineup.liveWeb.courseNumber, "1").foreignTags).toEqual([]);
  });

  // --- The read tiers -------------------------------------------------------

  test("a student sees the committed states and nothing else", async () => {
    const asStudent = sectionsIn(await getLineupPage({ netid: WHO.student }, allOf(world)));
    expect(asStudent.length).toBeGreaterThan(0);

    for (const section of asStudent) {
      expect(COMMITTED_STATES as readonly string[]).toContain(section.status);
    }

    // The department's staffing process is six states, and none of them is here —
    // not greyed, not counted, not mentioned.
    const asDirector = sectionsIn(await getLineupPage(AS, allOf(world)));
    expect(asDirector.length).toBeGreaterThan(asStudent.length);
  });

  test("an invisible section is absent rather than flagged", async () => {
    const before = sectionsIn(await getLineupPage({ netid: WHO.student }, allOf(world)));
    expect(before.map((one) => one.offeringId)).toContain(String(lineup.accepted));

    // A class that was accepted and is then declined leaves `COMMITTED_STATES`. It
    // must not reappear as a marker, a placeholder or a count: a section vanishing
    // from one state and showing a flag in another leaks the decline by its absence.
    await driveOffering(lineup.accepted, [{ type: "decline", by: WHO.itpDirector }]);

    const after = await getLineupPage({ netid: WHO.student }, allOf(world));
    expect(sectionsIn(after).map((one) => one.offeringId)).not.toContain(String(lineup.accepted));
    expect(JSON.stringify(after)).not.toContain("Declined");
  });

  test("a course whose every section is invisible does not render as an empty group", async () => {
    const asStudent = await getLineupPage({ netid: WHO.student }, allOf(world));

    // Physical Computing has two sections this term and neither is committed, so the
    // course is absent entirely. An empty group would announce that the department
    // is staffing something the student may not see.
    expect(numbersIn(asStudent)).not.toContain(lineup.physicalComputing.courseNumber);
    expect(asStudent.every((group) => group.sections.length > 0)).toBe(true);
    // And the count on the header is the count of what is actually there, so it
    // cannot announce the difference either.
    expect(asStudent.every((group) => group.sectionCount === group.sections.length)).toBe(true);
  });

  test("the Actions column is absent, not empty, for an actor who can never act", async () => {
    const asStudent = sectionsIn(await getLineupPage({ netid: WHO.student }, allOf(world)));
    expect(asStudent.length).toBeGreaterThan(0);
    expect(asStudent.every((one) => one.actions === null)).toBe(true);

    for (const netid of [WHO.itpDirector, WHO.areaHead, WHO.coordinator, WHO.instructor, WHO.chair]) {
      const groups = await getLineupPage({ netid }, allOf(world));
      expect(sectionsIn(groups).every((one) => one.actions !== null)).toBe(true);
    }
  });

  // --- The ⋯ n menu ---------------------------------------------------------

  test("lists every exposed move the machine offers from the state, permitted or not", async () => {
    const groups = await getLineupPage(AS, allOf(world));

    // `staff` and `unstaff` are never user-facing, so they are absent from the set
    // rather than greyed inside it: a row cannot offer a move whose Server Action
    // may not name it.
    expect(events(sectionFor(groups, lineup.liveWeb.courseNumber, "3"))).toEqual(["kill"]);
    expect(events(sectionFor(groups, lineup.physicalComputing.courseNumber, "2"))).toEqual([
      "offer",
      "kill",
    ]);
    expect(events(sectionFor(groups, lineup.physicalComputing.courseNumber, "1"))).toEqual([
      "accept",
      "decline",
      "defer",
      "withdraw",
    ]);
  });

  test("a final state carries no menu rather than an empty one", async () => {
    await driveOffering(lineup.slated, [{ type: "kill", by: WHO.itpDirector }]);
    const groups = await getLineupPage(AS, allOf(world));
    expect(events(sectionFor(groups, lineup.liveWeb.courseNumber, "3"))).toEqual([]);
  });

  test("the count is the moves this actor can actually make", async () => {
    const offered = { course: lineup.physicalComputing.courseNumber, section: "1" };
    const theLeadsThree = ["accept", "decline", "defer"];

    // The lead reaches the lead's three answers and nothing else.
    expect(await permittedEvents(world, WHO.instructor, offered)).toEqual(theLeadsThree);
    // A coordinator is a proxy for all three — a refusal arriving by email is
    // routinely clicked by an admin — but retraction is the director's.
    expect(await permittedEvents(world, WHO.coordinator, offered)).toEqual(theLeadsThree);
    // ITP's director holds every one of them, `withdraw` included.
    expect(await permittedEvents(world, WHO.itpDirector, offered)).toEqual([
      ...theLeadsThree,
      "withdraw",
    ]);
    // IMA's director holds no route into an ITP class.
    expect(await permittedEvents(world, WHO.imaDirector, offered)).toEqual([]);
    // Heading the course's area lets you approve the course, not run its sections —
    // and being a co-instructor at position 1 is not being the lead.
    expect(await permittedEvents(world, WHO.areaHead, offered)).toEqual([]);
    // The chair is one OR-clause ahead of the permission term.
    expect(await permittedEvents(world, WHO.chair, offered)).toEqual([
      ...theLeadsThree,
      "withdraw",
    ]);
  });

  test("a refusal names the person or the role, never the rule", async () => {
    const groups = await getLineupPage({ netid: WHO.areaHead }, allOf(world));
    const refused = refusalFor(
      sectionFor(groups, lineup.physicalComputing.courseNumber, "1"),
      "accept",
    );

    expect(refused.sentence).toBe(
      "Only the lead instructor, a coordinator or ITP's program director can accept this class.",
    );
    expect(refused.dependencies).toEqual([]);
  });

  test("the retry invariant carries the writer's own sentence, and binds the chair", async () => {
    // Sensors' one section is `Declined`, which is not live, so its course can be
    // retired — and `retry` then becomes a contradiction the lifecycle cannot state.
    await writeToClasses((open) =>
      applyTransition(
        open,
        { machine: "course", id: lineup.sensors.courseId },
        { type: "retire" },
        WHO.itpDirector,
      ),
    );

    const section = sectionFor(
      await getLineupPage(AS, allOf(world)),
      lineup.sensors.courseNumber,
      "1",
    );

    expect(events(section)).toEqual(["retry", "kill"]);
    expect(refusalFor(section, "retry").sentence).toBe(
      "This class cannot be revived, because its course has been retired.",
    );
    // An invariant names no actor, so the chair's clause does not reach it — and the
    // writer agrees, which is the whole reason the sentence is shared.
    expect(await wouldAccept(WHO.chair, lineup.declinedAlone, "retry")).toBe(false);
    const asChair = sectionFor(
      await getLineupPage({ netid: WHO.chair }, allOf(world)),
      lineup.sensors.courseNumber,
      "1",
    );
    expect(refusalFor(asChair, "retry").sentence).toBe(refusalFor(section, "retry").sentence);
  });

  // --- The property the whole set exists for --------------------------------

  test(
    "the permitted set on a row is exactly what the write path accepts from that actor",
    async () => {
      const actors = [
        WHO.itpDirector,
        WHO.imaDirector,
        WHO.areaHead,
        WHO.coordinator,
        WHO.instructor,
        WHO.chair,
      ];
      // Three sections, and the three that differ: one `Offered`, where the lead-only
      // routes and the director's `withdraw` are both live; one `Staffed`, where
      // `offer` is the coordinator's; one `Slated`, where the only exposed move is
      // the director's `kill`. Between them every route in the Offering matrix is
      // exercised from both sides. The remaining sections would repeat one of the
      // three at the cost of a transaction each, over a pooler.
      const covered = [String(lineup.offered), String(lineup.staffed), String(lineup.slated)];

      for (const netid of actors) {
        const groups = await getLineupPage({ netid }, allOf(world));

        for (const section of sectionsIn(groups)) {
          if (!covered.includes(section.offeringId)) continue;

          for (const action of section.actions ?? []) {
            const asked = { netid, section: section.offeringId, event: action.event };
            expect({
              ...asked,
              accepted: await wouldAccept(netid, Number(section.offeringId), action.event),
            }).toEqual({ ...asked, accepted: action.permitted });
          }
        }
      }
    },
    // Every probe is a real transaction against a real pooler, and there are
    // forty-odd of them.
    120_000,
  );
});

// ---------------------------------------------------------------------------
// The world this reads
// ---------------------------------------------------------------------------

type Course = { courseId: Id; courseNumber: string };

type Lineup = {
  /** ITP, two sections this term, and the only course carrying tags of either kind. */
  physicalComputing: Course;
  /** ITP, three sections this term — one per read tier and one for the vacant lead. */
  liveWeb: Course;
  /** ITP, one `Declined` section, so its course can be retired under it. */
  sensors: Course;
  /** ITP, one section in the **later** term — the row a term-scoped read must not return. */
  videoSketchbook: Course;
  /** IMA, no sections anywhere, so its group never renders. */
  creativeCoding: Course;

  /** Physical Computing 1 — `Offered`, lead plus a co-instructor, one IMA seat-sharing tag, weekly. */
  offered: Id;
  /** Physical Computing 2 — `Staffed`, led by a netid the directory does not know. */
  staffed: Id;
  /** Live Web 1 — `Accepted`, asynchronous, and the only section a student can see. */
  accepted: Id;
  /** Live Web 2 — `Offered` with a co-instructor, so `decline` leaves a gap at position 0. */
  declined: Id;
  /** Live Web 3 — `Slated`, so the only exposed move is `kill`. */
  slated: Id;
  /** Sensors 1 — already `Declined`, so `retire` on its course is permitted. */
  declinedAlone: Id;
};

async function aLineup(world: World): Promise<Lineup> {
  const physicalComputing = await aCourse(world, "ITPG-GT 2233");
  const liveWeb = await aCourse(world, "ITPG-GT 2048");
  const sensors = await aCourse(world, "ITPG-GT 3080");
  const videoSketchbook = await aCourse(world, "ITPG-GT 2999");
  const creativeCoding = await aCourse(world, "IMNY-UT 105", "IMA");

  // What the course counts toward — the group header's second tag set, and the class
  // issues/106 gave a writer.
  await writeToClasses((open) =>
    writeFields(
      open,
      {
        record: { machine: "course", id: physicalComputing.courseId },
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

  // --- Physical Computing, two sections ------------------------------------

  const offered = await slateOffering(world, physicalComputing.courseId, {
    sectionNumber: "1",
    enrollmentLimit: 18,
    mode: "In person",
  });
  await driveOffering(offered, [
    { type: "staff", netid: WHO.instructor, by: WHO.itpDirector },
    { type: "offer", by: WHO.coordinator },
  ]);
  // A non-gating co-instructor, seated while the section is `Offered`: positions
  // 1..n are written in any state (issues/2, issues/15).
  await seatCoInstructor(offered, WHO.areaHead, 1);
  // IMA's director writing IMA's claim onto ITP's section — the only place in the
  // whole model where a program other than the course's own appears.
  await shareSeats(offered, { categoryId: world.imaCategoryId }, WHO.imaDirector);

  const staffed = await slateOffering(world, physicalComputing.courseId, { sectionNumber: "2" });
  await withGhostInTheDirectory(() =>
    driveOffering(staffed, [{ type: "staff", netid: WHO.ghost, by: WHO.itpDirector }]),
  );

  // --- Live Web, three sections --------------------------------------------

  const accepted = await slateOffering(world, liveWeb.courseId, {
    sectionNumber: "1",
    meetings: [ASYNCHRONOUS],
  });
  await driveOffering(accepted, [
    { type: "staff", netid: WHO.areaHead, by: WHO.itpDirector },
    { type: "offer", by: WHO.coordinator },
    { type: "accept", by: WHO.areaHead },
  ]);

  const declined = await slateOffering(world, liveWeb.courseId, { sectionNumber: "2" });
  await driveOffering(declined, [
    { type: "staff", netid: WHO.instructor, by: WHO.itpDirector },
    { type: "offer", by: WHO.coordinator },
  ]);
  await seatCoInstructor(declined, WHO.areaHead, 1);

  const slated = await slateOffering(world, liveWeb.courseId, { sectionNumber: "3" });

  // --- Sensors, one section, already declined -------------------------------

  const declinedAlone = await slateOffering(world, sensors.courseId);
  await driveOffering(declinedAlone, [
    { type: "staff", netid: WHO.instructor, by: WHO.itpDirector },
    { type: "offer", by: WHO.coordinator },
    { type: "decline", by: WHO.instructor },
  ]);

  // --- Video Sketchbook, in the later term ---------------------------------

  await slateOffering(world, videoSketchbook.courseId, {
    termCode: world.laterTermCode,
    meetings: [AN_INTENSIVE],
  });

  return {
    physicalComputing,
    liveWeb,
    sensors,
    videoSketchbook,
    creativeCoding,
    offered,
    staffed,
    accepted,
    declined,
    slated,
    declinedAlone,
  };
}

async function aCourse(
  world: World,
  courseNumber: string,
  programCode: "ITP" | "IMA" = "ITP",
): Promise<Course> {
  const { courseId } = await mintCourse(world, { courseNumber, programCode });
  return { courseId, courseNumber };
}

/**
 * Put `WHO.ghost` in the directory, seat them, and take them back out again.
 *
 * The writer refuses a netid `people` does not know, and that refusal is **a check
 * and not a constraint** (issues/9, issues/69): the netid lives in the other project
 * and cannot join the transaction, so a window exists between the check and the
 * write. This opens that window deliberately, because the read side's *a roster
 * entry is never dropped for want of a name* needs a row it is true of, and no
 * writer can produce one. Nothing about the row is a lie — the directory simply
 * stopped knowing the person, which is the one thing the two-project topology cannot
 * prevent and the reason `displayName` is nullable at all.
 */
async function withGhostInTheDirectory(body: () => Promise<void>): Promise<void> {
  await peopleDb()
    .insert(person)
    .values({ netid: WHO.ghost, officialFirstname: "GH", officialLastname: "Example" });
  try {
    await body();
  } finally {
    await peopleDb().delete(person).where(eq(person.netid, WHO.ghost));
  }
}

// ---------------------------------------------------------------------------
// Asking the writer the same question the row answered
// ---------------------------------------------------------------------------

/** Thrown to roll the probe back once the writer has already said yes. */
class Rollback extends Error {}

/**
 * **Would `applyTransition` accept this?** — asked by calling it and then throwing,
 * so the answer is the writer's own and the world is unchanged.
 *
 * A `WriteRefused` is a no. Reaching the sentinel is a yes, and it means the writer
 * got past machine legality, the invariants and the permission term with every row
 * locked, which is the whole of what the row claimed.
 */
async function wouldAccept(
  actor: string,
  offeringId: number,
  event: OfferingEventName,
): Promise<boolean> {
  try {
    await writeToClasses(async (open) => {
      await applyTransition(open, { machine: "offering", id: offeringId }, asEvent(event), actor);
      throw new Rollback();
    });
  } catch (thrown) {
    if (thrown instanceof Rollback) return true;
    if (thrown instanceof WriteRefused) return false;
    throw thrown;
  }
  throw new Error("The probe committed, which it must not.");
}

/**
 * A move the row offers, as the writer takes it. The read side names the event and
 * the write side takes the event **and what came with it** — for an Offering that is
 * the optional free-text `reason`, and nothing here has one.
 */
function asEvent(event: OfferingEventName): OfferingEvent {
  return { type: event } as OfferingEvent;
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

function allOf(
  world: World,
  over: {
    termCode?: string;
    search?: string | null;
    programCode?: string | null;
    status?: readonly OfferingState[] | null;
  } = {},
): LineupFilters {
  return {
    termCode: over.termCode ?? world.termCode,
    search: over.search ?? null,
    programCode: over.programCode ?? null,
    status: over.status ?? null,
  };
}

function numbersIn(groups: readonly LineupGroup[]): string[] {
  return groups.map((group) => group.courseNumber);
}

function sectionsIn(groups: readonly LineupGroup[]): LineupRow[] {
  return groups.flatMap((group) => [...group.sections]);
}

function groupFor(groups: readonly LineupGroup[], courseNumber: string): LineupGroup {
  const group = groups.find((one) => one.courseNumber === courseNumber);
  if (!group) throw new Error(`No group for ${courseNumber}.`);
  return group;
}

function sectionFor(
  groups: readonly LineupGroup[],
  courseNumber: string,
  sectionNumber: string,
): LineupRow {
  const section = groupFor(groups, courseNumber).sections.find(
    (one) => one.sectionNumber === sectionNumber,
  );
  if (!section) throw new Error(`No section ${sectionNumber} of ${courseNumber}.`);
  return section;
}

function rosterOf(
  groups: readonly LineupGroup[],
  courseNumber: string,
  sectionNumber: string,
): LineupRow["roster"] {
  return sectionFor(groups, courseNumber, sectionNumber).roster;
}

function events(section: LineupRow): OfferingEventName[] {
  return (section.actions ?? []).map((action) => action.event);
}

async function permittedEvents(
  world: World,
  netid: string,
  where: { course: string; section: string },
): Promise<OfferingEventName[]> {
  const groups = await getLineupPage({ netid }, allOf(world));
  return (sectionFor(groups, where.course, where.section).actions ?? [])
    .filter((action) => action.permitted)
    .map((action) => action.event);
}

function refusalFor(section: LineupRow, event: OfferingEventName) {
  const action = (section.actions ?? []).find((one) => one.event === event);
  if (!action || action.permitted) throw new Error(`${event} was not refused.`);
  return action.refusal;
}
