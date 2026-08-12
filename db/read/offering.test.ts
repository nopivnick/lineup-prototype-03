/**
 * **Seam 2 — `getOfferingPage`** (issues/74, issues/84).
 *
 * A test here asserts external behaviour at the seam: given a small world and an
 * actor, calling the read module returns this record, this roster, this
 * permitted-action set, this edit affordance and this history — or the one
 * not-visible answer. It never reaches for a private helper and never asserts the
 * shape of a query.
 *
 * Five properties are the ticket's, and none is provable by reading the module:
 *
 *   * **the not-visible answer names no state.** Three different worlds reach it
 *     — an address that is not an id, an id that names nothing, and a class this
 *     reader's tier does not reach — and the assertion is `toEqual` against the
 *     bare object, so an answer that carried *anything* to tell them apart would
 *     fail.
 *   * **the same predicate thins the sibling list on the page it refuses from.**
 *     Asserted for **every** seed actor as a set equality between the sections
 *     `getCoursePage` lists and the classes `getOfferingPage` opens, rather than
 *     as two spot checks that happen to agree.
 *   * **`offer` and `accept` name the person they were about**, proved on the
 *     shape that makes it matter: a class offered to one person, withdrawn, and
 *     re-offered to another. The first `offer` names somebody who is not on the
 *     roster at all by the time the page is read.
 *   * **the permitted-action set matches what the write path will accept from
 *     that actor.** `wouldAccept` calls `applyTransition` for real and rolls the
 *     transaction back, so the comparison is against the writer's own answer
 *     rather than against a second copy of the rules written to make the test
 *     pass.
 *   * **the distinct states each render as themselves** — a class with an empty
 *     roster, rows below a vacant position 0, a record with no history, a netid
 *     the directory does not know, and never changed.
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
  A_MEETING,
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

import { getActorFacts } from "./actor-facts";
import { getCoursePage } from "./course";
import { getOfferingPage, type OfferingPage } from "./offering";
import type { OfferingEventName } from "./offering-rows";

/**
 * **The round-trip counter**, the same device `db/read/course.test.ts` uses:
 * `db/read/offering.ts` reaches `db/handles.ts` through this mock, so every query
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

/** Every seat the world holds, which is what *each seed actor* means below. */
const EVERYBODY = [
  WHO.chair,
  WHO.itpDirector,
  WHO.imaDirector,
  WHO.areaHead,
  WHO.instructor,
  WHO.coordinator,
  WHO.student,
  WHO.advisor,
] as const;

