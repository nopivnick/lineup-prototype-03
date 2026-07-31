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
  | "Staffed"
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
  "Staffed",
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
  | "Staffed"
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
 * `revisingFrom` is the whole of it, and
 * https://github.com/nopivnick/lineup-prototype-03/issues/15 closed the
 * question of what else belongs here with: nothing.
 *
 * The instructor roster is **not** mirrored in. It stays purely relational, in
 * `offering_instructor`. Mirroring it would persist a copy inside this snapshot
 * that goes stale from writes the machine cannot see — adding a co-instructor
 * fires no event — and the only fix would be to make every roster edit load,
 * mutate and re-save the snapshot.
 *
 * The guard that wanted it, `hasLead`, is gone: `Staffed` encodes the same fact
 * as a state, so `offer` needs no guard at all.
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
      // `staff` / `unstaff` carry no payload. They record that position 0
      // became occupied or vacant, and the machine reads nothing from them —
      // the Server Action that writes the `offering_instructor` row already
      // holds the netid and puts it on the transition log's `subject_netid`.
      // https://github.com/nopivnick/lineup-prototype-03/issues/15
      | { type: "staff" }
      | { type: "accept" }
      | { type: "cancel" }
      | { type: "revise" }
      | { type: "approve" }
      // `decline` **vacates position 0**, and that vacate is a `DELETE` against
      // `offering_instructor` in the Server Action's transaction — the same one
      // that locks the row, writes the snapshot and appends the transition-log
      // row. It is deliberately *not* an XState action: the roster is
      // relational and the machine cannot write to it.
      // https://github.com/nopivnick/lineup-prototype-03/issues/15
      //
      // The declining instructor is recorded as `subject_netid` on that log
      // row. `actor_netid` is who clicked, which is routinely an admin taking
      // the refusal by email — so without `subject_netid` the roster row is
      // deleted and who said no survives nowhere.
      | { type: "decline" }
      | { type: "publish" }
      | { type: "unstaff" }
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
    wasStaffed: function ({ context }) {
      return context.revisingFrom === "Staffed";
    },
    // `hasLead` used to live here, guarding `offer` on position 0 being
    // occupied. It is gone, not implemented:
    // https://github.com/nopivnick/lineup-prototype-03/issues/15 encoded the
    // same fact as the `Staffed` state, so `offer` is simply unreachable until
    // a lead exists and there is nothing left for a guard to check.
  },
}).createMachine({
  context: { revisingFrom: null },
  id: "Offering",
  initial: "Slated",
  states: {
    // The department has decided to run this class, but position 0 of the
    // instructor roster is empty — nobody has been picked to ask yet. That is
    // what `Slated` is for, and it is why `offer` does not appear here.
    Slated: {
      on: {
        staff: {
          target: "Staffed",
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
    /**
     * Position 0 is occupied; no offer has gone out. Departments assemble a
     * whole term's staffing plan before sending offers, so this is a state
     * offerings genuinely rest in — not a moment in a click-through.
     *
     * `Staffed` means exactly "position 0 is occupied", never "the roster is
     * final". Co-instructors at positions 1..n are non-gating
     * (https://github.com/nopivnick/lineup-prototype-03/issues/2) and are
     * added and removed in any state without touching the lifecycle.
     *
     * It exists in place of a `hasLead` guard on `offer`
     * (https://github.com/nopivnick/lineup-prototype-03/issues/15). Encoding
     * the fact as a state rather than checking it in a predicate means the
     * roster never has to be visible to a synchronous guard, and it makes
     * "which offerings still need an instructor?" a `status` filter — no
     * anti-join against `offering_instructor` — against the generated, indexed
     * column from https://github.com/nopivnick/lineup-prototype-03/issues/6.
     *
     * The cost is a second place that can disagree about whether a lead
     * exists. `staff` and `unstaff` are therefore never user-facing events:
     * one Server Action writes the `offering_instructor` row and sends the
     * event in the same transaction, so no code path writes one without the
     * other. They track **occupancy, not identity** — swapping lead A for
     * lead B while `Staffed` fires nothing, because the state stays true.
     */
    Staffed: {
      on: {
        offer: {
          target: "Offered",
        },
        // Vacating position 0 before anyone has been asked. Cheap and silent:
        // nobody was ever told. From `Offered` onward this is unavailable, and
        // `decline` is the only thing that empties position 0.
        unstaff: {
          target: "Slated",
        },
        kill: {
          target: "Dead",
        },
        revise: {
          target: "Revising",
          actions: assign({ revisingFrom: "Staffed" }),
        },
      },
    },
    Offered: {
      on: {
        accept: {
          target: "Accepted",
        },
        // Vacates position 0 — see the `decline` event above.
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
    // Position 0 is frozen here, whatever `revisingFrom` holds — including
    // `Slated` and `Staffed`, which are otherwise the only two states where it
    // is editable. Vacating it mid-revision would make `approve` → `Staffed`
    // assert a lead that no longer exists.
    // https://github.com/nopivnick/lineup-prototype-03/issues/15
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
            target: "Staffed",
            guard: {
              type: "wasStaffed",
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
        // Vacates position 0 — see the `decline` event above.
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
        //
        // Lands in `Slated`, not `Staffed`, and needs no guard to say so:
        // `decline` vacated position 0 on the way in, so a `Declined` offering
        // provably has no lead.
        // https://github.com/nopivnick/lineup-prototype-03/issues/15
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
        // Vacates position 0 — see the `decline` event above.
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
        //
        // Lands in `Staffed`, unlike `Declined` — `cancel` is the department
        // pulling the class, not the lead withdrawing, so position 0 is
        // untouched and routing to `Slated` would assert a vacancy that isn't
        // there. Unconditional, no guard: `Canceled` is reachable only from
        // `Published` and `Listed`, both downstream of `Offered`, and from
        // `Offered` onward the only thing that empties position 0 is `decline`
        // — which lands in `Declined`. So position 0 is provably occupied here.
        //
        // Deliberately not further forward. That lead had already accepted,
        // and the room and call number survive the cancel, so `Accepted` is
        // arguable — but revivals here are slow and material, and a state that
        // asserts "they said yes" when the yes has gone stale is published to
        // the catalog and never caught. Re-asking costs a round-trip.
        // https://github.com/nopivnick/lineup-prototype-03/issues/15
        retry: {
          target: "Staffed",
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
        // Vacates position 0 — see the `decline` event above.
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
        // Vacates position 0 — see the `decline` event above.
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
