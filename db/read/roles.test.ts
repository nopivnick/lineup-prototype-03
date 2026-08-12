/**
 * **Seam 2 — `getRolesPage`** (issues/74, issues/87).
 *
 * A test here asserts external behaviour at the seam: given a small world and an
 * actor, calling the read module returns this page, these records, these
 * permitted-action sets and these refusals. It never reaches for a private helper
 * and never asserts the shape of a query.
 *
 * Four properties are the ticket's, and none is provable by reading the module:
 *
 *   * **the page is visible to any role-holder** — the fourth read predicate is
 *     *holds any role other than `student`*, so a graduate student who teaches
 *     keeps it and a plain `student` gets no page at all.
 *   * **it issues its dependency queries only for the chair.** Both handles are
 *     wrapped and counted, and the actor's facts — `cache()`d and shared with
 *     every other read on a page — are *measured* and subtracted rather than
 *     waved away. A non-chair sees no control, so a refusal computed for them
 *     would be dead text bought with two round trips.
 *   * **the dependency lists in refusals match the world.** The refusal's whole
 *     content is data elsewhere in the system, and the test compares the list the
 *     page states against the list the **writer** throws at whoever clicks anyway.
 *   * **the last-chair lock renders before it is triggered**, and lifts, live, as
 *     soon as a second chair exists.
 *
 * It runs against a **real** database pair, like Seam 1 and for the same reason.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { program, userRole } from "@/db/classes/schema";
import { classesDb, peopleDb } from "@/db/handles";
import { person } from "@/db/people/schema";
import { appointDirector } from "@/db/write/authorization";
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
import { ROLE_KIND, type Role } from "@/lib/permissions";

import { ROLES } from "./actor-roles";
import { getActorFacts } from "./actor-facts";
import { getRolesPage, type RoleGrant, type RoleHolder, type RolesPage } from "./roles";

/**
 * **The round-trip counter**, the Lineup's device used on the property this page
 * has instead: every query either side of the project boundary increments a
 * counter, so *the chair pays for two dependency reads and nobody else does* is
 * measured rather than claimed.
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

const AS_CHAIR = { netid: WHO.chair };

describe.skipIf(!DATABASES_CONFIGURED)("getRolesPage", () => {
  let world: World;

  beforeEach(async () => {
    world = await freshWorld();
    await aDepartment(world);
  });

  // --- Who may open it at all ----------------------------------------------

  test("is visible to anybody holding a role other than student, and to nobody else", async () => {
    for (const netid of [
      WHO.chair,
      WHO.itpDirector,
      WHO.imaDirector,
      WHO.areaHead,
      WHO.instructor,
      WHO.coordinator,
      WHO.ghost,
    ]) {
      expect({ netid, visible: (await getRolesPage({ netid }, ANY)).visible }).toEqual({
        netid,
        visible: true,
      });
    }

    // A `student` gets no page: no nav item, and the route refuses. **Absent
    // rather than empty**, scaled from a control to a whole page.
    expect(await getRolesPage({ netid: WHO.student }, ANY)).toEqual({ visible: false });

    // And so does a netid holding nothing at all — the predicate is about roles
    // held, not about `student` in particular.
    expect(await getRolesPage({ netid: "nobody0" }, ANY)).toEqual({ visible: false });
  });

  test("an advisor reaches it, and reaches it read-only", async () => {
    // `advisor` gains its first permission anywhere in the map here, and it is a
    // read (issues/38): Tier 2 would have cost nothing and was rejected, because
    // when advising arrives an advisor is exactly the person who needs to know who
    // heads what. Writing is still the chair's alone.
    await grantAs(WHO.chair, "ad0001", "advisor");

    const page = await visible(await getRolesPage({ netid: "ad0001" }, ANY));
    expect(page.mayWrite).toBe(false);
    expect(page.holders.every((one) => one.roles.every((grant) => grant.action === null))).toBe(true);
  });

  test("a student who also teaches keeps the page", async () => {
    // The predicate is *holds any role other than `student`* and never *does not
    // hold `student`*: ITP is full of graduate students who teach, and issues/11
    // refuses role-narrowing, so all of an actor's roles are live at once.
    await grantAs(WHO.chair, WHO.instructor, "student");
    expect((await getRolesPage({ netid: WHO.instructor }, ANY)).visible).toBe(true);
  });

  // --- The program strip ----------------------------------------------------

  test("a read-only strip of every program, naming its directors or saying it has none", async () => {
    const page = await asChair();

    expect(page.programs).toEqual([
      { code: "IMA", name: "Interactive Media Arts", directors: [personLike(WHO.imaDirector, "RC Example")] },
      {
        code: "ITP",
        name: "Interactive Telecommunications",
        directors: [personLike(WHO.itpDirector, "PR Example")],
      },
      // The empty seat, which is the whole reason the strip exists: nothing else
      // on a person-centric page is shaped like a program, so *LowRes has no
      // director* could only otherwise appear as an absence.
      { code: "LOWRES", name: "IMA Low Residency", directors: [] },
    ]);
  });

  // --- The record -----------------------------------------------------------

  test("every record states all seven roles, held or not", async () => {
    const page = await asChair();

    for (const holder of page.holders) {
      expect(holder.roles.map((one) => one.role)).toEqual([...DECLARED]);
    }

    const director = holderFor(page, WHO.itpDirector);
    expect(heldBy(director)).toEqual(["instructor", "program_director"]);
  });

  test("the two roles that gate no action are marked rather than left off", async () => {
    const page = await asChair();
    const marked = holderFor(page, WHO.coordinator).roles.filter((one) => one.gatesNoAction);

    // issues/8's two empty rows. Leaving them off would make the page quietly
    // disagree with the role list and leave `advisor` ungrantable when advising
    // lands; showing them unmarked invites a grant made in the belief it does
    // something.
    expect(marked.map((one) => one.role)).toEqual(["student", "advisor"]);

    // And the kind is the map's own split, not a second copy of it.
    for (const one of holderFor(page, WHO.coordinator).roles) {
      expect({ role: one.role, kind: one.kind }).toEqual({ role: one.role, kind: ROLE_KIND[one.role] });
    }
  });

  test("a held role carries who granted it and when", async () => {
    const page = await asChair();
    const granted = roleOf(holderFor(page, WHO.coordinator), "coordinator");

    expect(granted.held).toBe(true);
    expect(granted.grantedBy).toEqual({ netid: WHO.chair, displayName: "TV Example" });
    expect(granted.grantedAt).toEqual(expect.any(String));

    // An unheld role has no provenance, rather than a provenance of nobody.
    const unheld = roleOf(holderFor(page, WHO.coordinator), "area_head");
    expect(unheld).toMatchObject({ held: false, grantedBy: null, grantedAt: null });
  });

  test("the chair's own record is listed, pinned and marked", async () => {
    const page = await asChair();

    expect(page.holders[0]!.netid).toBe(WHO.chair);
    expect(page.holders[0]!.isActor).toBe(true);
    expect(page.holders.filter((one) => one.isActor)).toHaveLength(1);

    // Read by somebody else, the same record is listed unpinned and unmarked.
    const asDirector = await visible(await getRolesPage({ netid: WHO.itpDirector }, ANY));
    expect(asDirector.holders[0]!.netid).toBe(WHO.itpDirector);
    expect(holderFor(asDirector, WHO.chair).isActor).toBe(false);
  });

  test("a netid the directory has never heard of renders, and is never minted", async () => {
    const page = await asChair();
    const stranger = holderFor(page, WHO.ghost);

    // issues/37's *no name on file* treatment: the netid is a real identifier at
    // NYU, and a role that gates whether somebody may be staffed must not be
    // invisible to the only page that can revoke it.
    expect(stranger).toMatchObject({ netid: WHO.ghost, displayName: null, pronouns: null });
    expect(heldBy(stranger)).toEqual(["instructor"]);
    // Unnamed people sort last rather than first, which is what an empty name
    // would do.
    expect(page.holders.at(-1)!.netid).toBe(WHO.ghost);

    // And reading the page wrote nobody into the directory.
    const minted = await peopleDb().select({ netid: person.netid }).from(person).where(eq(person.netid, WHO.ghost));
    expect(minted).toEqual([]);
  });

  // --- The refusals, stated in the open -------------------------------------

  test("a revoke blocked by live rosters names them and lists them", async () => {
    const refused = refusalFor(await asChair(), WHO.instructor, "instructor");

    expect(refused.sentence).toBe(
      "DH Example is on the roster of 1 class that has not finished teaching. Take them off those rosters first, or wait until those classes conclude.",
    );
    // *Live* is from `Slated` onward and not *teaching right now*: this section is
    // `Staffed`, which is nowhere near a classroom.
    expect(refused.dependencies).toEqual(["ITPG-GT 2233 sec 1, Fall 2025 — Staffed (lead)"]);
  });

  test("a revoke blocked by headed courses names them and lists them", async () => {
    const refused = refusalFor(await asChair(), WHO.areaHead, "area_head");

    expect(refused.sentence).toBe(
      "NA Example heads the area of 2 courses that have not been retired. Hand those courses to another area head first.",
    );
    expect(refused.dependencies).toEqual([
      "ITPG-GT 2048 — A course numbered ITPG-GT 2048 (Approved)",
      "ITPG-GT 2233 — A course numbered ITPG-GT 2233 (Approved)",
    ]);
  });

  test("a revoke blocked by a directorship names the program", async () => {
    const refused = refusalFor(await asChair(), WHO.itpDirector, "program_director");

    expect(refused.sentence).toBe(
      "PR Example still directs a program. Hand it to another director first.",
    );
    expect(refused.dependencies).toEqual(["ITP — Interactive Telecommunications"]);
  });

  test("the last-chair lock renders before it is triggered, and lifts when a second chair exists", async () => {
    const locked = refusalFor(await asChair(), WHO.chair, "chair");
    expect(locked.sentence).toBe(
      "TV Example is the only chair. Nobody else can grant a role, so removing this one would leave the department with no way to appoint anyone. Grant chair to somebody else first.",
    );
    expect(locked.dependencies).toEqual([]);

    // issues/34's rule is *never empty*, not *never revocable*.
    await grantAs(WHO.chair, WHO.coordinator, "chair");

    const after = await asChair();
    expect(roleOf(holderFor(after, WHO.chair), "chair").action).toEqual({
      event: "revoke",
      permitted: true,
    });
    expect(roleOf(holderFor(after, WHO.coordinator), "chair").action).toEqual({
      event: "revoke",
      permitted: true,
    });
  });

  test("a roster row on a class that is not live blocks nothing", async () => {
    // The area head led a section that was killed. Nothing deletes a roster row
    // on the way to `Dead`, so this is the shape *any roster row* would have
    // made un-revocable forever — and it is why the predicate is over **live**
    // dependencies rather than all of them.
    const page = await asChair();
    expect(roleOf(holderFor(page, WHO.areaHead), "instructor").action).toEqual({
      event: "revoke",
      permitted: true,
    });
  });

  test("appointing a director is one act, and the page shows both halves of it", async () => {
    // **The two writes the chair must not think about** (issues/38). A newcomer to
    // the role and an existing director gaining a second program go through the
    // same call; only the number of rows behind it differs.
    await appoint(WHO.chair, WHO.instructor, "ITP");

    const newcomer = await asChair();
    expect(heldBy(holderFor(newcomer, WHO.instructor))).toContain("program_director");
    expect(directorsOf(newcomer, "ITP").map((one) => one.netid)).toContain(WHO.instructor);

    // The second program is the same act again, and the role row is **not**
    // inserted twice — which is what *only if absent* means where it matters.
    await appoint(WHO.chair, WHO.instructor, "LOWRES");

    const second = await asChair();
    expect(directorsOf(second, "LOWRES").map((one) => one.netid)).toEqual([WHO.instructor]);
    expect(
      holderFor(second, WHO.instructor).roles.filter((one) => one.role === "program_director"),
    ).toHaveLength(1);

    // And the appointment is immediately what blocks the role's revoke, stated in
    // the open with both programs listed.
    expect(refusalFor(second, WHO.instructor, "program_director").dependencies).toEqual([
      "ITP — Interactive Telecommunications",
      "LOWRES — IMA Low Residency",
    ]);
  });

  test("appointing is the chair's, like every other write on this page", async () => {
    await expect(appoint(WHO.itpDirector, WHO.instructor, "ITP")).rejects.toBeInstanceOf(WriteRefused);
  });

  test("granting is refused by nothing at all", async () => {
    const page = await asChair();

    for (const holder of page.holders) {
      for (const grant of holder.roles) {
        if (grant.held) continue;
        expect({ netid: holder.netid, ...grant.action }).toEqual({
          netid: holder.netid,
          event: "grant",
          permitted: true,
        });
      }
    }
  });

  // --- A non-chair: controls and refusals absent together --------------------

  test("a non-chair sees the same page with every control and every refusal absent", async () => {
    const page = await visible(await getRolesPage({ netid: WHO.itpDirector }, ANY));

    expect(page.mayWrite).toBe(false);
    // Not greyed. A refusal explains why a control will not fire, and a refusal
    // with no control is dead text explaining a button that was never there.
    expect(page.holders.every((one) => one.roles.every((grant) => grant.action === null))).toBe(true);
    expect(JSON.stringify(page)).not.toContain("refusal");

    // Everything that is not a control is the same page: the strip, the holders,
    // the seven roles, the provenance.
    const asChairPage = await asChair();
    expect(page.programs).toEqual(asChairPage.programs);
    expect(page.holders.map((one) => one.netid).sort()).toEqual(
      asChairPage.holders.map((one) => one.netid).sort(),
    );
  });

  test("the dependency queries are the chair's, and a non-chair issues neither", async () => {
    // Measured rather than assumed: the actor's facts are `cache()`d and shared
    // with every other read on a page, so they are not this page's cost.
    const facts = await cost(() => getActorFacts(WHO.itpDirector));
    expect(facts.people).toBe(0);

    // Three `classes` statements — the grants, the director rows, the programs —
    // and the stitch's one against `people`.
    const asDirector = await cost(() => getRolesPage({ netid: WHO.itpDirector }, ANY));
    expect(subtract(asDirector, facts)).toEqual({ classes: 3, people: 1 });

    // The chair pays for two more, both set-based over the holder set and neither
    // per-row. The third the map priced is the program strip's own read, which
    // every reader already makes.
    const chair = await cost(() => getRolesPage(AS_CHAIR, ANY));
    expect(subtract(chair, facts)).toEqual({ classes: 5, people: 1 });

    // And the count does not grow with the department: another holder, another
    // headed course, another live section, same two statements.
    await grantAs(WHO.chair, WHO.student, "instructor");
    const larger = await cost(() => getRolesPage(AS_CHAIR, ANY));
    expect(subtract(larger, facts)).toEqual({ classes: 5, people: 1 });
  });

  // --- The search box, which is also the directory ---------------------------

  test("the search narrows the holders it lists", async () => {
    const page = await visible(await getRolesPage(AS_CHAIR, { search: "NA Example" }));
    expect(page.holders.map((one) => one.netid)).toEqual([WHO.areaHead]);

    // The netid half reaches the one person the directory cannot name, which is
    // the point: somebody with no name on file is still findable by the
    // identifier that is really theirs.
    const byNetid = await visible(await getRolesPage(AS_CHAIR, { search: WHO.ghost }));
    expect(byNetid.holders.map((one) => one.netid)).toEqual([WHO.ghost]);
  });

  test("the search reaches past the holders into the directory, for the chair alone", async () => {
    const page = await visible(await getRolesPage(AS_CHAIR, { search: "Newcomer" }));

    // Somebody the directory knows and the department has granted nothing. They
    // arrive as a full record — seven roles, none held, every one grantable — so
    // that granting is a search and never a netid field.
    expect(page.holders).toEqual([]);
    expect(page.directory.map((one) => one.netid)).toEqual([NEWCOMER]);
    expect(heldBy(page.directory[0]!)).toEqual([]);
    expect(page.directory[0]!.roles.every((one) => one.action?.event === "grant")).toBe(true);

    // A non-chair has nothing to grant, so the reach is not made at all: it costs
    // a second `people` statement, and it exists only to be granted from.
    const asDirector = await visible(await getRolesPage({ netid: WHO.itpDirector }, { search: "Newcomer" }));
    expect(asDirector.directory).toEqual([]);

    const facts = await cost(() => getActorFacts(WHO.itpDirector));
    const searching = await cost(() => getRolesPage({ netid: WHO.itpDirector }, { search: "Newcomer" }));
    expect(subtract(searching, facts)).toEqual({ classes: 3, people: 1 });
  });

  test("a search matching nobody is empty on both lists rather than everybody", async () => {
    const page = await visible(await getRolesPage(AS_CHAIR, { search: "nobody matches this" }));
    expect(page.holders).toEqual([]);
    expect(page.directory).toEqual([]);
  });

  // --- The property the whole set exists for ---------------------------------

  test(
    "what the page says about a revoke is what the writer does about it",
    async () => {
      const page = await asChair();

      for (const holder of page.holders) {
        for (const grant of holder.roles) {
          if (!grant.held) continue;
          const asked = { netid: holder.netid, role: grant.role };
          const attempt = await revokeWouldSay(WHO.chair, holder.netid, grant.role);

          expect({ ...asked, accepted: attempt.accepted }).toEqual({
            ...asked,
            accepted: grant.action?.permitted,
          });

          // And where it refuses, the **dependencies** are the same list. The
          // sentence differs by design in exactly one way: the page has run the
          // stitch and names the person, and the writer has no directory and
          // names the netid.
          if (!attempt.accepted) {
            const refused = grant.action?.permitted === false ? grant.action.refusal : null;
            expect({ ...asked, deps: attempt.refusal?.dependencies }).toEqual({
              ...asked,
              deps: refused?.dependencies,
            });
            expect(attempt.refusal?.sentence).toBe(
              refused?.sentence.replace(holder.displayName ?? holder.netid, holder.netid),
            );
          }
        }
      }
    },
    120_000,
  );
});

// ---------------------------------------------------------------------------
// The department this reads
// ---------------------------------------------------------------------------

const ANY = { search: null };

const DECLARED = ROLES;

/** A person the directory knows and the department has granted nothing. */
const NEWCOMER = "nc0001";

