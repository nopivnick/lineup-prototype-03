/**
 * The **Course-proposal-review** lifecycle — one program's verdict on one
 * proposal.
 *
 * `docs/machines/course-proposal-review.machine.ts` is authoritative for the
 * shape and `docs/machines/README.md` for the reasoning; this file states the
 * same lifecycle as code the application runs (issues/76). Where the two ever
 * disagree the spec wins.
 *
 * **One actor per `(proposal, program)` pair**, which is where the verdict
 * lives. A single row could not hold it: `Rejected` is final, and one proposal
 * can be rejected by ITP while IMA approves it (issues/7). The proposal *body*
 * is shared and edited once — only the verdicts are per-program.
 *
 * The proposal itself has **no state**: "fully rejected" and "still pending
 * somewhere" are queries over these rows. There is no `propose` event either —
 * a review is opened by being created, one per requested program, and a review
 * row *is* the request, so no requested-programs table exists (issues/10,
 * issues/13).
 */
import { setup, type StateValueFrom } from "xstate";

export const machine = setup({
  types: {
    context: {} as Record<string, never>,
    events: {} as
      // Sends the proposal back for work. Per-program: one program asking for
      // changes says nothing about the others' verdicts. It also gives the
      // proposal body a writer again — the body is editable only while a review
      // is `Developing`, so a typo fix after submission costs a `develop`, which
      // is what *submitted for review* should mean (issues/8, issues/65).
      | { type: "develop" }
      // **The seam.** The one event in either Course-side machine that is not
      // only a transition: one transaction moves this review to `Approved` and
      // **mints a `course`** in this program's catalog (issues/7) — the same
      // pattern as `staff` writing an `offering_instructor` row alongside its
      // own event (issues/15).
      //
      // The mint **copies** the proposal's body rather than referencing it,
      // because variants in different programs are meant to diverge — they get
      // their own numbers and are revised independently. It copies the review's
      // **area assignment** too, for the same reason: areas are program-scoped,
      // so three approving programs mint three courses that may sit in three
      // different areas under three different heads (issues/25, issues/32).
      //
      // Both are nullable on both sides and **no guard here checks them**. The
      // rule they answer to — a course must not become an offering without an
      // area and an area head — is asserted in the offering create path, since
      // creation is an act and not a transition (issues/13, issues/32).
      //
      // `course.created_by` is the approving **actor**, which may be the area
      // head rather than a director (issues/32).
      | { type: "approve" }
      | { type: "reject" },
  },
}).createMachine({
  context: {},
  id: "CourseProposalReview",
  initial: "Proposed",
  states: {
    Proposed: {
      on: {
        develop: { target: "Developing" },
        approve: { target: "Approved" },
        reject: { target: "Rejected" },
      },
    },
    Developing: {
      on: {
        approve: { target: "Approved" },
        reject: { target: "Rejected" },
      },
    },
    /**
     * Terminal for the *review*. The course it minted carries on in
     * `course.machine.ts`, whose initial state is its own `Approved`.
     */
    Approved: { type: "final" },
    Rejected: { type: "final" },
  },
});

/** Every state of this machine, derived from it rather than restated. */
export type CourseProposalReviewState = StateValueFrom<typeof machine>;

/**
 * The same set at runtime, in declaration order. `db/classes/schema.ts` builds
 * the `course_proposal_review_status` CHECK from this list and
 * `db/machine-states.test.ts` asserts the applied migration agrees — see
 * `offering.machine.ts` for the whole of that arrangement (issues/13).
 */
export const REVIEW_STATES = Object.keys(machine.states) as CourseProposalReviewState[];
