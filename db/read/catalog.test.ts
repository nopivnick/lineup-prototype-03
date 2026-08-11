/**
 * **Seam 2 — `getCatalogPage`** (issues/74, issues/81).
 *
 * A test here asserts external behaviour at the seam: given a small world and an
 * actor, calling the read module returns these rows, this permitted-action set
 * and this refusal. It never reaches for a private helper and never asserts the
 * shape of a query.
 *
 * Two properties are the ticket's, and neither is provable by reading the module:
 *
 *   * **the permitted-action set matches what the write path will actually
 *     accept from that actor.** `wouldAccept` below is what proves it — it calls
 *     `applyTransition` for real and then rolls the transaction back, so the
 *     comparison is against the writer's own answer rather than against a second
 *     copy of the rules written to make the test pass.
 *   * **the module issues no query against `people`.** `peopleDb` is wrapped and
 *     counted, so this is asserted at runtime over the rows actually read rather
 *     than by grepping the source.
 *
 * It runs against a **real** database pair, like Seam 1 and for the same reason.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

import { applyTransition, type CourseEvent } from "@/db/write/apply-transition";
import { WriteRefused } from "@/db/write/refusal";
import {
  DATABASES_CONFIGURED,
  freshWorld,
  mintCourse,
  slateOffering,
  WHO,
  type World,
} from "@/db/write/test-world";
import { writeToClasses, type Id } from "@/db/write/transaction";
import { writeFields } from "@/db/write/write-fields";
import type { CourseState } from "@/lib/machines/course.machine";

import {
  ANY_STATUS,
  DEFAULT_STATUS,
  getCatalogPage,
  listCatalogPrograms,
  type CatalogGroup,
  type CatalogRow,
  type CourseEventName,
} from "./catalog";

/**
 * **The people counter.** `db/read/catalog.ts` reaches `db/handles.ts` through
 * this mock, so a `people` query anywhere in its call graph — including one
 * added later, and including one inside a helper it borrows — increments this.
 * The world builder uses `peopleDb` legitimately, which is why the assertion is
 * a delta across the call rather than a count of zero.
 */
const { peopleWatch } = vi.hoisted(() => ({ peopleWatch: { calls: 0 } }));

vi.mock("@/db/handles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/handles")>();
  return {
    ...actual,
    peopleDb: () => {
      peopleWatch.calls += 1;
      return actual.peopleDb();
    },
  };
});

const AS = { netid: WHO.itpDirector };

