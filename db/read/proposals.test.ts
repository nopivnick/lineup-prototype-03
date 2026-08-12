/**
 * **Seam 2 — `getProposalsPage`** (issues/74, issues/85).
 *
 * A test here asserts external behaviour at the seam: given a small world and an
 * actor, calling the read module returns these groups, these rows, these verdict
 * chips and this permitted-action set. It never reaches for a private helper and
 * never asserts the shape of a query.
 *
 * Four properties are the ticket's, and none is provable by reading the module:
 *
 *   * **every seed actor gets what Tier 3 says they get** — the two rows that
 *     hold nothing in the matrix get the screen refused, a `coordinator` gets it
 *     empty, and each of the three arms opens a different set of proposals.
 *   * **the chips appear whether or not the read rule reaches the actor**, and
 *     so do the rows: a proposal reached by one arm opens every sibling review,
 *     which is issues/42's widening and the reason the screen exists.
 *   * **each filter returns what it claims**, with finished reviews in the query
 *     and out of the default, and `Rejected` its own filter rather than a corner
 *     of the catch-all.
 *   * **the permitted set on a row is what the write path will accept.**
 *     `wouldAccept` calls `applyTransition` for real and rolls the transaction
 *     back, so the comparison is against the writer's own answer rather than
 *     against a second copy of the rules written to make the test pass.
 *
 * It runs against a **real** database pair, like Seam 1 and for the same reason.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

import { applyTransition, type ReviewEvent } from "@/db/write/apply-transition";
import { createProposal } from "@/db/write/create-proposal";
import { WriteRefused } from "@/db/write/refusal";
import { DATABASES_CONFIGURED, freshWorld, WHO, type World } from "@/db/write/test-world";
import { writeToClasses, type Id } from "@/db/write/transaction";
import { writeFields } from "@/db/write/write-fields";

import { getActorFacts } from "./actor-facts";
import { getProposalsPage, mayProposeACourse, type ProposalsFilters } from "./proposals";
import type { ProposalGroup, ProposalReviewRow, ReviewEventName } from "./review-rows";

/**
 * **The round-trip counter**, the same device `db/read/lineup.test.ts` uses:
 * `db/read/proposals.ts` reaches `db/handles.ts` through this mock, so every
 * query either side of the project boundary increments a counter. Each call to a
 * handle is one statement, so the count *is* the count of round trips.
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

describe.skipIf(!DATABASES_CONFIGURED)("getProposalsPage", () => {
  let world: World;
  let proposals: Proposals;

  beforeEach(async () => {
    world = await freshWorld();
    proposals = await aProposalsWorld(world);
  });

  // --- The groups and the rows ----------------------------------------------

  test("groups on the proposal, with the shared body stated once on the header", async () => {
    const groups = await pageFor(WHO.itpDirector, "any");

    const physical = groupFor(groups, proposals.physicalComputing.proposalId);
    expect(physical).toMatchObject({
      title: "Physical Computing II",
      credits: 4,
      // The proposer is stitched from the other project, like every other person
      // on a list: name where the directory has one, netid where it does not.
      proposedBy: { netid: WHO.instructor, displayName: "DH Example" },
    });
    expect(physical.proposedAt).toEqual(expect.any(String));

    // And a review row carries only what differs between siblings — no title, no
    // credits, no proposer, no date.
    expect(Object.keys(physical.reviews[0]!).sort()).toEqual([
      "actions",
      "areaHead",
      "areas",
      "mintedCourse",
      "programCode",
      "reviewId",
      "state",
    ]);
  });

  test("a review carries its own assignment, and the course its approve minted", async () => {
    const groups = await pageFor(WHO.itpDirector, "any");
    const physical = groupFor(groups, proposals.physicalComputing.proposalId);

    expect(rowFor(physical, "ITP")).toMatchObject({
      state: "Approved",
      areas: [{ name: "Physical Computing" }],
      areaHead: { netid: WHO.areaHead, displayName: "NA Example" },
      // The one route from a decision to its consequence (issues/42, issues/49).
      mintedCourse: { courseId: expect.any(String), courseNumber: "ITPG-GT 2245" },
    });

    // The assignment is **per review**, so IMA's is its own: its own area, no
    // head of its own yet, and nothing minted. Areas are program-scoped, which is
    // why two programs reading one body can sit in two different areas.
    expect(rowFor(physical, "IMA")).toMatchObject({
      state: "Developing",
      areas: [{ name: "Media Art" }],
      areaHead: null,
      mintedCourse: null,
    });

    // And the halves are separate assignments: this review has a head and no
    // area, which is the state the Catalog's *not offerable yet* marker exists
    // for, one step earlier.
    expect(rowFor(groupFor(groups, proposals.criticalData.proposalId), "ITP")).toMatchObject({
      areas: [],
      areaHead: { netid: WHO.areaHead, displayName: "NA Example" },
      mintedCourse: null,
    });
  });

  // --- Tier 3, arm by arm ----------------------------------------------------

  test("the two rows that hold nothing in the matrix get the screen refused", async () => {
    // Tier 3 has no arm that reaches them, so this is *absent rather than empty*
    // scaled from a control to a whole page: no groups, no filters, no nav item.
    expect(await getProposalsPage({ netid: WHO.student }, { view: "any" })).toEqual({
      visible: false,
    });
    expect(await getProposalsPage({ netid: WHO.advisor }, { view: "any" })).toEqual({
      visible: false,
    });
  });

  test("a coordinator gets the screen, empty, rather than refused", async () => {
    // A coordinator holds no Tier 3 arm today and could hold one tomorrow — they
    // are one appointment from directing a program. *A screen you have not filled*
    // and *a screen that is not for you* are different facts, and only the second
    // is a refusal.
    expect(await pageFor(WHO.coordinator, "any")).toEqual([]);
  });

  test("each of Tier 3's three arms opens a different set of proposals", async () => {
    // The directorship: ITP's director reaches the two proposals ITP was asked to
    // review, and not the one that went to IMA alone.
    expect(await titlesFor(WHO.itpDirector, "any")).toEqual([
      "Critical Data Practice",
      "Physical Computing II",
    ]);

    // Authorship, which is the one arm that is not a role at all: the instructor
    // wrote two proposals and directs nothing.
    expect(await titlesFor(WHO.instructor, "any")).toEqual([
      "Sound as Material",
      "Physical Computing II",
    ]);

    // The area-head assignment, on a review rather than on a program: the area
    // head reaches Physical Computing II because ITP put them on its review, and
    // Critical Data Practice because they wrote it.
    expect(await titlesFor(WHO.areaHead, "any")).toEqual([
      "Critical Data Practice",
      "Physical Computing II",
    ]);

    // The chair is one OR-clause ahead of the permission term, and issues/42 read
    // that literally: it is a fourth arm on a tier issues/28 wrote with three.
    expect(await titlesFor(WHO.chair, "any")).toEqual([
      "Sound as Material",
      "Critical Data Practice",
      "Physical Computing II",
    ]);
  });

  // --- The widening the screen exists for -----------------------------------

  test("every program's verdict shows, whether or not the read rule reaches the actor", async () => {
    // IMA's director holds no arm on the ITP review of this proposal — not the
    // directorship, not authorship, not the area head — and sees its verdict
    // anyway, because the reviews being able to disagree is the point.
    const physical = groupFor(
      await pageFor(WHO.imaDirector, "any"),
      proposals.physicalComputing.proposalId,
    );

    expect(physical.verdicts).toEqual([
      { reviewId: String(proposals.physicalComputing.reviews.IMA), programCode: "IMA", state: "Developing" },
      { reviewId: String(proposals.physicalComputing.reviews.ITP), programCode: "ITP", state: "Approved" },
    ]);
  });

  test("a chip carries its review's id, because the chip is the route to it", async () => {
    // The chip is a control rather than a label, and it is the **only** route to a
    // review the filter has dropped: ITP's is `Approved` and absent from the rows
    // under the default view, so a chip that could not be clicked would announce a
    // verdict and offer no way to read it.
    const physical = groupFor(
      await pageFor(WHO.itpDirector, "in-play"),
      proposals.physicalComputing.proposalId,
    );

    expect(physical.reviews.map((review) => review.programCode)).toEqual(["IMA"]);
    expect(physical.verdicts.map((verdict) => verdict.reviewId)).toEqual([
      String(proposals.physicalComputing.reviews.IMA),
      String(proposals.physicalComputing.reviews.ITP),
    ]);
  });

  test("a director reads every review on a proposal their program is reading", async () => {
    const physical = groupFor(
      await pageFor(WHO.itpDirector, "any"),
      proposals.physicalComputing.proposalId,
    );

    // Both rows, not just theirs. A screen built on reviews being able to
    // disagree must not hide the disagreement.
    expect(physical.reviews.map((review) => review.programCode)).toEqual(["IMA", "ITP"]);

    // And the one outside their arms is **read-only**: controls and refusals
    // absent together, which is what `student` and `advisor` already get
    // elsewhere. A refusal here would be dead text explaining a button that was
    // never there.
    expect(rowFor(physical, "IMA").actions).toBeNull();
    expect(rowFor(physical, "ITP").actions).not.toBeNull();
  });

  test("the proposer's arm is a may-act arm, and the matrix still gives them no move", async () => {
    // **The tier's arms and the matrix's routes are different lists**, and the
    // author is where they come apart: `course_proposal.created_by` is an arm of
    // Tier 3's may-act predicate, so the author gets the full fidelity — every
    // move listed with its reason — while the matrix hands them no route into
    // `develop`, `approve` or `reject` at all. Read-only would have hidden the
    // one thing the proposer most needs to know, which is who *can* move it.
    const physical = groupFor(
      await pageFor(WHO.instructor, "any"),
      proposals.physicalComputing.proposalId,
    );

    const ima = rowFor(physical, "IMA");
    expect(ima.actions).not.toBeNull();
    expect((ima.actions ?? []).every((action) => !action.permitted)).toBe(true);

    // A finished review carries an empty set rather than a null one: the machine
    // offers nothing, which is not the same fact as *this row is not yours*.
    const sound = groupFor(await pageFor(WHO.instructor, "any"), proposals.sound.proposalId);
    expect(sound.verdicts).toEqual([
      { reviewId: String(proposals.sound.reviews.IMA), programCode: "IMA", state: "Rejected" },
    ]);
    expect(rowFor(sound, "IMA").actions).toEqual([]);
  });

  // --- The filters -----------------------------------------------------------

  test("the default is in play, and finished reviews are in the query and out of it", async () => {
    const inPlay = await rowsFor(WHO.chair, "in-play");
    expect(inPlay.map((review) => review.state).sort()).toEqual(["Developing", "Proposed"]);

    // Finished reviews are **reachable**, which is the whole reason they stay in
    // the query: an approved review is the only route to the course it minted.
    const any = await rowsFor(WHO.chair, "any");
    expect(any.map((review) => review.state).sort()).toEqual([
      "Approved",
      "Developing",
      "Proposed",
      "Rejected",
    ]);
  });

  test("Rejected is its own filter and is not folded into the catch-all", async () => {
    const rejected = await rowsFor(WHO.chair, "rejected");
    expect(rejected.map((review) => review.state)).toEqual(["Rejected"]);

    // Unlike a retired course, a rejected review leads nowhere at all: it minted
    // nothing and it is final, so it would otherwise sit in *Any state* forever
    // with no onward journey.
    expect(rejected.every((review) => review.mintedCourse === null)).toBe(true);
    expect((await rowsFor(WHO.chair, "in-play")).map((review) => review.state)).not.toContain(
      "Rejected",
    );
  });

  test("Needs me is the ⋯ n menu's count asked as a question, so it differs per actor", async () => {
    // The same `Proposed` review needs one person and not another, which is why
    // this filter cannot be a state filter.
    expect(await programsFor(WHO.itpDirector, "needs-me")).toEqual(["ITP"]);
    expect(await programsFor(WHO.imaDirector, "needs-me")).toEqual(["IMA"]);
    // The area head holds the ITP review of Critical Data Practice, which they
    // also wrote — the coincidence issues/42 ruled out of scope and made visible.
    expect(await programsFor(WHO.areaHead, "needs-me")).toEqual(["ITP"]);
    // The author of a proposal nobody assigned them to holds no move on it.
    expect(await programsFor(WHO.instructor, "needs-me")).toEqual([]);

    // Every row this filter keeps has something clickable on it, for every actor.
    for (const netid of [WHO.itpDirector, WHO.imaDirector, WHO.areaHead, WHO.chair]) {
      const rows = await rowsFor(netid, "needs-me");
      expect(rows.every((review) => (review.actions ?? []).some((one) => one.permitted))).toBe(true);
    }
  });

  test("a group with no row left by the filter does not render as an empty group", async () => {
    // Sound as Material's one review is `Rejected`, so *In play* drops the group
    // rather than rendering a header with nothing under it — the Lineup's rule
    // about empty groups, met from the other side.
    const inPlay = await pageFor(WHO.chair, "in-play");
    expect(inPlay.map((group) => group.title)).not.toContain("Sound as Material");
    expect(inPlay.every((group) => group.reviews.length > 0)).toBe(true);

    // And the chips on a group that *did* survive are still every program's,
    // filter or no filter: they are what the department decided, not an answer to
    // today's question.
    const physical = groupFor(inPlay, proposals.physicalComputing.proposalId);
    expect(physical.verdicts.map((verdict) => verdict.programCode)).toEqual(["IMA", "ITP"]);
    expect(physical.reviews.map((review) => review.programCode)).toEqual(["IMA"]);
  });

  // --- The ⋯ n menu ----------------------------------------------------------

  test("lists every move the machine offers from the state, permitted or not", async () => {
    const asChair = await pageFor(WHO.chair, "any");

    expect(eventsOn(rowFor(groupFor(asChair, proposals.criticalData.proposalId), "ITP"))).toEqual([
      "develop",
      "approve",
      "reject",
    ]);
    // `develop` is gone from `Developing` because the machine does not offer it,
    // not because anybody is refused: absent rather than greyed.
    expect(
      eventsOn(rowFor(groupFor(asChair, proposals.physicalComputing.proposalId), "IMA")),
    ).toEqual(["approve", "reject"]);
    // A final state carries no menu rather than an empty one.
    expect(
      eventsOn(rowFor(groupFor(asChair, proposals.physicalComputing.proposalId), "ITP")),
    ).toEqual([]);
  });

  test("a refusal names the person or the role, never the rule", async () => {
    // The author of Physical Computing II, looking at IMA's review of it. The
    // sentence is the writer's own — `notYours` — so what the greyed control says
    // and what `applyTransition` throws are one sentence, and it names the two
    // routes rather than quoting the matrix.
    const physical = groupFor(
      await pageFor(WHO.instructor, "any"),
      proposals.physicalComputing.proposalId,
    );

    expect(refusalOn(rowFor(physical, "IMA"), "approve")).toEqual({
      sentence: "Only IMA's program director or this review's area head can approve this review.",
      dependencies: [],
    });
  });

  test("the chair's clause reaches curriculum, and it is one clause ahead of the matrix", async () => {
    // issues/34 put the chair one OR-clause ahead of the permission term, and
    // issues/42 read that literally: it reaches this page, so the chair can move
    // any program's review single-handed. The review machine carries no invariant
    // for that clause to be stopped by, unlike the Course's `retire`.
    const critical = rowFor(
      groupFor(await pageFor(WHO.chair, "any"), proposals.criticalData.proposalId),
      "ITP",
    );

    expect((critical.actions ?? []).every((action) => action.permitted)).toBe(true);
    expect(eventsOn(critical)).toEqual(["develop", "approve", "reject"]);
  });

  // --- The stitch ------------------------------------------------------------

  test("the stitch is exactly two round trips, and neither grows with the page", async () => {
    // The actor's facts are `cache()`d and shared with every read module rendering
    // on one page, so they are not this page's cost. Measured rather than assumed.
    const facts = await cost(() => getActorFacts(WHO.chair));
    expect(facts.people).toBe(0);

    const everything = await cost(() => getProposalsPage({ netid: WHO.chair }, { view: "any" }));
    expect(subtract(everything, facts)).toEqual({ classes: 1, people: 1 });

    const one = await cost(() => getProposalsPage({ netid: WHO.chair }, { view: "rejected" }));
    expect(subtract(one, facts)).toEqual({ classes: 1, people: 1 });

    // A refused screen reads nothing at all beyond the actor's own facts: the
    // roles are what refuse it, and there is no page to build.
    const studentFacts = await cost(() => getActorFacts(WHO.student));
    const refused = await cost(() => getProposalsPage({ netid: WHO.student }, { view: "any" }));
    expect(subtract(refused, studentFacts)).toEqual({ classes: 0, people: 0 });
  });

  // --- Proposing -------------------------------------------------------------

  test("the propose control is the create act's own permission term, asked early", async () => {
    // issues/65 restored the two arms issues/43 and issues/42 had narrowed away:
    // proposing is not flat `instructor` alone.
    expect(await mayProposeACourse({ netid: WHO.instructor })).toBe(true);
    expect(await mayProposeACourse({ netid: WHO.itpDirector })).toBe(true);
    expect(await mayProposeACourse({ netid: WHO.areaHead })).toBe(true);
    expect(await mayProposeACourse({ netid: WHO.chair })).toBe(true);

    // A coordinator reaches the screen and cannot propose, which is why the empty
    // state has two wordings rather than one.
    expect(await mayProposeACourse({ netid: WHO.coordinator })).toBe(false);
    expect(await mayProposeACourse({ netid: WHO.student })).toBe(false);
  });

  // --- The property the whole set exists for --------------------------------

  test(
    "the permitted set on a row is exactly what the write path accepts from that actor",
    async () => {
      const actors = [
        WHO.itpDirector,
        WHO.imaDirector,
        WHO.areaHead,
        WHO.instructor,
        WHO.coordinator,
        WHO.chair,
      ];

      for (const netid of actors) {
        for (const group of await pageFor(netid, "any")) {
          for (const review of group.reviews) {
            for (const action of review.actions ?? []) {
              const asked = { netid, review: review.reviewId, event: action.event };
              expect({
                ...asked,
                accepted: await wouldAccept(netid, Number(review.reviewId), action.event),
              }).toEqual({ ...asked, accepted: action.permitted });
            }
          }
        }
      }
    },
    // Every probe is a real transaction against a real pooler, and a probe of
    // `approve` mints a course inside it before rolling back.
    120_000,
  );
});

// ---------------------------------------------------------------------------
// The world this reads
// ---------------------------------------------------------------------------

type Proposal = { proposalId: string; reviews: Readonly<Record<string, Id>> };

type Proposals = {
  /** Two programs, and they disagree: ITP approved and minted, IMA sent it back. */
  physicalComputing: Proposal;
  /** ITP only, `Proposed`, written by the person ITP then made its area head. */
  criticalData: Proposal;
  /** IMA only, `Rejected` — the state that leads nowhere at all. */
  sound: Proposal;
};

