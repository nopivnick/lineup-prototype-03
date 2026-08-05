// Not yet wired into an application.
// Source of truth for the Offering lifecycle while the map is being worked.
// Amended as map tickets land — see docs/machines/README.md for what has been
// decided and what is still open.

import { setup } from "xstate";

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
 *
 * Nine states, not the ten ticket 14 ruled on. `Revising` is gone from the
 * machine entirely — https://github.com/nopivnick/lineup-prototype-03/issues/17.
 * Ticket 14 had made it live *unconditionally*, whatever `revisingFrom` held,
 * partly to avoid reading context back out of the snapshot, and named that a
 * compromise. Deleting the state removes the compromise rather than vindicating
 * it: every state left in this set is live for a reason about that state alone,
 * and none of them needs context to decide.
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
  "Scheduled",
  "Published",
  "Listed",
  "Running",
] as const satisfies readonly OfferingState[];

export type LiveState = (typeof LIVE_STATES)[number];

/**
 * The states in which an Offering is visible to a `student` or an `advisor` —
 * the two roles that hold nothing anywhere in the permission matrix.
 * See https://github.com/nopivnick/lineup-prototype-03/issues/28.
 *
 * The rule is **an instructor agreed to teach this, or did once**. The six
 * excluded states — `Slated`, `Staffed`, `Offered`, `Deferred`, `Declined`,
 * `Dead` — are the department's staffing process, which is internal work.
 *
 * This set had to be *certifiable*, which is why it is drawn at `accept` rather
 * than at `publish`. "Students see what has been published" is the rule you
 * reach for first, and it is inexpressible: standing principle 3 says a state
 * certifies only what all of its inbound edges agree on, and
 * https://github.com/nopivnick/lineup-prototype-03/issues/21 gave `Canceled`
 * five inbound edges, two of them (`Accepted`, `Scheduled`) pre-publication. So
 * a `Canceled` offering cannot say whether it was ever published — that is
 * history, and `status` holds only the present. This set *can* be certified,
 * because ticket 21 made `cancel` available exactly downstream of `accept`.
 *
 * Hiding `Declined` alone was rejected for leaking the thing it hides: an
 * offering that vanishes from `Offered` and reappears in `Slated` announces the
 * decline by its absence. `Canceled` is deliberately included — a class that was
 * going to run and isn't is what a student most needs to see.
 *
 * Like `LIVE_STATES`, and for the same reason
 * (https://github.com/nopivnick/lineup-prototype-03/issues/14): an exported
 * constant rather than a generated column, because an arguable policy should
 * cost a one-line edit and not a table rewrite. Every other role sees all
 * fourteen states.
 */
export const COMMITTED_STATES = [
  "Accepted",
  "Scheduled",
  "Published",
  "Listed",
  "Running",
  "Evaluating",
  "Concluded",
  "Canceled",
] as const satisfies readonly OfferingState[];

export type CommittedState = (typeof COMMITTED_STATES)[number];

/**
 * Persisted inside the XState snapshot — see
 * https://github.com/nopivnick/lineup-prototype-03/issues/6.
 *
 * **Empty.** https://github.com/nopivnick/lineup-prototype-03/issues/15 first
 * closed this question with "nothing beyond `revisingFrom`"; ticket 17 then
 * deleted `revisingFrom` along with the `Revising` state, so the answer is now
 * literally nothing.
 *
 * Two independent reasons, both still worth stating, because either alone would
 * keep this type empty:
 *
 * - The instructor roster is **not** mirrored in. It stays purely relational, in
 *   `offering_instructor`. Mirroring it would persist a copy inside this
 *   snapshot that goes stale from writes the machine cannot see — adding a
 *   co-instructor fires no event.
 * - Query-derived facts belong on the event, not here (standing principle 2).
 *
 * The guard that wanted the roster, `hasLead`, is gone: `Staffed` encodes the
 * same fact as a state, so `offer` needs no guard at all.
 */
type OfferingContext = Record<string, never>;