describe.skipIf(!DATABASES_CONFIGURED)("getCatalogPage", () => {
  let world: World;
  let catalog: Catalog;

  beforeEach(async () => {
    world = await freshWorld();
    catalog = await aCatalog(world);
  });

  // --- The rows -------------------------------------------------------------

  test("returns composed rows grouped by program, and never table rows plus a map", async () => {
    const groups = await getCatalogPage(AS, allOf({}));

    expect(groups.map((group) => group.programCode)).toEqual(["IMA", "ITP"]);
    expect(groups.map((group) => group.programName)).toEqual([
      "Interactive Media Arts",
      "Interactive Telecommunications",
    ]);
    expect(groups.map((group) => group.courseCount)).toEqual([1, 4]);

    const physical = rowFor(groups, catalog.physicalComputing.courseNumber);
    expect(physical).toMatchObject({
      courseId: String(catalog.physicalComputing.courseId),
      title: "A course numbered ITPG-GT 2233",
      credits: 4,
      status: "Approved",
      // The tags arrive on the row, composed — not as ids for the page to
      // resolve against a second result set.
      areas: [{ name: "Physical Computing" }],
      requirementCategories: [{ name: "Core" }],
      notOfferableYet: null,
    });
  });

  test("hides Retired by the filter's default, and the filter reaches it", async () => {
    const byDefault = await getCatalogPage(AS, filters({ status: DEFAULT_STATUS }));
    expect(numbersIn(byDefault)).not.toContain(catalog.fabrication.courseNumber);

    const widened = await getCatalogPage(AS, filters({ status: ANY_STATUS }));
    expect(numbersIn(widened)).toContain(catalog.fabrication.courseNumber);
    expect(rowFor(widened, catalog.fabrication.courseNumber).status).toBe("Retired");

    // And `Revising` is in the default, because a course being revised is still
    // eligible to be offered in future.
    expect(rowFor(byDefault, catalog.videoSketchbook.courseNumber).status).toBe("Revising");
  });

  test("searches title and number, and nothing else", async () => {
    const byNumber = await getCatalogPage(AS, allOf({ search: "GT 2233" }));
    expect(numbersIn(byNumber)).toEqual([catalog.physicalComputing.courseNumber]);

    const byTitle = await getCatalogPage(AS, allOf({ search: "numbered IMNY" }));
    expect(numbersIn(byTitle)).toEqual([catalog.creativeCoding.courseNumber]);

    // The area head is a netid on the course row and is not searchable: a Course
    // has no instructor, and this module displays no person at all.
    const byPerson = await getCatalogPage(AS, allOf({ search: WHO.areaHead }));
    expect(numbersIn(byPerson)).toEqual([]);
  });

  test("narrows to one program, and the empty result is a group set of none", async () => {
    const ima = await getCatalogPage(AS, allOf({ programCode: "IMA" }));
    expect(ima.map((group) => group.programCode)).toEqual(["IMA"]);

    const nothing = await getCatalogPage(AS, allOf({ search: "nothing matches this" }));
    expect(nothing).toEqual([]);
  });

  test("marks a course not offerable yet, naming which of the two is missing", async () => {
    const groups = await getCatalogPage(AS, allOf({}));

    expect(rowFor(groups, catalog.speculativeObjects.courseNumber).notOfferableYet).toEqual({
      missingArea: true,
      missingAreaHead: true,
    });
    expect(rowFor(groups, catalog.physicalComputing.courseNumber).notOfferableYet).toBeNull();
  });

  // --- No person, anywhere --------------------------------------------------

  test("issues no query against the people project", async () => {
    const before = peopleWatch.calls;
    const groups = await getCatalogPage(AS, allOf({}));
    expect(peopleWatch.calls).toBe(before);

    // Not vacuously: it read rows, and every one of them is person-free.
    expect(groups.flatMap((group) => group.courses).length).toBeGreaterThan(0);
    expect(JSON.stringify(groups)).not.toContain(WHO.areaHead);
  });

  // --- The Actions column ---------------------------------------------------

  test("the Actions column is absent, not empty, for an actor who can never act", async () => {
    const asStudent = await getCatalogPage({ netid: WHO.student }, allOf({}));
    expect(asStudent.flatMap((group) => group.courses).every((row) => row.actions === null)).toBe(
      true,
    );

    // The rows themselves are Tier 1 and are not narrowed: a student sees every
    // course, and only the column goes.
    expect(numbersIn(asStudent).sort()).toEqual(numbersIn(await getCatalogPage(AS, allOf({}))).sort());

    for (const netid of [WHO.itpDirector, WHO.areaHead, WHO.coordinator, WHO.instructor, WHO.chair]) {
      const groups = await getCatalogPage({ netid }, allOf({}));
      expect(groups.flatMap((group) => group.courses).every((row) => row.actions !== null)).toBe(
        true,
      );
    }
  });

  // --- The ⋯ n menu ---------------------------------------------------------

  test("lists every move the machine offers from the state, permitted or not", async () => {
    const asDirector = await getCatalogPage(AS, allOf({}));
    const approved = rowFor(asDirector, catalog.creativeCoding.courseNumber);
    const revising = rowFor(asDirector, catalog.videoSketchbook.courseNumber);
    const retired = rowFor(await getCatalogPage(AS, filters({ status: ANY_STATUS })), catalog.fabrication.courseNumber);

    expect(events(approved)).toEqual(["revise", "retire"]);
    expect(events(revising)).toEqual(["approve", "retire"]);
    // `Retired` is final. A move the machine does not offer is absent rather
    // than greyed, so the row carries no menu to open.
    expect(events(retired)).toEqual([]);
  });

  test("the count is the moves this actor can actually make", async () => {
    const number = catalog.physicalComputing.courseNumber;

    // ITP's director may revise it; `retire` is refused because it is being
    // taught, which is an invariant and not a permission.
    expect(await permittedEvents(WHO.itpDirector, number)).toEqual(["revise"]);
    // The course's own area head reaches `revise` by the area-head route and
    // never reaches `retire`, which is director-only.
    expect(await permittedEvents(WHO.areaHead, number)).toEqual(["revise"]);
    // IMA's director holds neither route into an ITP course.
    expect(await permittedEvents(WHO.imaDirector, number)).toEqual([]);
    // The coordinator holds no Course act at all — the Course matrix is
    // director and area head, and `coordinator` is the operational seat.
    expect(await permittedEvents(WHO.coordinator, number)).toEqual([]);
    // The chair is one OR-clause ahead of the permission term and of nothing
    // else, so `retire` stays refused by the invariant.
    expect(await permittedEvents(WHO.chair, number)).toEqual(["revise"]);
  });

  test("a refusal names the person or the role, never the rule", async () => {
    const groups = await getCatalogPage({ netid: WHO.imaDirector }, allOf({}));
    const refused = refusalFor(rowFor(groups, catalog.physicalComputing.courseNumber), "revise");

    expect(refused.sentence).toBe(
      "Only ITP's program director or this course's area head can revise this course.",
    );
    expect(refused.dependencies).toEqual([]);
  });

  test("a refusal whose content is data elsewhere names the dependency and lists it", async () => {
    const groups = await getCatalogPage(AS, allOf({}));
    const refused = refusalFor(rowFor(groups, catalog.physicalComputing.courseNumber), "retire");

    expect(refused.sentence).toBe("This course has 1 class that has not finished teaching.");
    expect(refused.dependencies).toEqual([`${world.termCode} — Slated`]);
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
      // Three of the five, and the three that differ: one `Approved` and being
      // taught, so the invariant fires; one `Revising`, so the events are the
      // other pair; one belonging to the other program, so the scope of every
      // route is exercised from both sides. The two omitted rows would repeat
      // the first at the cost of a transaction each, over a pooler.
      const covered = [
        catalog.physicalComputing.courseNumber,
        catalog.videoSketchbook.courseNumber,
        catalog.creativeCoding.courseNumber,
      ];

      for (const netid of actors) {
        const groups = await getCatalogPage({ netid }, filters({ status: ANY_STATUS }));

        for (const row of groups.flatMap((group) => group.courses)) {
          if (!covered.includes(row.courseNumber)) continue;

          for (const action of row.actions ?? []) {
            const asked = { netid, course: row.courseNumber, event: action.event };
            expect({
              ...asked,
              accepted: await wouldAccept(netid, Number(row.courseId), action.event),
            }).toEqual({ ...asked, accepted: action.permitted });
          }
        }
      }
    },
    // Every probe is a real transaction against a real pooler, and there are
    // thirty-odd of them.
    120_000,
  );
});