/**
 * Built by calling the writers, like every other Seam test's world: a proposal
 * is `createProposal`, an assignment is `writeFields`, and a verdict is
 * `applyTransition`. Nothing here is a hand-authored snapshot, so a review
 * sitting in `Developing` is one a director really sent back.
 */
async function aProposalsWorld(world: World): Promise<Proposals> {
  const physicalComputing = await aProposal({
    title: "Physical Computing II",
    credits: 4,
    by: WHO.instructor,
    programs: ["ITP", "IMA"],
  });

  await assign(physicalComputing.reviews.ITP!, WHO.areaHead, world.itpAreaId, "ITP", WHO.itpDirector);
  // IMA assigns an area and **no head**, which is an ordinary state and not a
  // half-finished one: the area-head arm simply reaches nobody on that review.
  await assign(physicalComputing.reviews.IMA!, null, world.imaAreaId, "IMA", WHO.imaDirector);

  await move(physicalComputing.reviews.ITP!, { type: "approve", courseNumber: "ITPG-GT 2245" }, WHO.itpDirector);
  await move(
    physicalComputing.reviews.IMA!,
    { type: "develop", reason: "The outcomes overlap Creative Coding almost exactly." },
    WHO.imaDirector,
  );

  // Written by the person who is also its area head — the coincidence issues/42
  // ruled out of scope and made visible instead.
  const criticalData = await aProposal({
    title: "Critical Data Practice",
    credits: 4,
    by: WHO.areaHead,
    programs: ["ITP"],
  });
  await writeToClasses((open) =>
    writeFields(
      open,
      {
        record: { machine: "course_proposal_review", id: criticalData.reviews.ITP! },
        columns: { "course_proposal_review.area_head": WHO.areaHead },
      },
      WHO.itpDirector,
    ),
  );

  const sound = await aProposal({
    title: "Sound as Material",
    credits: 2,
    by: WHO.instructor,
    programs: ["IMA"],
  });
  await move(
    sound.reviews.IMA!,
    { type: "reject", reason: "There is no studio time for it this year." },
    WHO.imaDirector,
  );

  return { physicalComputing, criticalData, sound };
}