export const machine = setup({
  types: {
    context: {} as OfferingContext,
    events: {} as
      | { type: "run" }
      | { type: "kill" }
      | { type: "list" }
      // The lead's third answer, alongside `accept` and `decline`: "ask me
      // later". It speaks for position 0 only, like the other three
      // (https://github.com/nopivnick/lineup-prototype-03/issues/2), and it is
      // **not** the department putting an offering on hold — that reading was
      // considered and rejected.
      // https://github.com/nopivnick/lineup-prototype-03/issues/21
      //
      // Available from `Offered` and nowhere else. It used to leave `Accepted`,
      // `Scheduled` and `Published` too, which is what made `Deferred`
      // ambiguous — "ask me later" is meaningless once the question has been
      // answered. The ACT-UAW Local 7902 contract (2022-2028) recognises no
      // adjunct-side pause after acceptance: the university cancels, owing
      // cancellation pay (Art. IV(C)), or the adjunct declines, which is
      // counted against them (Art. VI(B)). A limbo state between those two
      // obscures which one happened, and money turns on the difference.
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
      // The department pulling a class it has committed to running. Available
      // **exactly downstream of `accept`** — `Accepted`, `Scheduled`,
      // `Published`, `Listed`, `Running` — a boundary drawn by the contract
      // rather than invented here: Art. IV(C) attaches cancellation pay to "a
      // course that an adjunct **has accepted** to teach", and to nothing
      // earlier. Art. IV(C)(2) prices the after-classes-begin case, which is
      // why `Running` is included.
      // https://github.com/nopivnick/lineup-prototype-03/issues/21
      //
      // Before acceptance there is nothing for `Canceled` to preserve — it
      // exists to keep the call number, SIS number, room and schedule that
      // https://github.com/nopivnick/lineup-prototype-03/issues/2 protected,
      // and a `Slated` or `Staffed` offering has none of them. `withdraw` and
      // `kill` cover that end of the lifecycle.
      | { type: "cancel" }

      // `revise` and `approve` are **gone**, along with the `Revising` state,
      // `revisingFrom`, `RevisableState` and the eight `was*` guards.
      // https://github.com/nopivnick/lineup-prototype-03/issues/17
      //
      // Both were inherited from the single machine these two were split out
      // of, where `approve` was the *curriculum* approval. Split into Course
      // and Offering, the Offering kept a copy of `approve` with no referent:
      // it was the only `approve` in this machine and nothing else here is an
      // approval, whereas Course's invalidates a specific prior one and can
      // reach `Rejected`.
      //
      // Editing an Offering is therefore an ordinary field write, gated by the
      // permission matrix
      // (https://github.com/nopivnick/lineup-prototype-03/issues/8) rather than
      // by lifecycle state. The forward path already carries the departmental
      // sign-offs — `schedule` and `publish` are where an offering's details
      // get checked — and `Revising` had exactly one exit, `approve`, with no
      // reject and no way to abandon, which is not a review gate.
      //
      // This is the act ticket 2 called revising the Offering ("a
      // co-instructor's refusal is handled out-of-band by revising the
      // Offering"). It survives as an act; it is no longer a transition.
      // Revising the *Course* is a different act on a different artifact, and
      // fires `revise` on the Course machine — including when a user reaches
      // it from an offering's screen.

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
      // The department pulling an offer that the lead has not answered — the act
      // that had no honest move before.
      // https://github.com/nopivnick/lineup-prototype-03/issues/19.
      // `decline` would have put a refusal in their history that never
      // happened, `cancel` means the class is not running (and is unavailable
      // this early), and `kill` discards the offering. Ticket 19 also ruled out
      // `revise`, on the grounds that it could not touch position 0; that event
      // has since been deleted outright
      // (https://github.com/nopivnick/lineup-prototype-03/issues/17), which
      // strengthens the conclusion rather than disturbing it.
      //
      // Leaves `Offered` and `Deferred` — the two states where no answer has
      // come back. `Deferred` was excluded when ticket 19 landed, on the
      // then-correct grounds that four inbound edges left it unable to certify
      // the lead hadn't already agreed;
      // https://github.com/nopivnick/lineup-prototype-03/issues/21 removed
      // three of those edges, and with one inbound edge from `Offered` the
      // certification holds.
      //
      // Distinct from `unstaff` rather than an extension of it. `unstaff` is
      // never user-facing — it is bookkeeping that fires from inside the
      // Server Action, and its whole justification is that no human chooses
      // it. `withdraw` is chosen by a human and has an external consequence,
      // because the lead was told. One event covering both would make the log
      // read identically for "we tidied a staffing plan nobody had seen" and
      // "we retracted an offer from someone waiting on an answer".
      //
      // Vacates position 0, the same `DELETE` in the same transaction as
      // `decline`, and carries the withdrawn instructor as `subject_netid`.
      | { type: "withdraw" }
      | { type: "publish" }
      | { type: "unstaff" }
      | { type: "schedule" }
      | { type: "evaluate" }
      | { type: "conclude" },
  },
  // **No guards.** This machine has none at all, and both absences are
  // deliberate deletions rather than omissions.
  //
  // `hasLead` was deleted rather than implemented: `Staffed` encodes the same
  // fact as a state, so `offer` is simply unreachable until a lead exists
  // (https://github.com/nopivnick/lineup-prototype-03/issues/15). The eight
  // `was*` guards went with the `Revising` state
  // (https://github.com/nopivnick/lineup-prototype-03/issues/17).
  //
  // Constraints the lifecycle cannot express are asserted in the Server Action
  // — see the `retry` comments on `Declined` and `Canceled` below.
}).createMachine({
  context: {},
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
     *
     * That writer **refuses a netid who does not hold the `instructor` role**
     * (https://github.com/nopivnick/lineup-prototype-03/issues/34) — standing
     * principle 6, and it applies to every roster row rather than position 0
     * alone, since position is scope for *events* while the role is the
     * qualification to teach. Without it, a roster row could name someone who
     * then could not `accept` their own offer: a permission is a conjunction of
     * a role and a relationship, so half of one is inert and reports nothing.
     * The check names no actor, which makes it an invariant rather than a
     * permission — so the `chair` added by that ticket, who bypasses
     * permissions entirely, still cannot be staffed without the role.
     *
     * `Slated` and `Staffed` are also the **only** two states in which position
     * 0 may be edited — filled here, swapped or vacated here. It is frozen from
     * `Offered` onward, where only `decline` and `withdraw` empty it and both
     * record who it was emptied of. That rule used to carry an explicit exception for
     * `Revising`, which no longer exists
     * (https://github.com/nopivnick/lineup-prototype-03/issues/17); deleting
     * the state removed a clause from the rule rather than weakening it.
     */
    Staffed: {
      on: {
        offer: {
          target: "Offered",
        },
        // Vacating position 0 before anyone has been asked. Cheap and silent:
        // nobody was ever told. From `Offered` onward this is unavailable, and
        // only `decline` and `withdraw` empty position 0 — both of which
        // record who it was emptied of.
        unstaff: {
          target: "Slated",
        },
        kill: {
          target: "Dead",
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
        // Provably honest here: `accept`, `decline` and `defer` are the sole
        // exits, so an offering still in `Offered` has had no answer back.
        //
        // `Deferred` is the other such state — see its `withdraw` below.
        // `Accepted` onward is a different act entirely — breaking an
        // agreement, not retracting a question — and is out of scope.
        //
        // Lands in `Slated`, not `Staffed`, and vacates position 0. `Staffed`
        // would keep the withdrawn lead seated and let the department swap in
        // a replacement, and swaps inside `Staffed` fire nothing — so the log
        // would show the offer pulled from one person and then re-sent to
        // nobody in particular. `Slated` forces `staff` and `offer` to fire
        // again, putting the replacement on the record.
        //
        // No `Withdrawn` state: `Declined` exists because a refusal leaves the
        // department stuck and `retry` forces the decision, whereas a
        // withdrawal *is* the department acting — it would only ever pass
        // through such a state on its way here.
        // https://github.com/nopivnick/lineup-prototype-03/issues/19
        withdraw: {
          target: "Slated",
        },
        defer: {
          target: "Deferred",
        },
      },
    },
    Dead: {
      type: "final",
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
        // The earliest `cancel` — this is the state `accept` creates, and
        // Art. IV(C) attaches the university's cancellation-pay obligation to
        // exactly that. A lead who has agreed and then finds they cannot teach
        // has `decline`; this is the department's side of the same situation.
        // https://github.com/nopivnick/lineup-prototype-03/issues/21
        cancel: {
          target: "Canceled",
        },
        // `defer` is gone from here. It meant "ask me later" from a lead who
        // had already answered, and it fed the ambiguity that made `Deferred`
        // unable to certify anything.
        // https://github.com/nopivnick/lineup-prototype-03/issues/21
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
    /**
     * The lead has been asked and has said "not yet" — they have neither
     * accepted nor refused. **One inbound edge, from `Offered`**, which is what
     * makes that sentence true of every offering in this state.
     * https://github.com/nopivnick/lineup-prototype-03/issues/21
     *
     * It used to have four (`Offered`, `Accepted`, `Scheduled`, `Published`),
     * so a deferred offering was sometimes "asked, hasn't answered" and
     * sometimes "said yes, then put it on hold" — obligations that point in
     * opposite directions, told apart only by the transition log's
     * `from_state`, which standing principle 2 forbids the machine from
     * reading. That ambiguity is what kept `withdraw` off it in ticket 19.
     *
     * The fix was to delete the three post-acceptance edges rather than to
     * split the state, so this is still **one** entry in `LIVE_STATES`, exactly
     * as https://github.com/nopivnick/lineup-prototype-03/issues/14 ruled. (It
     * was one entry in `RevisableState` too, and had a `wasDeferred` guard;
     * both are gone with the `Revising` state, which changes nothing about this
     * state's meaning — https://github.com/nopivnick/lineup-prototype-03/issues/17.)
     * It remains live: the department still intends to run the class.
     *
     * It survives as a state rather than collapsing into `Offered` (as a logged
     * self-transition) because a deferred offering **rests** here — parked-ness
     * is present-tense, which is what a `status` column holds. That is the
     * disanalogy with the rejected `Withdrawn` state, which an offering would
     * only ever pass through. The distinction it buys is operational: "who
     * hasn't replied at all?" wants a chase, "who asked for time?" wants a
     * wait.
     */
    Deferred: {
      on: {
        // Vacates position 0 — see the `decline` event above.
        decline: {
          target: "Declined",
        },
        accept: {
          target: "Accepted",
        },
        // The hole ticket 19 left deliberately visible, now closed. `Offered`'s
        // only exits are `accept`, `decline` and `defer`, and `defer` is by
        // definition not an answer — so an offering here has provably not
        // agreed, and retracting the question is honest.
        //
        // Identical to `Offered.withdraw` in every respect: lands in `Slated`,
        // vacates position 0 by the same `DELETE` in the Server Action's
        // transaction, carries the withdrawn instructor as `subject_netid`.
        // https://github.com/nopivnick/lineup-prototype-03/issues/21
        withdraw: {
          target: "Slated",
        },
      },
    },
    // `conclude` is the sole exit. It used to have `revise` as well — editing
    // an offering whose class has already been taught — which is the anomaly
    // that opened
    // https://github.com/nopivnick/lineup-prototype-03/issues/17. Post-hoc
    // correction of the record is a real need (wrong room, wrong instructor
    // credited, a call number keyed in wrong), but it is not a lifecycle
    // transition: nothing about the offering's progress changes, and routing it
    // through a `Revising` state made a concluded class briefly live again.
    // It is an ordinary field write, gated by permission.
    Evaluating: {
      on: {
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
        // there. Unconditional, no guard, and the proof is stated without
        // enumerating source states so that it survives `cancel` gaining new
        // ones: **every path into `Canceled` runs through `accept`, and nothing
        // downstream of `accept` vacates position 0 except `decline` and
        // `withdraw`, both of which leave the forward path** (to `Declined` and
        // `Slated` respectively). Position 0 is therefore provably occupied
        // here.
        //
        // The enumerated form of this argument has now been rewritten twice as
        // the machine grew — ticket 15 wrote it, ticket 19 reworded it, ticket
        // 21 added three more `cancel` sources — which is why it is phrased as
        // an invariant instead.
        // https://github.com/nopivnick/lineup-prototype-03/issues/21
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
        // `revise` is gone from here too, and for the same reason as
        // `Evaluating` above — correcting the record of an abandoned offering
        // is an edit, not a step in its lifecycle. Here it was worse than
        // anomalous: `Revising` was unconditionally live
        // (https://github.com/nopivnick/lineup-prototype-03/issues/14), so
        // revising a `Canceled` offering resurrected it into liveness and
        // blocked its Course from being retired — the exact outcome excluding
        // `Canceled` from `LIVE_STATES` was meant to prevent.
        // https://github.com/nopivnick/lineup-prototype-03/issues/17
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
        // Downstream of `accept`, so `cancel` reaches here.
        // https://github.com/nopivnick/lineup-prototype-03/issues/21
        cancel: {
          target: "Canceled",
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
        // Vacates position 0 — see the `decline` event above. An instructor
        // backing out after the offering is public is still a real act; what
        // is gone from here is `defer`, which let a published offering land in
        // `Deferred` whose only forward exit is `accept` → `Accepted`,
        // silently discarding the schedule and the publication.
        // https://github.com/nopivnick/lineup-prototype-03/issues/21
        decline: {
          target: "Declined",
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
        // A class that collapses mid-term. `Running` used to have `evaluate` as
        // its sole exit, which was recorded as a lifecycle observation rather
        // than a decision. Art. IV(C)(2) settles it: the contract prices
        // cancellation "after the first day of class begins" at twenty percent
        // plus a proportional amount for contact hours actually taught, so it
        // is a case the university has already agreed can happen.
        // https://github.com/nopivnick/lineup-prototype-03/issues/21
        cancel: {
          target: "Canceled",
        },
      },
    },
  },
});