describe.skipIf(!DATABASES_CONFIGURED)("listCatalogPrograms", () => {
  test("is every program, so a filter narrowed to one can be widened again", async () => {
    await freshWorld();
    expect(await listCatalogPrograms()).toEqual([
      { code: "IMA", name: "Interactive Media Arts" },
      { code: "ITP", name: "Interactive Telecommunications" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// The world this reads
// ---------------------------------------------------------------------------

type Course = { courseId: Id; courseNumber: string };

type Catalog = {
  /** ITP, assigned, `Approved`, categorised, and being taught — so `retire` is refused. */
  physicalComputing: Course;
  /** ITP, `Approved`, and neither an area nor a head. */
  speculativeObjects: Course;
  /** ITP, `Revising`. */
  videoSketchbook: Course;
  /** ITP, `Retired`. */
  fabrication: Course;
  /** IMA, `Approved` — the second group, and another program's director's. */
  creativeCoding: Course;
};

async function aCatalog(world: World): Promise<Catalog> {
  const physicalComputing = await aCourse(world, "ITPG-GT 2233", {});
  const speculativeObjects = await aCourse(world, "ITPG-GT 3011", {
    withArea: false,
    withAreaHead: false,
  });
  const videoSketchbook = await aCourse(world, "ITPG-GT 2999", { credits: 2 });
  const fabrication = await aCourse(world, "ITPG-GT 1010", {});
  const creativeCoding = await aCourse(world, "IMNY-UT 105", { programCode: "IMA" });

  // What the course counts toward — the class issues/106 gave a writer, and the
  // second tag set the Catalog row displays.
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

  await move(videoSketchbook.courseId, "revise", WHO.itpDirector);
  await move(fabrication.courseId, "retire", WHO.itpDirector);

  // One live class, so the `retire` guard has something to refuse with.
  await slateOffering(world, physicalComputing.courseId);

  return { physicalComputing, speculativeObjects, videoSketchbook, fabrication, creativeCoding };
}

/**
 * A course by the only route there is to one, keeping the number the test asked
 * for: `mintCourse` returns the keys it wrote and the number is what a Catalog
 * row is found by.
 */
async function aCourse(
  world: World,
  courseNumber: string,
  options: Omit<Parameters<typeof mintCourse>[1], "courseNumber">,
): Promise<Course> {
  const { courseId } = await mintCourse(world, { ...options, courseNumber });
  return { courseId, courseNumber };
}

function move(courseId: Id, event: CourseEventName, actor: string): Promise<void> {
  return writeToClasses((open) =>
    applyTransition(open, { machine: "course", id: courseId }, asEvent(event), actor),
  );
}

/**
 * A move the row offers, as the writer takes it. The read side names the event
 * and the write side takes the event **and what came with it** — for a Course
 * that is the optional free-text `reason`, and nothing here has one.
 */
function asEvent(event: CourseEventName): CourseEvent {
  return { type: event } as CourseEvent;
}

// ---------------------------------------------------------------------------
// Asking the writer the same question the row answered
// ---------------------------------------------------------------------------

/** Thrown to roll the probe back once the writer has already said yes. */
class Rollback extends Error {}

/**
 * **Would `applyTransition` accept this?** — asked by calling it and then
 * throwing, so the answer is the writer's own and the world is unchanged.
 *
 * A `WriteRefused` is a no. Reaching the sentinel is a yes, and it means the
 * writer got past machine legality, the invariants and the permission term with
 * every row locked, which is the whole of what the row claimed.
 */
async function wouldAccept(actor: string, courseId: number, event: CourseEventName): Promise<boolean> {
  try {
    await writeToClasses(async (open) => {
      await applyTransition(open, { machine: "course", id: courseId }, asEvent(event), actor);
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
// Reading the page
// ---------------------------------------------------------------------------

function filters(over: {
  search?: string | null;
  programCode?: string | null;
  status?: readonly CourseState[];
}) {
  return {
    search: over.search ?? null,
    programCode: over.programCode ?? null,
    status: over.status ?? DEFAULT_STATUS,
  };
}

/** Every status, so a test that is not about the default is not narrowed by it. */
function allOf(over: { search?: string | null; programCode?: string | null }) {
  return filters({ ...over, status: ANY_STATUS });
}

function numbersIn(groups: readonly CatalogGroup[]): string[] {
  return groups.flatMap((group) => group.courses.map((row) => row.courseNumber));
}

function rowFor(groups: readonly CatalogGroup[], courseNumber: string): CatalogRow {
  const row = groups.flatMap((group) => group.courses).find((one) => one.courseNumber === courseNumber);
  if (!row) throw new Error(`No row for ${courseNumber}.`);
  return row;
}

function events(row: CatalogRow): CourseEventName[] {
  return (row.actions ?? []).map((action) => action.event);
}

async function permittedEvents(netid: string, courseNumber: string): Promise<CourseEventName[]> {
  const groups = await getCatalogPage({ netid }, allOf({}));
  return (rowFor(groups, courseNumber).actions ?? [])
    .filter((action) => action.permitted)
    .map((action) => action.event);
}

function refusalFor(row: CatalogRow, event: CourseEventName) {
  const action = (row.actions ?? []).find((one) => one.event === event);
  if (!action || action.permitted) throw new Error(`${event} was not refused.`);
  return action.refusal;
}
