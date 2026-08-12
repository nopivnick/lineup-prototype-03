/**
 * **Seam 2 — `getReviewPage`** (issues/74, issues/86).
 *
 * A test here asserts external behaviour at the seam: given a small world and an
 * actor, calling the read module returns this record, at this fidelity, with this
 * group header, this shared-body line and this permitted-action set. It never
 * reaches for a private helper and never asserts the shape of a query.
 *
 * Four properties are the ticket's, and none is provable by reading the module:
 *
 *   * **the module returns the two fidelities for the right actors** — the
 *     predicate is Tier 3's may-read against its may-act, so a director opening
 *     their own program's review gets controls and the same director opening the
 *     sibling review of the same proposal does not.
 *   * **the read-only fidelity keeps the history and its reasons, and carries no
 *     actions and no refusals.** That is what the whole widening was bought for:
 *     the reason another program gave is the most useful thing on the page to a
 *     director still deciding.
 *   * **a review the actor cannot reach at all comes back not-visible**, from
 *     three worlds — an address that is not an id, an id that names nothing, and
 *     a proposal no arm of the tier reaches — and it is one answer in one shape.
 *   * **the permitted set on the rail is what the write path will accept.**
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
import { getReviewPage, type ReviewPage } from "./review";
import type { ReviewEventName } from "./review-rows";

/**
 * **The round-trip counter**, the same device `db/read/proposals.test.ts` uses:
 * `db/read/review.ts` reaches `db/handles.ts` through this mock, so every query
 * either side of the project boundary increments a counter. Each call to a handle
 * is one statement, so the count *is* the count of round trips.
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

describe.skipIf(!DATABASES_CONFIGURED)("getReviewPage", () => {
  let world: World;
  let proposals: Proposals;

  beforeEach(async () => {
    world = await freshWorld();
    proposals = await aReviewWorld(world);
  });

  // --- The two fidelities ---------------------------------------------------

  test("the same record comes back at two fidelities, chosen by the may-act arms", async () => {
    // ITP's director holds the directorship arm on ITP's review of this proposal.
    const own = await pageFor(proposals.physical.reviews.ITP!, WHO.itpDirector);
    expect(own.fidelity).toBe("may-act");
    expect(own.actions).not.toBeNull();
    expect(own.edit).not.toBeNull();

    // The **same actor** on the sibling review of the **same proposal**: reached,
    // because Tier 3's may-read is a question about the proposal, and read-only,
    // because no arm reaches this particular review.
    const sibling = await pageFor(proposals.physical.reviews.IMA!, WHO.itpDirector);
    expect(sibling.fidelity).toBe("read-only");
    expect(sibling.actions).toBeNull();
    expect(sibling.edit).toBeNull();

    // And it is the same record at both: the read-only fidelity is this page with
    // two fields nulled, never a second, thinner page.
    expect(sibling.body).toEqual(own.body);
    expect(sibling.proposal.verdicts).toEqual(own.proposal.verdicts);
  });

  test("each of Tier 3's arms opens the review it reaches at the acting fidelity", async () => {
    // The directorship, on the review's own program.
    expect((await pageFor(proposals.physical.reviews.IMA!, WHO.imaDirector)).fidelity).toBe(
      "may-act",
    );
    // The area-head assignment, which sits on the review rather than on a program.
    expect((await pageFor(proposals.physical.reviews.ITP!, WHO.areaHead)).fidelity).toBe("may-act");
    // Authorship, the one arm that is not a role at all — and it is a **may-act**
    // arm, so the proposer gets every move listed with its refusal rather than a
    // read-only page that would hide who *can* move it.
    const author = await pageFor(proposals.physical.reviews.ITP!, WHO.instructor);
    expect(author.fidelity).toBe("may-act");
    expect((author.actions ?? []).every((action) => !action.permitted)).toBe(true);
    // The chair's flat clause, one OR-clause ahead of the permission term.
    expect((await pageFor(proposals.sound.reviews.IMA!, WHO.chair)).fidelity).toBe("may-act");
  });

  test("the read-only fidelity keeps the history and its reasons intact", async () => {
    const sibling = await pageFor(proposals.physical.reviews.IMA!, WHO.itpDirector);

    // The reason IMA gave, which is the whole justification for opening the page
    // rather than greying the chip that leads to it.
    expect(sibling.history.moves).toEqual([
      expect.objectContaining({
        event: "develop",
        fromState: "Proposed",
        toState: "Developing",
        actor: { netid: WHO.imaDirector, displayName: "RC Example" },
        reason: "The outcomes overlap Creative Coding almost exactly.",
      }),
    ]);

    // And nothing that is a control or a refusal comes with it.
    expect(sibling.actions).toBeNull();
    expect(sibling.edit).toBeNull();
  });

  test("a finished review at the acting fidelity is not the read-only fidelity", async () => {
    // Both carry no clickable move and they are different facts: the machine
    // offers nothing from `Approved`, which is the shape of the lifecycle, where
    // read-only is a statement about the reader. `fidelity` is what tells them
    // apart, which is why the page does not infer it from `actions === null`.
    const approved = await pageFor(proposals.physical.reviews.ITP!, WHO.itpDirector);
    expect(approved.state).toBe("Approved");
    expect(approved.fidelity).toBe("may-act");
    expect(approved.actions).toEqual([]);
  });

  // --- Not visible, from three worlds ---------------------------------------

  test("a review the actor cannot reach at all comes back not-visible", async () => {
    // ITP's director holds no arm on any review of a proposal that went to IMA
    // alone and that they did not write.
    expect(await getReviewPage(String(proposals.sound.reviews.IMA), { netid: WHO.itpDirector }))
      .toEqual({ visible: false });

    // The two rows that hold nothing in the matrix: Tier 3 has no arm that can
    // reach them, on any review.
    expect(await getReviewPage(String(proposals.physical.reviews.ITP), { netid: WHO.student }))
      .toEqual({ visible: false });
    expect(await getReviewPage(String(proposals.physical.reviews.ITP), { netid: WHO.advisor }))
      .toEqual({ visible: false });

    // A coordinator reaches the proposals screen and holds no Tier 3 arm, so a
    // review is refused to them for the reason the screen was empty.
    expect(await getReviewPage(String(proposals.physical.reviews.ITP), { netid: WHO.coordinator }))
      .toEqual({ visible: false });
  });

  test("an address that is not an id and an id that names nothing answer the same way", async () => {
    for (const address of ["", "abc", " 7 ", "1e3", "-1", "007", "9007199254740993"]) {
      expect(await getReviewPage(address, { netid: WHO.chair })).toEqual({ visible: false });
    }

    // One record has exactly one address, so the leading-zero spelling of a real
    // review is refused rather than rendered: `fireReviewEvent` revalidates the
    // canonical path, and a move fired from the odd address would leave the
    // reader on a page known to be stale.
    const real = String(proposals.physical.reviews.ITP);
    expect(await getReviewPage(`0${real}`, { netid: WHO.chair })).toEqual({ visible: false });

    // An id that names nothing, for an actor who may read every review there is.
    expect(await getReviewPage("999999", { netid: WHO.chair })).toEqual({ visible: false });
  });

  // --- The group header, restated -------------------------------------------

  test("the page carries the group header, every verdict on it, with this review among them", async () => {
    const page = await pageFor(proposals.physical.reviews.ITP!, WHO.itpDirector);

    expect(page.proposal).toMatchObject({
      proposalId: proposals.physical.proposalId,
      title: "Physical Computing II",
      credits: 4,
      proposedBy: { netid: WHO.instructor, displayName: "DH Example" },
    });

    // Every program's verdict, whether or not the reader's arms reach it — the
    // chips are what the department has decided, and this page has no filter for
    // them to be narrowed by.
    expect(page.proposal.verdicts).toEqual([
      { reviewId: String(proposals.physical.reviews.IMA), programCode: "IMA", state: "Developing" },
      { reviewId: String(proposals.physical.reviews.ITP), programCode: "ITP", state: "Approved" },
    ]);

    // The rows are the same siblings, at their own fidelities — the sibling this
    // reader may not act on is read-only in the header too, which is the same
    // encoding the list uses.
    expect(page.proposal.reviews.map((review) => review.programCode)).toEqual(["IMA", "ITP"]);
    expect(rowFor(page, "IMA").actions).toBeNull();
    expect(rowFor(page, "ITP").actions).not.toBeNull();

    // Which row is highlighted is `reviewId`'s to say: the group knows nothing
    // about which of its reviews is being read.
    expect(page.proposal.reviews.map((review) => review.reviewId)).toContain(page.reviewId);
  });

  // --- The shared body -------------------------------------------------------

  test("the body says how many programs are reading it and which have sent it back", async () => {
    const page = await pageFor(proposals.physical.reviews.ITP!, WHO.itpDirector);

    expect(page.body).toEqual({
      title: "Physical Computing II",
      description: "Physical Computing II, as the world builder wrote it.",
      credits: 4,
    });
    expect(page.bodyShare).toEqual({
      programCount: 2,
      developingProgramCodes: ["IMA"],
      hasDriftedSinceAnyMint: false,
    });

    // A proposal one program is reading says so, with nobody having sent it back.
    const alone = await pageFor(proposals.critical.reviews.ITP!, WHO.itpDirector);
    expect(alone.bodyShare).toEqual({
      programCount: 1,
      developingProgramCodes: [],
      hasDriftedSinceAnyMint: false,
    });
  });

  test("the body-drift line appears here too, and it compares values rather than moments", async () => {
    // The mint **copies** (issues/7), so the body can be edited legitimately after
    // one program has already minted from it — IMA sent this one back, which is
    // what opens the Proposal body class while ITP's course already exists.
    await writeToClasses((open) =>
      writeFields(
        open,
        {
          record: { machine: "course_proposal_review", id: proposals.physical.reviews.IMA! },
          columns: { "course_proposal.title": "Physical Computing II — rewritten" },
        },
        WHO.imaDirector,
      ),
    );

    const page = await pageFor(proposals.physical.reviews.ITP!, WHO.itpDirector);
    expect(page.bodyShare.hasDriftedSinceAnyMint).toBe(true);
    expect(page.body.title).toBe("Physical Computing II — rewritten");

    // And the reader sees it at the read-only fidelity too: whoever is deciding
    // needs the fact as much as whoever can act on it.
    const sibling = await pageFor(proposals.physical.reviews.IMA!, WHO.areaHead);
    expect(sibling.fidelity).toBe("read-only");
    expect(sibling.bodyShare.hasDriftedSinceAnyMint).toBe(true);
  });

  // --- This program's assignment ---------------------------------------------

  test("this program's area and area head are shown, and the head is a person", async () => {
    const itp = await pageFor(proposals.physical.reviews.ITP!, WHO.itpDirector);
    expect(itp.areas).toEqual([{ name: "Physical Computing" }]);
    // **Pronouns**, because this is a person presented as a person and not as
    // the subject of a timestamp (issues/40). The seam world's directory holds
    // none, so `null` is what the field carries here — and asserting the key is
    // what says the head arrives as a `StitchedPerson` rather than as the
    // `StitchedName` a list row gets.
    expect(itp.areaHead).toEqual({
      netid: WHO.areaHead,
      displayName: "NA Example",
      pronouns: null,
    });

    // The assignment is **per review**: IMA's is its own area and no head of its
    // own, which is an ordinary state rather than a half-finished one.
    const ima = await pageFor(proposals.physical.reviews.IMA!, WHO.imaDirector);
    expect(ima.areas).toEqual([{ name: "Media Art" }]);
    expect(ima.areaHead).toBeNull();
  });

  test("where a review's proposer is also its approving area head, the page says so", async () => {
    // The map declined to forbid the coincidence — a small program may have
    // exactly one area head, and the rule could leave certain proposals with no
    // legal approver — so making it visible is what was taken instead.
    const critical = await pageFor(proposals.critical.reviews.ITP!, WHO.areaHead);
    expect(critical.authorIsAreaHead).toBe(true);

    // And it is not merely *has a head*: this one has a head who did not write it.
    const physical = await pageFor(proposals.physical.reviews.ITP!, WHO.itpDirector);
    expect(physical.areaHead).not.toBeNull();
    expect(physical.authorIsAreaHead).toBe(false);
  });

  // --- The rail --------------------------------------------------------------

  test("the minted course is carried for the rail's link", async () => {
    const approved = await pageFor(proposals.physical.reviews.ITP!, WHO.itpDirector);
    expect(approved.mintedCourse).toEqual({
      courseId: expect.any(String),
      courseNumber: "ITPG-GT 2245",
    });

    // Most reviews have approved nothing, and that is an absence rather than a gap.
    expect((await pageFor(proposals.physical.reviews.IMA!, WHO.imaDirector)).mintedCourse).toBeNull();
  });

  test("the rail carries the Edit control's count, and the two refusals of what is shut", async () => {
    const director = await pageFor(proposals.physical.reviews.IMA!, WHO.imaDirector);
    const edit = director.edit;
    if (!edit) throw new Error("The acting fidelity carries an edit affordance.");

    // Both classes a review owns are open to IMA's director here: the assignment
    // is theirs by the directorship, and the body is open because their own review
    // is `Developing` — the gate that rides on **any** sibling being `Developing`.
    expect([...edit.open].sort()).toEqual(["Proposal body", "Review assignment"]);
    expect(edit.refused).toEqual([]);

    // The author of a proposal nobody made them head of holds the body and not the
    // assignment, and the refusal is the writer's own sentence.
    const author = await pageFor(proposals.physical.reviews.IMA!, WHO.instructor);
    expect(author.edit?.open).toEqual(["Proposal body"]);
    expect(author.edit?.refused).toEqual([
      {
        fieldClass: "Review assignment",
        notNow: null,
        notYours: {
          sentence: "Only IMA's program director can change this record's review assignment.",
          dependencies: [],
        },
      },
    ]);
  });

  test("a Developing-scoped route says so, rather than naming a role its reader holds", async () => {
    // **The refusal this page is the first thing to render** (issues/86). ITP's
    // review is `Approved` and IMA has sent the shared body back, so the Proposal
    // body's **state** gate is open — it rides on *any* sibling being
    // `Developing` — while ITP's director's **route** is not satisfied, that one
    // being scoped to their own review. Without the qualifier the sentence read
    // *"Only … ITP's program director … can change this record's proposal body"*
    // to ITP's program director, with no *Not now* beside it to explain the shape.
    const page = await pageFor(proposals.physical.reviews.ITP!, WHO.itpDirector);
    const body = (page.edit?.refused ?? []).find((one) => one.fieldClass === "Proposal body");

    expect(body?.notNow).toBeNull();
    expect(body?.notYours?.sentence).toBe(
      "Only whoever proposed it, ITP's program director once ITP has sent it back or this " +
        "review's area head once it has been sent back can change this record's proposal body.",
    );

    // And the unconditioned route on the same record is untouched: only the two
    // arms that carry the condition gained a qualifier.
    expect(
      (page.edit?.refused ?? []).find((one) => one.fieldClass === "Review assignment")?.notYours,
    ).toBeNull();
  });

  test("the moves the machine offers are listed, permitted or not, and a refusal names the role", async () => {
    const page = await pageFor(proposals.physical.reviews.IMA!, WHO.instructor);

    // `develop` is gone from `Developing` because the machine does not offer it,
    // not because anybody is refused: absent rather than greyed.
    expect(eventsOn(page)).toEqual(["approve", "reject"]);
    expect(refusalOn(page, "approve")).toEqual({
      sentence: "Only IMA's program director or this review's area head can approve this review.",
      dependencies: [],
    });
  });

  // --- The history -----------------------------------------------------------

  test("the history opens with the creation line, which names the proposer", async () => {
    const page = await pageFor(proposals.physical.reviews.ITP!, WHO.itpDirector);

    // The two facts the page's sentence — *"DH Example proposed this and asked
    // ITP to review it"* — is built from. The row **is** the request, so the
    // program asked is this review's own `program_code`.
    expect(page.history.creation.by).toEqual({
      netid: WHO.instructor,
      displayName: "DH Example",
    });
    expect(page.history.creation.at).toEqual(expect.any(String));
    expect(page.programCode).toBe("ITP");

    // And it is a derived line rather than a log row: issues/13 refused a genesis
    // row, so the moves under it are the moves that were really fired.
    expect(page.history.moves.map((move) => move.event)).toEqual(["approve"]);
  });

  test("last changed is the later of the record's two stamps, and null means never", async () => {
    // Nothing has been edited on this proposal since the world builder assigned
    // ITP's review, so the stamp is the assignment's.
    const critical = await pageFor(proposals.critical.reviews.ITP!, WHO.itpDirector);
    expect(critical.lastChanged).toEqual({
      by: { netid: WHO.itpDirector, displayName: "PR Example" },
      at: expect.any(String),
    });

    // A body edit lands on `course_proposal` and is the trace of an edit made
    // through this page's own `Edit` control, so it moves this box.
    await writeToClasses((open) =>
      writeFields(
        open,
        {
          record: { machine: "course_proposal_review", id: proposals.physical.reviews.IMA! },
          columns: { "course_proposal.credits": 6 },
        },
        WHO.instructor,
      ),
    );
    const physical = await pageFor(proposals.physical.reviews.ITP!, WHO.itpDirector);
    expect(physical.lastChanged?.by).toEqual({ netid: WHO.instructor, displayName: "DH Example" });

    // A review nobody has edited says so with a `null` the page states in words.
    expect((await pageFor(proposals.sound.reviews.IMA!, WHO.instructor)).lastChanged).toBeNull();
  });

  // --- The stitch ------------------------------------------------------------

  test("two classes statements and one people statement, none of them per row", async () => {
    // The actor's facts are `cache()`d and shared with every read module rendering
    // on one page, so they are not this page's cost. Measured rather than assumed.
    const facts = await cost(() => getActorFacts(WHO.itpDirector));
    expect(facts.people).toBe(0);

    const everything = await cost(() =>
      getReviewPage(String(proposals.physical.reviews.ITP), { netid: WHO.itpDirector }),
    );
    expect(subtract(everything, facts)).toEqual({ classes: 2, people: 1 });

    // A record the tier refuses reads the log for nobody: the second statement is
    // issued after the arms have answered, so a refusal costs one statement.
    const refused = await cost(() =>
      getReviewPage(String(proposals.sound.reviews.IMA), { netid: WHO.itpDirector }),
    );
    expect(subtract(refused, facts)).toEqual({ classes: 1, people: 0 });

    // An address that is not an id reads **nothing at all** — not even the
    // actor's own facts, which is why this one is not measured against them: a
    // URL that is not an id is not a review that is hidden, and the answer is
    // reached without asking anybody who is asking.
    expect(await cost(() => getReviewPage("nope", { netid: WHO.itpDirector }))).toEqual({
      classes: 0,
      people: 0,
    });
  });

  // --- The property the whole set exists for --------------------------------

  test(
    "the permitted set on the rail is exactly what the write path accepts from that actor",
    async () => {
      const actors = [
        WHO.itpDirector,
        WHO.imaDirector,
        WHO.areaHead,
        WHO.instructor,
        WHO.chair,
      ];

      const reviews = [
        proposals.physical.reviews.ITP!,
        proposals.physical.reviews.IMA!,
        proposals.critical.reviews.ITP!,
        proposals.sound.reviews.IMA!,
      ];

      for (const netid of actors) {
        for (const reviewId of reviews) {
          const answer = await getReviewPage(String(reviewId), { netid });
          if (!answer.visible) continue;

          for (const action of answer.page.actions ?? []) {
            const asked = { netid, review: String(reviewId), event: action.event };
            expect({
              ...asked,
              accepted: await wouldAccept(netid, Number(reviewId), action.event),
            }).toEqual({ ...asked, accepted: action.permitted });
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
  physical: Proposal;
  /** ITP only, `Proposed`, written by the person ITP then made its area head. */
  critical: Proposal;
  /** IMA only, `Rejected` — the state that leads nowhere at all. */
  sound: Proposal;
};