describe.skipIf(!DATABASES_CONFIGURED)("getOfferingPage", () => {
  let world: World;
  let classes: Classes;

  beforeEach(async () => {
    world = await freshWorld();
    classes = await aTermOfClasses(world);
  });

  // --- The record -----------------------------------------------------------

  test("hands back the class, its course, its term as a sentence, and the three columns a list has no room for", async () => {
    const page = await open(classes.accepted, AS.netid);

    expect(page).toMatchObject({
      offeringId: String(classes.accepted),
      course: {
        courseId: String(classes.physicalComputing),
        courseNumber: "ITPG-GT 2233",
        title: "A course numbered ITPG-GT 2233",
        credits: 4,
        programCode: "ITP",
      },
      termCode: world.termCode,
      // *Fall 2025* rather than *20253*: `term_code` is a join key and not a thing
      // to put in front of a reader, and the label is built by the one function
      // both sides of a refusal already read (issues/38).
      termLabel: "Fall 2025",
      sectionNumber: "1",
      status: "Accepted",
      // The operational columns the Lineup has no room for and nobody scans a
      // list for, which is exactly why they belong on the record (issues/10).
      callNumber: "10432",
      sisClassNumber: 7781,
      url: "https://itp.nyu.edu/pcomp",
      enrollmentLimit: 18,
      mode: "In person",
    });
  });

  // --- The refusal that names no state ---------------------------------------

  test("the not-visible answer is one answer in one wording, for three different worlds", async () => {
    // An address that is not an id at all — answered without a query.
    expect(await getOfferingPage("not-a-class", AS)).toEqual({ visible: false });
    // And a second address for a record that has exactly one. `/classes/007`
    // rendering the class `/classes/7` does would leave a reader who fired a
    // move from it looking at a page the Server Action revalidated elsewhere.
    expect(await getOfferingPage(`0${classes.accepted}`, AS)).toEqual({ visible: false });
    // An id that names nothing.
    expect(await getOfferingPage(String(classes.accepted + 9_000), AS)).toEqual({ visible: false });
    // A class that exists, in a state this reader's tier does not reach. It is
    // `toEqual` and not `toMatchObject`, so an answer carrying *anything* that
    // told these three apart — a state, a course number, a section — would fail
    // here, which is the whole of the rule (issues/28, issues/41).
    expect(await getOfferingPage(String(classes.offered), { netid: WHO.student })).toEqual({
      visible: false,
    });
    expect(await getOfferingPage(String(classes.offered), { netid: WHO.advisor })).toEqual({
      visible: false,
    });
  });

  test("the same predicate thins the sibling list on the page it refuses from, for every actor", async () => {
    for (const netid of EVERYBODY) {
      const course = await getCoursePage(String(classes.physicalComputing), { netid });
      if (!course.visible) throw new Error(`The course was refused to ${netid}.`);

      const listed = course.page.sections
        .flatMap((group) => group.offerings)
        .map((row) => row.offeringId)
        .sort();

      const opens: string[] = [];
      for (const offeringId of classes.everySection) {
        const read = await getOfferingPage(String(offeringId), { netid });
        if (read.visible) opens.push(String(offeringId));
      }

      // Set equality, both ways: a section the course page lists is a class this
      // page opens, and a class this page opens is a section that page lists. A
      // link that led to a refusal, or a refusal for a class sitting in plain
      // sight on the page it was reached from, would break one half each.
      expect({ netid, opens: opens.sort() }).toEqual({ netid, opens: listed });
      // And the reader who can act sees strictly more than the one who cannot,
      // so the assertion above is not passing on two empty lists.
      if (netid === WHO.itpDirector) expect(listed.length).toBeGreaterThan(1);
    }
  });

  // --- The roster ------------------------------------------------------------

  test("the roster is in position order, the lead holds 0, and a person is presented as a person", async () => {
    const page = await open(classes.accepted, AS.netid);

    expect(page.roster).toEqual([
      // Pronouns are on the shape whether or not this fixture fills them: this is
      // one of the two places a person is presented as a person (issues/40).
      { position: 0, netid: WHO.areaHead, displayName: "NA Example", pronouns: null },
      { position: 2, netid: WHO.instructor, displayName: "DH Example", pronouns: null },
    ]);
  });

  test("rows below a vacant position 0 are preserved, gap and all", async () => {
    const page = await open(classes.leaderless, AS.netid);

    // `decline` `DELETE`d position 0 and left everything under it, so the gap is
    // a shape the machine's own edges produce (issues/61). It is preserved rather
    // than closed: a page that renumbered would report a co-instructor as lead.
    expect(page.roster).toEqual([
      { position: 1, netid: WHO.instructor, displayName: "DH Example", pronouns: null },
    ]);
    expect(page.roster.some((entry) => entry.position === 0)).toBe(false);
    expect(page.status).toBe("Slated");
  });

  test("a class with nothing on its roster comes back empty rather than absent", async () => {
    expect((await open(classes.slated, AS.netid)).roster).toEqual([]);
  });

  test("a netid the directory does not know keeps its seat, with no name", async () => {
    const page = await open(classes.forgotten, AS.netid);

    // Never dropped and never an error: the write path checked the directory at
    // the moment of the `staff`, and the NYU feed can stop knowing somebody who
    // is already on a roster (issues/9, issues/69). Skipping the entry would
    // leave a class sitting in `Staffed` with an empty roster — a cosmetic fault
    // masquerading as the lifecycle being broken.
    expect(page.roster).toEqual([
      { position: 0, netid: WHO.ghost, displayName: null, pronouns: null },
    ]);
    expect(page.status).toBe("Staffed");
  });

  // --- Meetings and seat sharing ---------------------------------------------

  test("meetings render by kind, and the kind is the declared one", async () => {
    const page = await open(classes.threeKinds, AS.netid);

    expect(page.meetings).toEqual([
      { kind: "weekly", dayOfWeek: 1, startTime: "18:30", endTime: "21:00", room: "370J" },
      {
        kind: "dates",
        startDate: "2026-01-05",
        endDate: "2026-01-16",
        startTime: "10:00",
        endTime: "16:00",
        room: "370J-Commons",
      },
      // No time and no room, both of which the shape CHECK enforces as absences
      // rather than as blanks (issues/10).
      { kind: "async" },
    ]);
  });

  test("a class with no meeting pattern is a legal state and not a fourth kind", async () => {
    expect((await open(classes.slated, AS.netid)).meetings).toEqual([]);
  });

  test("a foreign tag carries the other program, the name, and who granted it when", async () => {
    const page = await open(classes.threeKinds, AS.netid);

    // The only cross-program act in the model, and issues/40 found the chip
    // rendering without its granter. The name is stitched, so the four signals
    // the renderer draws have something to draw from.
    expect(page.foreignTags).toEqual([
      {
        programCode: "IMA",
        name: "Media Art",
        grantedBy: { netid: WHO.imaDirector, displayName: "RC Example" },
        grantedAt: expect.any(String),
      },
    ]);
  });

  // --- The history -----------------------------------------------------------

  test("opens with a derived creation line, and a record with no history has only that", async () => {
    const page = await open(classes.slated, AS.netid);

    // issues/13 refused a genesis row, so this line is read off `created_by` /
    // `created_at` on the entity rather than out of the log.
    expect(page.history?.creation).toEqual({
      by: { netid: WHO.itpDirector, displayName: "PR Example" },
      at: expect.any(String),
    });
    expect(page.history?.moves).toEqual([]);
  });

  test("offer and accept name the person they were about, not whoever holds the seat now", async () => {
    const page = await open(classes.reoffered, AS.netid);

    // **The scenario issues/41 amended a closed ticket for.** The class was
    // offered to the plain instructor, withdrawn, staffed again with the area
    // head and accepted by them. The roster is present-tense; the log is not.
    expect(page.history?.moves.map((move) => [move.event, move.subject?.netid ?? null])).toEqual([
      ["staff", WHO.instructor],
      ["offer", WHO.instructor],
      ["withdraw", WHO.instructor],
      ["staff", WHO.areaHead],
      ["offer", WHO.areaHead],
      ["accept", WHO.areaHead],
    ]);

    // And the fact that makes the amendment load-bearing: the first `offer` names
    // somebody who is not on this roster at all. A page reading position 0 would
    // have attributed it to the area head.
    const lead = page.roster.find((entry) => entry.position === 0);
    expect(lead?.netid).toBe(WHO.areaHead);
    expect(page.roster.some((entry) => entry.netid === WHO.instructor)).toBe(false);

    // `actor_netid` is who clicked and stays separate: a refusal or an
    // acceptance arriving by email is routinely clicked by an admin (issues/15).
    const accept = page.history!.moves.find((move) => move.event === "accept")!;
    expect(accept.actor.netid).toBe(WHO.coordinator);
    expect(accept.subject?.netid).toBe(WHO.areaHead);
  });

  test("an event with no subject carries none, which is a fact about the event", async () => {
    const page = await open(classes.deferred, AS.netid);

    // The roster row survives `defer` and position 0 is frozen from `Offered`
    // onward, so the roster still answers who was asked (issues/21, issues/41).
    const deferred = page.history!.moves.find((move) => move.event === "defer")!;
    expect(deferred.subject).toBeNull();
  });

  test("a move lands carrying the machine's own values and its reason", async () => {
    await driveOffering(classes.accepted, [
      { type: "cancel", reason: "Enrolment did not hold.", by: WHO.itpDirector },
    ]);

    const page = await open(classes.accepted, AS.netid);
    expect(page.history?.moves.at(-1)).toEqual({
      // Exactly machine values: the log is not a general audit log (issues/13).
      event: "cancel",
      fromState: "Accepted",
      toState: "Canceled",
      actor: { netid: WHO.itpDirector, displayName: "PR Example" },
      subject: null,
      reason: "Enrolment did not hold.",
      at: expect.any(String),
    });
  });

  test("student and advisor get no history section at all — absent, not empty", async () => {
    for (const netid of [WHO.student, WHO.advisor]) {
      const page = await open(classes.accepted, netid);
      expect(page.history).toBeNull();
      // The rail's *last changed* box is the same class of fact and goes with it,
      // so nothing about who touched the record reaches a Tier 2 reader.
      expect(page.lastChanged).toBeNull();
      expect(page.actions).toBeNull();
      expect(page.edit).toBeNull();
    }
  });

  test("nothing the history section hides reaches a Tier 2 reader in the payload", async () => {
    await driveOffering(classes.accepted, [
      { type: "cancel", reason: "A reason a student may not read.", by: WHO.itpDirector },
    ]);

    const asStudent = JSON.stringify(await open(classes.accepted, WHO.student));
    expect(asStudent).not.toContain("A reason a student may not read.");
    expect(asStudent).not.toContain("cancel");
    // The roster is Tier 1 on a committed class and stays: what is hidden is the
    // record of who acted, not who is teaching.
    expect(asStudent).toContain(WHO.areaHead);
  });

  // --- Last changed ----------------------------------------------------------

  test("never changed is a fact the page states, and a field edit is the only trace of itself", async () => {
    // Nothing has written to this class since the create path made it.
    expect((await open(classes.slated, AS.netid)).lastChanged).toBeNull();

    await writeToClasses((open) =>
      writeFields(
        open,
        {
          record: { machine: "offering", id: classes.slated },
          columns: { "offering.url": "https://itp.nyu.edu/a-class" },
        },
        WHO.coordinator,
      ),
    );

    const page = await open(classes.slated, AS.netid);
    expect(page.lastChanged).toEqual({
      by: { netid: WHO.coordinator, displayName: "CO Example" },
      at: expect.any(String),
    });
    // issues/17 deleted the transition a field write used to fire, so the change
    // is in the stamp and **nowhere in the log** — which is what makes the stamp
    // worth a box of its own, and sharper here than on a course: a room, a cap
    // and a call number are corrected long after the last transition fired.
    expect(page.history?.moves).toEqual([]);
  });

  // --- The permitted-action set ----------------------------------------------

  test("lists every move the machine offers from this state, and none it does not", async () => {
    // `staff` and `unstaff` are absent everywhere: nothing user-facing may name
    // them, and that is inherited from the writer's exclusion list rather than
    // restated (issues/15, issues/28).
    expect(events(await open(classes.slated, AS.netid))).toEqual(["kill"]);
    expect(events(await open(classes.offered, AS.netid))).toEqual([
      "accept",
      "decline",
      "defer",
      "withdraw",
    ]);
    // A final state carries no menu at all rather than fourteen dead controls:
    // the state is not a refusal, it is the shape of the lifecycle.
    expect(events(await open(classes.dead, AS.netid))).toEqual([]);
  });

  test("a refusal names the person or the role, never the rule", async () => {
    // The area head is an instructor and is not this class's lead, so the lead
    // route is the one they miss — which is what the sentence has to name.
    const refused = refusalFor(await open(classes.offered, WHO.areaHead), "accept");
    expect(refused.sentence).toBe(
      "Only the lead instructor, a coordinator or ITP's program director can accept this class.",
    );
    expect(refused.dependencies).toEqual([]);
  });

  test("the retry invariant carries the writer's own sentence rather than a second copy", async () => {
    await driveOffering(classes.retired, [{ type: "kill", by: WHO.itpDirector }]);
    await writeToClasses((open) =>
      applyTransition(
        open,
        { machine: "course", id: classes.retiredCourse },
        { type: "retire" },
        WHO.itpDirector,
      ),
    );

    // A director looking at a revivable class of a retired course is told the
    // course is retired — the thing they can act on — rather than being told the
    // move is theirs, which is the writer's own order of checks (issues/14).
    const refused = refusalFor(await open(classes.declined, AS.netid), "retry");
    expect(refused.sentence).toBe("This class cannot be revived, because its course has been retired.");
  });

  test("no actions and no refusals for an actor who can never act", async () => {
    for (const netid of [WHO.student, WHO.advisor]) {
      expect((await open(classes.accepted, netid)).actions).toBeNull();
    }
    for (const netid of [WHO.itpDirector, WHO.areaHead, WHO.coordinator, WHO.instructor, WHO.chair]) {
      expect((await open(classes.accepted, netid)).actions).not.toBeNull();
    }
  });

  // --- The edit affordance ---------------------------------------------------

  test("the affordance is the three field classes a class has, and the count is actor-shaped", async () => {
    const asDirector = (await open(classes.accepted, AS.netid)).edit!;
    expect(
      [...asDirector.open, ...asDirector.refused.map((one) => one.fieldClass)].sort(),
    ).toEqual(["Offering operational", "Roster — positions 1..n", "Seat-sharing tags"]);

    // **Roster — position 0 is not a field class at all** — `staff` / `unstaff`
    // non-exposure, written by the machine path and never by the field writer, so
    // it surfaces on no rail (issues/15, issues/61).
    expect(asDirector.open).toEqual(["Offering operational", "Roster — positions 1..n"]);

    // The coordinator gets the operational columns and not the roster: seating a
    // second paid instructor commits the department to an appointment in the way
    // reassigning a room does not (issues/61).
    const asCoordinator = (await open(classes.accepted, WHO.coordinator)).edit!;
    expect(asCoordinator.open).toEqual(["Offering operational"]);
  });

  test("the one field class that points away from the record is open to the other program's director", async () => {
    // The scope comes from the *tag's* program and not from the class's, and
    // `writeFields` evaluates the arm once per row against that row's program —
    // so the class's **own** director is refused it and IMA's director is not,
    // because whoever authors the claim writes the row (issues/25, issues/30).
    // A record page holds no row, so the honest question is *is there any tag
    // this actor could write here*.
    const asOwnDirector = (await open(classes.accepted, AS.netid)).edit!;
    const refused = asOwnDirector.refused.find((one) => one.fieldClass === "Seat-sharing tags")!;
    // **Said once**, though the class names two routes — one through `area` and
    // one through `requirement_category` — and with no candidate program both
    // describe the same person. `whoMay` de-duplicates descriptions (issues/84).
    expect(refused.notYours?.sentence).toBe(
      "Only the program's director can change this class's seat sharing.",
    );
    // Every class here is state-blind, so there is no *Not now* anywhere on it.
    expect(refused.notNow).toBeNull();

    const asOtherDirector = (await open(classes.accepted, WHO.imaDirector)).edit!;
    expect(asOtherDirector.open).toEqual(["Seat-sharing tags"]);
  });

  test("the rail's field-class answers are the ones writeFields gives", async () => {
    // **The property `EditAffordance` exists for**, asked of the class whose
    // scope points away from the record — the one shape where a record-level
    // answer could drift from a per-row one. IMA's director is told the tags are
    // theirs and the writer takes the write; ITP's own director is told they are
    // not and the writer throws the same sentence back.
    await expect(shareSeatsOn(classes.accepted, world.imaAreaId, WHO.imaDirector)).resolves.toBe(
      true,
    );
    await expect(shareSeatsOn(classes.accepted, world.imaAreaId, WHO.itpDirector)).resolves.toBe(
      false,
    );

    // **The two sentences differ, and that is the one honest difference between
    // them.** Everywhere else the rail states the writer's sentence verbatim,
    // because both sides hold the same subject. Here the writer holds the *row*
    // and names the program it claims for; the rail holds no row and cannot,
    // so it falls back to `describe`'s program-less wording. What must agree is
    // the answer, and it does — both refuse this actor, and the sentences are
    // the same sentence at two levels of knowledge rather than two rules.
    const stated = (await open(classes.accepted, AS.netid)).edit!.refused.find(
      (one) => one.fieldClass === "Seat-sharing tags",
    )!;
    expect(stated.notYours!.sentence).toBe(
      "Only the program's director can change this class's seat sharing.",
    );
    expect(await refusalFromWriter(classes.accepted, world.imaAreaId, WHO.itpDirector)).toBe(
      "Only IMA's program director can change this class's seat sharing.",
    );
  });

  test("nothing on this page is yours to change, for a reader who can act but not here", async () => {
    // The plain instructor can act somewhere in the system — they are somebody's
    // lead — so they get an affordance rather than `null`, and every class of it
    // is refused: they direct nothing and coordinate nothing.
    const edit = (await open(classes.accepted, WHO.instructor)).edit!;
    expect(edit.open).toEqual([]);
    expect(edit.refused.map((one) => one.fieldClass)).toEqual([
      "Offering operational",
      "Seat-sharing tags",
      "Roster — positions 1..n",
    ]);
  });

  // --- The round trips -------------------------------------------------------

  test("two classes statements and one people statement, and the log is not read for Tier 2", async () => {
    const facts = await cost(() => getActorFacts(AS.netid));
    const studentFacts = await cost(() => getActorFacts(WHO.student));

    const asDirector = await cost(() => getOfferingPage(String(classes.accepted), AS));
    expect(subtract(asDirector, facts)).toEqual({ classes: 2, people: 1 });

    // A `student` gets no history section, so the log is not read at all: a query
    // issued for them would buy a round trip to build something nobody may read.
    const asStudent = await cost(() =>
      getOfferingPage(String(classes.accepted), { netid: WHO.student }),
    );
    expect(subtract(asStudent, studentFacts)).toEqual({ classes: 1, people: 1 });
  });

  // --- The property the whole set exists for --------------------------------

  test(
    "the permitted set on the page is exactly what the write path accepts from that actor",
    async () => {
      // Four classes, chosen so that every route in the Offering matrix is
      // exercised from both sides: the lead-scoped answers, the coordinator's
      // forward path, the director-only revival and kill, and a final state that
      // offers nothing to anybody.
      const covered = [classes.slated, classes.offered, classes.accepted, classes.declined];

      for (const netid of EVERYBODY) {
        for (const offeringId of covered) {
          const read = await getOfferingPage(String(offeringId), { netid });
          if (!read.visible) continue;
          for (const action of read.page.actions ?? []) {
            const asked = { netid, offeringId, event: action.event };
            expect({
              ...asked,
              accepted: await wouldAccept(netid, offeringId, action.event),
            }).toEqual({ ...asked, accepted: action.permitted });
          }
        }
      }
    },
    // Every probe is a real transaction against a real pooler, and there are
    // several dozen of them.
    180_000,
  );
});