async function aProposal(input: {
  title: string;
  credits: number;
  by: string;
  programs: readonly string[];
}): Promise<Proposal> {
  const { proposalId, reviewIds } = await writeToClasses((open) =>
    createProposal(
      open,
      {
        title: input.title,
        description: `${input.title}, as the world builder wrote it.`,
        credits: input.credits,
        programs: input.programs,
      },
      input.by,
    ),
  );

  const reviews: Record<string, Id> = {};
  input.programs.forEach((programCode, index) => {
    reviews[programCode] = reviewIds[index]!;
  });

  return { proposalId: String(proposalId), reviews };
}

/** The assignment: an area, and an area head where the program has named one. */
function assign(
  reviewId: Id,
  areaHead: string | null,
  areaId: number,
  programCode: string,
  actor: string,
): Promise<void> {
  return writeToClasses((open) =>
    writeFields(
      open,
      {
        record: { machine: "course_proposal_review", id: reviewId },
        columns: areaHead ? { "course_proposal_review.area_head": areaHead } : {},
        rows: [
          {
            table: "course_proposal_review_area",
            op: "insert",
            values: {
              course_proposal_review_id: reviewId,
              area_id: areaId,
              program_code: programCode,
            },
          },
        ],
      },
      actor,
    ),
  );
}