/**
 * The world `db/write/test-world.ts` builds, plus the three things a roles page
 * needs and a write-path test never did: a program with no director, two courses
 * headed by the same person, and one live class beside one that is dead.
 */
async function aDepartment(world: World): Promise<void> {
  // A third program, written the way the reference data always is — nothing in
  // the running system writes a `program` row, which is why the seed's first step
  // exists at all.
  await classesDb()
    .insert(program)
    .values({
      code: "LOWRES",
      name: "IMA Low Residency",
      degreeLevel: "graduate",
      createdBy: WHO.chair,
    });

  await peopleDb()
    .insert(person)
    .values({ netid: NEWCOMER, officialFirstname: "Newcomer", officialLastname: "Example" });

  const physical = await mintCourse(world, { courseNumber: "ITPG-GT 2233" });
  const liveWeb = await mintCourse(world, { courseNumber: "ITPG-GT 2048" });

  // A class that has not finished teaching, led by the plain instructor.
  const staffed = await slateOffering(world, physical.courseId, { sectionNumber: "1" });
  await driveOffering(staffed, [{ type: "staff", netid: WHO.instructor, by: WHO.itpDirector }]);

  // And one that is `Dead` with its roster row intact, led by the area head:
  // nothing deletes a roster row on the way to `Dead`, so this is the shape that
  // *any roster row* would have made un-revocable forever.
  const killed: Id = await slateOffering(world, liveWeb.courseId, { sectionNumber: "1" });
  await driveOffering(killed, [
    { type: "staff", netid: WHO.areaHead, by: WHO.itpDirector },
    { type: "kill", by: WHO.itpDirector },
  ]);
}