// ---------------------------------------------------------------------------
// The world this reads
// ---------------------------------------------------------------------------

type Classes = {
  physicalComputing: Id;
  /** `Accepted` — committed, so it is the one class a `student` can open. */
  accepted: Id;
  /** `Slated`, empty roster, no meetings, no moves, never changed. */
  slated: Id;
  /** `Offered` — inside the staffing process, so outside a `student`'s tier. */
  offered: Id;
  /** `Deferred` — the one exit that carries no subject. */
  deferred: Id;
  /** `Slated` with a co-instructor sitting below a vacant position 0. */
  leaderless: Id;
  /** `Staffed` by somebody the directory has since stopped knowing. */
  forgotten: Id;
  /** Three meeting kinds and a seat-sharing tag from IMA. */
  threeKinds: Id;
  /** Offered to one person, withdrawn, re-offered to another, accepted. */
  reoffered: Id;
  /** `Dead` — a final state, which offers nothing to anybody. */
  dead: Id;
  /** `Declined` on a course that a later test retires, so `retry` is refused. */
  declined: Id;
  retiredCourse: Id;
  /** The one live class of that course, killed so the course can be retired. */
  retired: Id;
  /** Every section of `physicalComputing`, for the sibling-list assertion. */
  everySection: readonly Id[];
};

