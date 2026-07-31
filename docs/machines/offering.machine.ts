// Not yet wired into an application.
// Source of truth for the Offering lifecycle while the map is being worked.
// Amended as map tickets land — see docs/machines/README.md for what has been
// decided and what is still open.

import { assign, setup } from "xstate";

/**
 * Every state of this machine. Hand-maintained in lockstep with `states` below —
 * rename a state there and this union must move with it.
 */
export type OfferingState =
  | "Slated"
  | "Offered"
  | "Accepted"
  | "Declined"
  | "Deferred"
  | "Revising"
  | "Scheduled"
  | "Published"
  | "Listed"
  | "Running"
  | "Evaluating"
  | "Canceled"
  | "Concluded"
  | "Dead";

/**
 * The states in which an Offering blocks its Course from being retired —
 * the definition of "live" behind the Course machine's `noLiveOfferings`.
 * See https://github.com/nopivnick/lineup-prototype-03/issues/14.
 *
 * The rule is that **live ends when teaching ends**: the forward lifecycle path
 * is live up to and including `Running`. The five excluded states are
 * `Declined`, `Canceled`, `Evaluating`, `Concluded` and `Dead`.
 * `Revising` is here unconditionally, whatever `revisingFrom` holds — an
 * offering being edited right now is exactly the in-flight work retirement
 * would contradict, so the guard never reads context to decide.
 *
 * This is the single source of the definition. The query that builds a
 * `retire` event's `liveOfferings` spreads it into a `status IN (...)`, against
 * the generated, indexed `status` column from
 * https://github.com/nopivnick/lineup-prototype-03/issues/6. Deliberately not
 * an `is_live` generated column: the set is arguable policy, and policy in a
 * generated column costs a migration and a table rewrite to change.
 */
export const LIVE_STATES = [
  "Slated",
  "Offered",
  "Accepted",
  "Deferred",
  "Revising",
  "Scheduled",
  "Published",
  "Listed",
  "Running",
] as const satisfies readonly OfferingState[];

export type LiveState = (typeof LIVE_STATES)[number];

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
        // Not live, so a Declined offering never blocks its Course from being
        // retired. The cost is that this `retry` could otherwise produce a
        // Slated offering of a Retired Course. That check belongs here, on
        // `retry`, not on the Course's `retire` — loading it onto `retire`
        // would make a course unretirable forever over an offering nobody
        // intends to revive. This machine cannot see Course state, so the
        // Server Action asserts it.
        // https://github.com/nopivnick/lineup-prototype-03/issues/14
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
        // Not live — and this is the state that forced that. `cancel` is how you
        // clear the way to retire a Course; were Canceled live, the only way to
        // satisfy `noLiveOfferings` would be `kill` → `Dead` on every offering,
        // discarding the call number, SIS number, room and schedule that
        // https://github.com/nopivnick/lineup-prototype-03/issues/2 preserved.
        // Same `retry` caveat as Declined above.
        // https://github.com/nopivnick/lineup-prototype-03/issues/14
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