/**
 * One appointment, through the act itself — `db/write/authorization.ts` — rather
 * than through a copy of its two-rows-one-call composition written here. The Server
 * Action is an actor-resolution wrapper around exactly this call.
 */
function appoint(actor: string, netid: string, programCode: string): Promise<void> {
  return writeToClasses((open) => appointDirector(open, { netid, programCode }, actor));
}

/** A grant, through the field writer, acting as somebody who may make it. */
function grantAs(actor: string, netid: string, role: Role): Promise<void> {
  return writeToClasses((open) =>
    writeFields(
      open,
      {
        record: { authorization: true },
        rows: [{ table: "user_role", op: "insert", values: { netid, role } }],
      },
      actor,
    ),
  );
}

// ---------------------------------------------------------------------------
// Asking the writer the same question the page answered
// ---------------------------------------------------------------------------

/** Thrown to roll the probe back once the writer has already said yes. */
class Rollback extends Error {}

/**
 * **Would `writeFields` accept this revoke, and if not, what would it say?** —
 * asked by calling it and then throwing, so the answer is the writer's own and the
 * world is unchanged.
 */
async function revokeWouldSay(
  actor: string,
  netid: string,
  role: Role,
): Promise<{ accepted: boolean; refusal: { sentence: string; dependencies: readonly string[] } | null }> {
  try {
    await writeToClasses(async (open) => {
      await writeFields(
        open,
        {
          record: { authorization: true },
          rows: [{ table: "user_role", op: "delete", key: { netid, role } }],
        },
        actor,
      );
      throw new Rollback();
    });
  } catch (thrown) {
    if (thrown instanceof Rollback) return { accepted: true, refusal: null };
    if (thrown instanceof WriteRefused) return { accepted: false, refusal: thrown.refusals[0]! };
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

async function asChair(): Promise<RolesPage> {
  return visible(await getRolesPage(AS_CHAIR, ANY));
}

async function visible(read: Awaited<ReturnType<typeof getRolesPage>>): Promise<RolesPage> {
  if (!read.visible) throw new Error("The page refused, and this reader should see it.");
  return read.page;
}

function holderFor(page: RolesPage, netid: string): RoleHolder {
  const holder = page.holders.find((one) => one.netid === netid);
  if (!holder) throw new Error(`${netid} is not listed.`);
  return holder;
}

function roleOf(holder: RoleHolder, role: Role): RoleGrant {
  const grant = holder.roles.find((one) => one.role === role);
  if (!grant) throw new Error(`${holder.netid}'s record does not state ${role}.`);
  return grant;
}

function heldBy(holder: RoleHolder): Role[] {
  return holder.roles.filter((one) => one.held).map((one) => one.role);
}

function refusalFor(page: RolesPage, netid: string, role: Role) {
  const action = roleOf(holderFor(page, netid), role).action;
  if (!action || action.permitted) throw new Error(`${role} on ${netid} was not refused.`);
  return action.refusal;
}

function directorsOf(page: RolesPage, code: string) {
  const program = page.programs.find((one) => one.code === code);
  if (!program) throw new Error(`No ${code} in the strip.`);
  return program.directors;
}

function personLike(netid: string, displayName: string) {
  return { netid, displayName, pronouns: null };
}