async function aTermOfClasses(world: World): Promise<Classes> {
  const physical = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
  const other = await mintCourse(world, { courseNumber: "ITPG-GT 2048" });

  // §1 — `Accepted`, with a co-instructor at position 2 so the roster has a gap
  // that is not at 0, and the operational columns a list has no room for.
  const accepted = await slateOffering(world, physical.courseId, {
    sectionNumber: "1",
    enrollmentLimit: 18,
    mode: "In person",
  });
  await seatCoInstructor(accepted, WHO.instructor, 2);
  await driveOffering(accepted, [
    { type: "staff", netid: WHO.areaHead, by: WHO.itpDirector },
    { type: "offer", by: WHO.coordinator },
    { type: "accept", by: WHO.areaHead },
  ]);
  await writeToClasses((open) =>
    writeFields(
      open,
      {
        record: { machine: "offering", id: accepted },
        columns: {
          "offering.call_number": "10432",
          "offering.sis_class_number": 7781,
          "offering.url": "https://itp.nyu.edu/pcomp",
        },
      },
      WHO.coordinator,
    ),
  );

  // §2 — `Slated`, and nothing has touched it since: no roster, no meetings, no
  // moves, never changed. Four of the ticket's distinct states in one record.
  const slated = await slateOffering(world, physical.courseId, {
    sectionNumber: "2",
    meetings: [],
  });

  // §3 — `Offered`, inside the staffing process.
  const offered = await slateOffering(world, physical.courseId, { sectionNumber: "3" });
  await driveOffering(offered, [
    { type: "staff", netid: WHO.instructor, by: WHO.itpDirector },
    { type: "offer", by: WHO.coordinator },
  ]);

  // §4 — `Deferred`.
  const deferred = await slateOffering(world, physical.courseId, { sectionNumber: "4" });
  await driveOffering(deferred, [
    { type: "staff", netid: WHO.instructor, by: WHO.itpDirector },
    { type: "offer", by: WHO.coordinator },
    { type: "defer", by: WHO.instructor },
  ]);

  // §5 — a co-instructor seated first, then a lead offered and declining, which
  // `DELETE`s position 0 and leaves position 1 sitting under a gap.
  const leaderless = await slateOffering(world, physical.courseId, { sectionNumber: "5" });
  await seatCoInstructor(leaderless, WHO.instructor, 1);
  await driveOffering(leaderless, [
    { type: "staff", netid: WHO.areaHead, by: WHO.itpDirector },
    { type: "offer", by: WHO.coordinator },
    { type: "decline", by: WHO.areaHead },
    { type: "retry", by: WHO.itpDirector },
  ]);

  // §6 — staffed by somebody the directory knew at the time and has since
  // forgotten. The write path checks `people` at the moment of the `staff`, so
  // this is the only order in which the state is reachable (issues/69).
  const forgotten = await slateOffering(world, physical.courseId, { sectionNumber: "6" });
  await theDirectoryLearns(WHO.ghost);
  await driveOffering(forgotten, [{ type: "staff", netid: WHO.ghost, by: WHO.itpDirector }]);
  await theDirectoryForgets(WHO.ghost);

  // §7 — the three meeting kinds on one class, plus IMA's claim on its seats.
  const threeKinds = await slateOffering(world, physical.courseId, {
    sectionNumber: "7",
    meetings: [A_MEETING, AN_INTENSIVE, ASYNCHRONOUS],
  });
  await shareSeats(threeKinds, { areaId: world.imaAreaId }, WHO.imaDirector);

  // §8 — offered to one person, withdrawn, re-offered to another and accepted.
  const reoffered = await slateOffering(world, physical.courseId, { sectionNumber: "8" });
  await driveOffering(reoffered, [
    { type: "staff", netid: WHO.instructor, by: WHO.itpDirector },
    { type: "offer", by: WHO.coordinator },
    // Director-only: the department retracting an offer the lead was told about
    // is a different act from a coordinator moving the record along (issues/19).
    { type: "withdraw", by: WHO.itpDirector },
    { type: "staff", netid: WHO.areaHead, by: WHO.itpDirector },
    { type: "offer", by: WHO.coordinator },
    { type: "accept", by: WHO.coordinator },
  ]);

  // §9 — `Dead`, a final state.
  const dead = await slateOffering(world, physical.courseId, { sectionNumber: "9" });
  await driveOffering(dead, [{ type: "kill", by: WHO.itpDirector }]);

  // A second course with one `Declined` class and one live class, so a test can
  // retire the course out from under a revivable section.
  const declined = await slateOffering(world, other.courseId, { sectionNumber: "1" });
  await driveOffering(declined, [
    { type: "staff", netid: WHO.instructor, by: WHO.itpDirector },
    { type: "offer", by: WHO.coordinator },
    { type: "decline", by: WHO.instructor },
  ]);
  const retired = await slateOffering(world, other.courseId, { sectionNumber: "2" });

  return {
    physicalComputing: physical.courseId,
    accepted,
    slated,
    offered,
    deferred,
    leaderless,
    forgotten,
    threeKinds,
    reoffered,
    dead,
    declined,
    retiredCourse: other.courseId,
    retired,
    everySection: [
      accepted,
      slated,
      offered,
      deferred,
      leaderless,
      forgotten,
      threeKinds,
      reoffered,
      dead,
    ],
  };
}

