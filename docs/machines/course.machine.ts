// AS PROVIDED — not yet wired into an application.
// Source of truth for the Course lifecycle while the map is being worked.
// See docs/machines/README.md for known gaps.

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
      // Add your guard condition here
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