function move(reviewId: Id, event: ReviewEvent, actor: string): Promise<void> {
  return writeToClasses((open) =>
    applyTransition(open, { machine: "course_proposal_review", id: reviewId }, event, actor),
  );
}

// ---------------------------------------------------------------------------
// Asking the writer the same question the row answered
// ---------------------------------------------------------------------------

/** Thrown to roll the probe back once the writer has already said yes. */
class Rollback extends Error {}

/**
 * **Would `applyTransition` accept this?** — asked by calling it and then
 * throwing, so the answer is the writer's own and the world is unchanged. A
 * `WriteRefused` is a no; reaching the sentinel is a yes.
 *
 * `approve` is the one probe that writes more than a snapshot: it mints a course
 * inside the same transaction, so each probe carries a number of its own. The
 * rollback takes the course with it either way, and a repeated number would fail
 * on the unique key rather than on the rule being asked about.
 */
async function wouldAccept(actor: string, reviewId: number, event: ReviewEventName): Promise<boolean> {
  try {
    await writeToClasses(async (open) => {
      await applyTransition(
        open,
        { machine: "course_proposal_review", id: reviewId },
        asEvent(event),
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

let probes = 0;

/**
 * A move the row offers, as the writer takes it. The read side names the event;
 * the write side takes the event **and what came with it**, which for a review's
 * `approve` is the course number its mint will use — the proposal deliberately
 * has no number, so there is nowhere else for one to come from.
 */
function asEvent(event: ReviewEventName): ReviewEvent {
  probes += 1;
  return event === "approve" ? { type: event, courseNumber: `PROBE ${probes}` } : { type: event };
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

async function pageFor(
  netid: string,
  view: ProposalsFilters["view"],
): Promise<readonly ProposalGroup[]> {
  const answer = await getProposalsPage({ netid }, { view });
  if (!answer.visible) throw new Error(`The proposals screen was refused to ${netid}.`);
  return answer.page;
}

async function titlesFor(netid: string, view: ProposalsFilters["view"]): Promise<string[]> {
  return (await pageFor(netid, view)).map((group) => group.title);
}

async function rowsFor(
  netid: string,
  view: ProposalsFilters["view"],
): Promise<readonly ProposalReviewRow[]> {
  return (await pageFor(netid, view)).flatMap((group) => [...group.reviews]);
}

async function programsFor(netid: string, view: ProposalsFilters["view"]): Promise<string[]> {
  return (await rowsFor(netid, view)).map((review) => review.programCode);
}

function groupFor(groups: readonly ProposalGroup[], proposalId: string): ProposalGroup {
  const group = groups.find((one) => one.proposalId === proposalId);
  if (!group) throw new Error(`No group for proposal ${proposalId}.`);
  return group;
}

function rowFor(group: ProposalGroup, programCode: string): ProposalReviewRow {
  const review = group.reviews.find((one) => one.programCode === programCode);
  if (!review) throw new Error(`No ${programCode} review on ${group.title}.`);
  return review;
}

function eventsOn(review: ProposalReviewRow): ReviewEventName[] {
  return (review.actions ?? []).map((action) => action.event);
}

function refusalOn(review: ProposalReviewRow, event: ReviewEventName) {
  const action = (review.actions ?? []).find((one) => one.event === event);
  if (!action || action.permitted) throw new Error(`${event} was not refused.`);
  return action.refusal;
}