/**
 * Built by calling the writers, like every other Seam test's world: a proposal is
 * `createProposal`, an assignment is `writeFields`, and a verdict is
 * `applyTransition`. Nothing here is a hand-authored snapshot, so a review sitting
 * in `Developing` is one a director really sent back and the reason on its log is
 * one a person really typed.
 *
 * It is deliberately the world `db/read/proposals.test.ts` builds: the review page
 * is reached from that list, and two worlds would let the two screens be right
 * about different departments.
 */
async function aReviewWorld(world: World): Promise<Proposals> {
  const physical = await aProposal({
    title: "Physical Computing II",
    credits: 4,
    by: WHO.instructor,
    programs: ["ITP", "IMA"],
  });

  await assign(physical.reviews.ITP!, WHO.areaHead, world.itpAreaId, "ITP", WHO.itpDirector);
  // IMA assigns an area and **no head**, which is an ordinary state and not a
  // half-finished one: the area-head arm simply reaches nobody on that review.
  await assign(physical.reviews.IMA!, null, world.imaAreaId, "IMA", WHO.imaDirector);

  await move(
    physical.reviews.ITP!,
    { type: "approve", courseNumber: "ITPG-GT 2245" },
    WHO.itpDirector,
  );
  await move(
    physical.reviews.IMA!,
    { type: "develop", reason: "The outcomes overlap Creative Coding almost exactly." },
    WHO.imaDirector,
  );

  // Written by the person who is also its area head — the coincidence issues/42
  // ruled out of scope and made visible instead.
  const critical = await aProposal({
    title: "Critical Data Practice",
    credits: 4,
    by: WHO.areaHead,
    programs: ["ITP"],
  });
  await writeToClasses((open) =>
    writeFields(
      open,
      {
        record: { machine: "course_proposal_review", id: critical.reviews.ITP! },
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

  return { physical, critical, sound };
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
// Asking the writer the same question the rail answered
// ---------------------------------------------------------------------------

/** Thrown to roll the probe back once the writer has already said yes. */
class Rollback extends Error {}

/**
 * **Would `applyTransition` accept this?** — asked by calling it and then
 * throwing, so the answer is the writer's own and the world is unchanged. A
 * `WriteRefused` is a no; reaching the sentinel is a yes.
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
 * A move the rail offers, as the writer takes it. The read side names the event;
 * the write side takes the event **and what came with it**, which for a review's
 * `approve` is the course number its mint will use — the proposal deliberately has
 * no number, so there is nowhere else for one to come from, and a repeated one
 * would fail on the unique key rather than on the rule being asked about.
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

async function pageFor(reviewId: Id, netid: string): Promise<ReviewPage> {
  const answer = await getReviewPage(String(reviewId), { netid });
  if (!answer.visible) throw new Error(`Review ${reviewId} was refused to ${netid}.`);
  return answer.page;
}

function rowFor(page: ReviewPage, programCode: string) {
  const review = page.proposal.reviews.find((one) => one.programCode === programCode);
  if (!review) throw new Error(`No ${programCode} review on ${page.proposal.title}.`);
  return review;
}

function eventsOn(page: ReviewPage): ReviewEventName[] {
  return (page.actions ?? []).map((action) => action.event);
}

function refusalOn(page: ReviewPage, event: ReviewEventName) {
  const action = (page.actions ?? []).find((one) => one.event === event);
  if (!action || action.permitted) throw new Error(`${event} was not refused.`);
  return action.refusal;
}
