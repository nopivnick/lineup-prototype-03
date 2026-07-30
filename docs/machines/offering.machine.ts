// AS PROVIDED — not yet wired into an application, and does not currently compile:
// `remember(...)` is referenced but never defined or imported.
// Source of truth for the Offering lifecycle while the map is being worked.
// See docs/machines/README.md for known gaps.

import { setup } from "xstate";

export const machine = setup({
  types: {
    context: {} as {},
    events: {} as
      | { type: "run" }
      | { type: "kill" }
      | { type: "list" }
      | { type: "defer" }
      | { type: "offer" }
      | { type: "retry" }
      | { type: "accept" }
      | { type: "cancel" }
      | { type: "revise" }
      | { type: "approve" }
      | { type: "decline" }
      | { type: "publish" }
      | { type: "schedule" }
      | { type: "evaluate" }
      | { type: "conclude" },
  },
  guards: {
    wasEvaluating: function ({ context, event }) {
      // Add your guard condition here
      return true;
    },
    wasCanceled: function ({ context, event }) {
      // Add your guard condition here
      return true;
    },
    wasScheduled: function ({ context, event }) {
      // Add your guard condition here
      return true;
    },
    wasDeferred: function ({ context, event }) {
      // Add your guard condition here
      return true;
    },
    wasConfirmed: function ({ context, event }) {
      // Add your guard condition here
      return true;
    },
    wasOffered: function ({ context, event }) {
      // Add your guard condition here
      return true;
    },
  },
}).createMachine({
  context: ({ input }) => input,
  id: "Offering",
  initial: "Slated",
  states: {
    Slated: {
      on: {
        offer: {
          target: "Offered",
        },
        kill: {
          target: "Dead",
        },
        revise: {
          target: "Revising",
          actions: remember("Slated"),
        },
      },
    },
    Offered: {
      on: {
        accept: {
          target: "Accepted",
        },
        decline: {
          target: "Declined",
        },
        defer: {
          target: "Deferred",
        },
        revise: {
          target: "Revising",
          actions: remember("Offered"),
        },
      },
    },
    Dead: {
      type: "final",
    },
    Revising: {
      on: {
        approve: [
          {
            target: "Evaluating",
            guard: {
              type: "wasEvaluating",
            },
          },
          {
            target: "Canceled",
            guard: {
              type: "wasCanceled",
            },
          },
          {
            target: "Scheduled",
            guard: {
              type: "wasScheduled",
            },
          },
          {
            target: "Deferred",
            guard: {
              type: "wasDeferred",
            },
          },
          {
            target: "Accepted",
            guard: {
              type: "wasConfirmed",
            },
          },
          {
            target: "Offered",
            guard: {
              type: "wasOffered",
            },
          },
          {
            target: "Slated",
          },
        ],
      },
    },
    Accepted: {
      on: {
        schedule: {
          target: "Scheduled",
        },
        decline: {
          target: "Declined",
        },
        defer: {
          target: "Deferred",
        },
        revise: {
          target: "Revising",
          actions: remember("Confirmed"),
        },
      },
    },
    Declined: {
      on: {
        kill: {
          target: "Dead",
        },
      },
    },
    Deferred: {
      on: {
        revise: {
          target: "Revising",
          actions: remember("Deferred"),
        },
        decline: {
          target: "Declined",
        },
        accept: {
          target: "Accepted",
        },
      },
    },
    Evaluating: {
      on: {
        revise: {
          target: "Revising",
          actions: remember("Evaluating"),
        },
        conclude: {
          target: "Concluded",
        },
      },
    },
    Canceled: {
      on: {
        retry: {
          target: "Slated",
        },
        revise: {
          target: "Revising",
          actions: remember("Canceled"),
        },
        kill: {
          target: "Dead",
        },
      },
    },
    Scheduled: {
      on: {
        publish: {
          target: "Published",
        },
        decline: {
          target: "Declined",
        },
        defer: {
          target: "Deferred",
        },
        revise: {
          target: "Revising",
          actions: remember("Scheduled"),
        },
      },
    },
    Concluded: {
      type: "final",
    },
    Published: {
      on: {
        list: {
          target: "Listed",
        },
        cancel: {
          target: "Canceled",
        },
        decline: {
          target: "Declined",
        },
        defer: {
          target: "Deferred",
        },
      },
    },
    Listed: {
      on: {
        run: {
          target: "Running",
        },
        cancel: {
          target: "Canceled",
        },
      },
    },
    Running: {
      on: {
        evaluate: {
          target: "Evaluating",
        },
      },
    },
  },
});
