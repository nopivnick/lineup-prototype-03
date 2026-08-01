// Not yet wired into an application.
// Source of truth for the Course lifecycle while the map is being worked.
// See docs/machines/README.md for what has been decided and what is still open.
//
// This machine is the back half of the Course machine as originally supplied.
// https://github.com/nopivnick/lineup-prototype-03/issues/7 split it at `approve`
// and moved `Proposed`, `Developing` and `Rejected` to
// course-proposal-review.machine.ts. A Course does not begin life here by being
// proposed — it is **minted** by an approving review, already in `Approved`, in
// exactly one program's catalog.
//
// The tell was `program_code`: null in exactly the three states that left, and
// non-null in exactly the three that stayed. See standing principle 5 in
// docs/machines/README.md.

import { setup } from "xstate";

import type { LiveState } from "./offering.machine";

/**
 * One Offering standing in the way of a `retire`, carried on the event that
 * attempts it. Three fields, all off the offering row, no join — enough for the
 * UI to render "Fall 2025 — Scheduled" as a link to the offering.
 *
 * The lead instructor is deliberately absent: naming them would need a roster
 * join, and roster shape is
 * https://github.com/nopivnick/lineup-prototype-03/issues/15.
 *
 * `id` is `string` pending
 * https://github.com/nopivnick/lineup-prototype-03/issues/10, which settles key
 * types. `termCode` is the `char(5)` term code from
 * https://github.com/nopivnick/lineup-prototype-03/issues/3, camel-cased here
 * against that schema's `term_code`.
 */
export type LiveOffering = {
  id: string;
  termCode: string;
  status: LiveState;
};

export const machine = setup({
  types: {
    context: {} as Record<string, never>,
    events: {} as
      | { type: "retire"; liveOfferings: LiveOffering[] }
      // **The only revision in the system.** The Offering machine used to carry
      // a `revise` / `approve` pair of its own; it was deleted, because both
      // machines were split out of a single one and the Offering's copy of
      // `approve` had no referent — this is the approval it meant.
      // https://github.com/nopivnick/lineup-prototype-03/issues/17
      //
      // That leaves two distinct acts on two distinct artifacts, and only this
      // one is a transition:
      //
      // - Revising the **Course** — title, description, credits, the
      //   curriculum record — invalidates the approval `Approved` asserts, so
      //   it re-opens it and needs a fresh `approve`. That is this event.
      // - Revising an **Offering** — its room, call number, meeting pattern,
      //   roster — asserts nothing that needs re-approving. It is an ordinary
      //   field write gated by the permission matrix
      //   (https://github.com/nopivnick/lineup-prototype-03/issues/8).
      //
      // A user who notices the course is wrong while looking at one of its
      // offerings fires *this* event, from that screen. The Offering does not
      // move, and nothing about it freezes while its Course sits in `Revising`
      // — no cross-entity invariant, unlike `retry` against a `Retired` course.
      // A course in `Revising` is an *approved* course being edited (`revise`
      // leaves `Approved` and returns to it), so there is never an approval
      // missing for an offering to wait on.
      | { type: "revise" }
      // Re-approval after a revision, and **not** the same act as the review's
      // `approve` in course-proposal-review.machine.ts. That one mints a course;
      // this one restores an approval a `revise` re-opened, on a course that
      // already has a program.
      //
      // That difference bites on permissions.
      // https://github.com/nopivnick/lineup-prototype-03/issues/4 ruled course
      // approval flat across all program directors, on the grounds that a course
      // can be approved before it has a program. That reasoning holds for the
      // review's `approve` and **not** for this one — see
      // https://github.com/nopivnick/lineup-prototype-03/issues/8.
      | { type: "approve" },
  },
  guards: {
    noLiveOfferings: function ({ event }) {
      // The guard does not decide what "live" means and does not query — it is
      // a predicate over a list it is handed. `LIVE_STATES` in
      // offering.machine.ts holds the definition; the caller runs the query.
      // See https://github.com/nopivnick/lineup-prototype-03/issues/14.
      //
      // Why the event and not context: context persists inside the snapshot
      // (https://github.com/nopivnick/lineup-prototype-03/issues/6), so caching
      // other rows' lifecycle state there would persist a copy that goes stale
      // the moment any offering transitions. The rule for this map's machines
      // is that context holds machine-remembered facts and the event carries
      // query-derived ones.
      //
      // The same list is what the UI renders as the disabled `retire` control's
      // reason, so the rule and its explanation cannot drift apart.
      //
      // The authoritative list is built server-side by the Server Action, inside
      // the transaction that locks the course row. A client passing this to
      // `.can()` is producing an affordance, not a decision.
      if (event.type !== "retire") return false;
      return event.liveOfferings?.length === 0;
    },
  },
}).createMachine({
  context: {},
  id: "Course",
  // A course is minted already approved, by an approving review. It is never
  // proposed here — see course-proposal-review.machine.ts.
  initial: "Approved",
  states: {
    Approved: {
      on: {
        revise: {
          target: "Revising",
        },
        retire: {
          target: "Retired",
          guard: {
            type: "noLiveOfferings",
          },
        },
      },
    },
    Revising: {
      on: {
        approve: {
          target: "Approved",
        },
        retire: {
          target: "Retired",
          guard: {
            type: "noLiveOfferings",
          },
        },
      },
    },
    Retired: {
      type: "final",
    },
  },
});
