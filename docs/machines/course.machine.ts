// Not yet wired into an application.
// Source of truth for the Course lifecycle while the map is being worked.
// Structurally as provided — no transition has been amended. See
// docs/machines/README.md for what has been decided and what is still open.

import { setup } from "xstate";

export const machine = setup({
  types: {
    context: {} as {},
    events: {} as
      | { type: "reject" }
      | { type: "retire" }
      | { type: "revise" }
      | { type: "approve" }
      | { type: "develop" },
  },
  guards: {
    noLiveOfferings: function ({ context, event }) {
      // Mechanically cheap now: `offering.status` is a generated, indexed
      // column in the same project as `course`, so this is one
      // `WHERE status IN (...)` — no cross-project read, no actor rehydration
      // per row. See
      // https://github.com/nopivnick/lineup-prototype-03/issues/6.
      //
      // Still undefined, on two counts: which of the fourteen Offering states
      // count as live, and whether the question is scoped to current and
      // future terms — both
      // https://github.com/nopivnick/lineup-prototype-03/issues/14. A
      // synchronous guard also cannot issue a query, so how the answer reaches
      // it is https://github.com/nopivnick/lineup-prototype-03/issues/15.
      return true;
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