/**
 * The directory gaining and then losing a person — the two halves of issues/69's
 * state, which no single write path can produce on its own: `staff` refuses a
 * netid `people` does not know, and nothing in `classes` is told when the NYU
 * feed drops somebody who is already on a roster.
 */
async function theDirectoryLearns(netid: string): Promise<void> {
  await peopleDb()
    .insert(person)
    .values({ netid, officialFirstname: netid.slice(0, 2).toUpperCase(), officialLastname: "Example" });
}

async function theDirectoryForgets(netid: string): Promise<void> {
  await peopleDb().delete(person).where(eq(person.netid, netid));
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
  offeringId: Id,
  event: OfferingEventName,
): Promise<boolean> {
  try {
    await writeToClasses(async (open) => {
      await applyTransition(
        open,
        { machine: "offering", id: offeringId },
        { type: event } as OfferingEvent,
        actor,
      );
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
 * **Would `writeFields` accept this seat-sharing row?** — the field-class
 * counterpart of `wouldAccept`, asked the same way and for the same reason.
 *
 * It exists because *Seat-sharing tags* is the one class whose scope points away
 * from the record, so it is the one place a record-level affordance could state
 * an answer the per-row writer disagrees with (issues/25, issues/30, issues/62).
 */
async function shareSeatsOn(offeringId: Id, areaId: Id, actor: string): Promise<boolean> {
  return (await refusalFromWriter(offeringId, areaId, actor)) === null;
}

/** The sentence the writer throws, or `null` where it accepts. The world is left unchanged. */
async function refusalFromWriter(
  offeringId: Id,
  areaId: Id,
  actor: string,
): Promise<string | null> {
  try {
    await writeToClasses(async (open) => {
      await writeFields(
        open,
        {
          record: { machine: "offering", id: offeringId },
          rows: [{ table: "offering_area", op: "insert", values: { area_id: areaId } }],
        },
        actor,
      );
      throw new Rollback();
    });
  } catch (thrown) {
    if (thrown instanceof Rollback) return null;
    if (thrown instanceof WriteRefused) return thrown.refusals[0]!.sentence;
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

async function open(offeringId: Id, netid: string): Promise<OfferingPage> {
  const read = await getOfferingPage(String(offeringId), { netid });
  if (!read.visible) throw new Error(`Class ${offeringId} was refused to ${netid}.`);
  return read.page;
}

function events(page: OfferingPage): OfferingEventName[] {
  return (page.actions ?? []).map((action) => action.event);
}

function refusalFor(page: OfferingPage, event: OfferingEventName) {
  const action = (page.actions ?? []).find((one) => one.event === event);
  if (!action || action.permitted) throw new Error(`${event} was not refused.`);
  return action.refusal;
}
