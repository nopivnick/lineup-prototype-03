// Not yet wired into an application.
// Source of truth for the Course *proposal review* lifecycle while the map is
// being worked. See docs/machines/README.md for what has been decided and what
// is still open.
//
// This machine is the front half of the Course machine as originally supplied.
// https://github.com/nopivnick/lineup-prototype-03/issues/7 split it out, because
// the states before approval and the states after it belong to different things:
//
// - A **proposal** is one shared body — title, description, requested programs —
//   reviewed independently by each program it was requested for. ITP can send it
//   back to `Developing` while IMA approves it.
// - A **course** exists in exactly one program's catalog, and is minted by an
//   approving review.
//
// One actor per (proposal, program) pair. That pair is where the verdict lives:
// a single row could not hold it, because `Rejected` is final and one proposal
// can be rejected by one program while another approves it.

import { setup } from "xstate";

export const machine = setup({
  types: {
    context: {} as Record<string, never>,
    events: {} as
      // Sends the proposal back for work. Per-program: one program asking for
      // changes says nothing about the others' verdicts. The proposal *body* is
      // shared, so the resulting edit is visible to every review — only the
      // verdicts are per-program.
      | { type: "develop" }
      // **The seam.** This is the one event in either Course-side machine that
      // is not only a transition: the Server Action moves this review to
      // `Approved` and **mints a `course`** in this program's catalog, in one
      // transaction. Same pattern as `staff` writing an `offering_instructor`
      // row alongside its event
      // (https://github.com/nopivnick/lineup-prototype-03/issues/15).
      //
      // The minted course **copies** the proposal's body rather than referencing
      // it. Variants in different programs are meant to diverge — they get their
      // own numbers, and each is revisable independently via the Course machine's
      // own `revise`. Legacy agrees: `course_x_attributes` carried a per-row
      // `title` and `course_num`.
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
        develop: {
          target: "Developing",
        },
        approve: {
          target: "Approved",
        },
        reject: {
          target: "Rejected",
        },
      },
    },
    Developing: {
      on: {
        approve: {
          target: "Approved",
        },
        reject: {
          target: "Rejected",
        },
      },
    },
    // Terminal for the *review*. The course it minted carries on in
    // course.machine.ts, whose initial state is its own `Approved`.
    Approved: {
      type: "final",
    },
    Rejected: {
      type: "final",
    },
  },
});
