// Not yet wired into an application.
// Source of truth for the Course lifecycle while the map is being worked.
// Structurally as provided — no transition has been amended. See
// docs/machines/README.md for what has been decided and what is still open.

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
    context: {} as {},
    events: {} as
      | { type: "reject" }
      | { type: "retire"; liveOfferings: LiveOffering[] }
      | { type: "revise" }
      | { type: "approve" }
      | { type: "develop" },
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
  context: ({ input }) => input,
  id: "Course",
  initial: "Proposed",
  states: {
    Proposed: {
      on: {
        reject: {
          target: "Rejected",
        },
        approve: {
          target: "Approved",
        },
        develop: {
          target: "Developing",
        },
      },
    },
    Rejected: {
      type: "final",
    },
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
