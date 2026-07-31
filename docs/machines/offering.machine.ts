// Not yet wired into an application.
// Source of truth for the Offering lifecycle while the map is being worked.
// Amended as map tickets land — see docs/machines/README.md for what has been
// decided and what is still open.

import { assign, setup } from "xstate";

/**
 * The states a `revise` can be entered from, and therefore the states
 * `context.revisingFrom` can hold. `Revising` routes `approve` back to
 * whichever of these it came from.
 *
 * Every other state either cannot be revised (`Revising`, `Published`, `Listed`,
 * `Running`, `Declined`) or is final (`Dead`, `Concluded`).
 */
type RevisableState =
  | "Slated"
  | "Offered"
  | "Accepted"
  | "Deferred"
  | "Scheduled"
  | "Evaluating"
  | "Canceled";

/**
 * Persisted inside the XState snapshot — see
 * https://github.com/nopivnick/lineup-prototype-03/issues/6.
 *
 * `revisingFrom` is the whole of the context this map has settled. What else
 * belongs here — above all whether the instructor roster is mirrored in, which
 * `hasLead` and vacate-on-decline both wait on — is
 * https://github.com/nopivnick/lineup-prototype-03/issues/15.
 */
type OfferingContext = {
  revisingFrom: RevisableState | null;
};

export const machine = setup({
  types: {
    context: {} as OfferingContext,
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
    wasEvaluating: function ({ context }) {
      return context.revisingFrom === "Evaluating";
    },
    wasCanceled: function ({ context }) {
      return context.revisingFrom === "Canceled";
    },
    wasScheduled: function ({ context }) {
      return context.revisingFrom === "Scheduled";
    },
    wasDeferred: function ({ context }) {
      return context.revisingFrom === "Deferred";
    },
    wasAccepted: function ({ context }) {
      return context.revisingFrom === "Accepted";
    },
    wasOffered: function ({ context }) {
      return context.revisingFrom === "Offered";
    },
    hasLead: function ({ context, event }) {
      // True when position 0 of the instructor roster is occupied. A Slated
      // offering may have an empty roster, so `offer` has no one to address
      // until a lead is placed. Still unimplementable: whether the roster is
      // visible to a guard at all is
      // https://github.com/nopivnick/lineup-prototype-03/issues/15.
      return true;
    },
  },
}).createMachine({
  context: { revisingFrom: null },
  id: "Offering",
  initial: "Slated",
  states: {
    Slated: {
      on: {
        offer: {
          target: "Offered",
          guard: {
            type: "hasLead",
          },
        },
        kill: {
          target: "Dead",
        },
        revise: {
          target: "Revising",
          actions: assign({ revisingFrom: "Slated" }),
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
          actions: assign({ revisingFrom: "Offered" }),
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
              type: "wasAccepted",
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
          actions: assign({ revisingFrom: "Accepted" }),
        },
      },
    },
    Declined: {
      on: {
        retry: {
          target: "Slated",
        },
        kill: {
          target: "Dead",
        },
      },
    },
    Deferred: {
      on: {
        revise: {
          target: "Revising",
          actions: assign({ revisingFrom: "Deferred" }),
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
          actions: assign({ revisingFrom: "Evaluating" }),
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
          actions: assign({ revisingFrom: "Canceled" }),
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
          actions: assign({ revisingFrom: "Scheduled" }),
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
