/**
 * The **Offering** lifecycle — one taught class in one term, from the decision
 * to run it through to the end of teaching.
 *
 * `docs/machines/offering.machine.ts` is authoritative for the shape and
 * `docs/machines/README.md` for the reasoning behind every edge; this file
 * states the same lifecycle as code the application runs (issues/76). Where the
 * two ever disagree the spec wins. The comments here carry what a reader of the
 * running system needs — chiefly the constraints the lifecycle cannot express,
 * which the write paths assert — and each names the ticket that settled it.
 *
 * Three facts hold for all three machines:
 *
 *   * **Flat, deliberately** (issues/6). A history or parallel state would make
 *     `snapshot.value` sometimes an object, and the generated `status` column
 *     the catalog filters on is `snapshot->>'value'`.
 *   * **Context is empty.** Facts the machine did not itself produce ride on the
 *     event, never in context, because context persists inside the snapshot and
 *     a cached query result there is a stale copy (standing principle 2).
 *   * **The state set is the machine's own**, read back off it below rather than
 *     restated. `db/classes/schema.ts` builds its CHECK from that list, and
 *     `db/machine-states.test.ts` asserts the migration agrees (issues/13).
 */
import { setup, type StateValueFrom } from "xstate";

export const machine = setup({
  types: {
    context: {} as Record<string, never>,
    events: {} as
      // `staff` / `unstaff` track **occupancy, not identity**: they say position
      // 0 became occupied or vacant, and swapping lead A for lead B inside
      // `Staffed` fires nothing, because the state stays true.
      //
      // **Never user-facing** (issues/15, issues/28). One writer inserts the
      // `offering_instructor` row and sends the event in the same transaction,
      // and the action layer exposes a narrower event union than
      // `applyTransition` accepts — so a roster that disagrees with the state
      // has no code path. That writer refuses a netid without the `instructor`
      // role (standing principle 6) and one the `people` project does not know
      // (issues/9).
      | { type: "staff" }
      | { type: "unstaff" }
      // The asking. Carries `subject_netid` on its log row since issues/41: the
      // roster row survives the event but not the offering, so a log read after
      // a withdraw-and-reoffer would attribute the offer to nobody.
      | { type: "offer" }
      // The lead's three answers. All three are available to the lead, to a
      // `coordinator` and to the offering's director (issues/8): `actor_netid`
      // records who clicked, and a refusal arriving by email is routinely
      // clicked by an admin. `accept` carries `subject_netid` for the same
      // reason `offer` does (issues/41).
      | { type: "accept" }
      // **Vacates position 0** — a `DELETE` against `offering_instructor` in the
      // same transaction as the snapshot and the log row, not an XState action:
      // the roster is relational and the machine cannot write to it (issues/15).
      // The declining instructor is the log row's `subject_netid`, or who said
      // no would survive nowhere.
      | { type: "decline" }
      // "Ask me later", from `Offered` and nowhere else (issues/21). It is the
      // lead's third answer and not the department putting an offering on hold.
      | { type: "defer" }
      // The department retracting an offer the lead has not answered
      // (issues/19, issues/21). Distinct from `unstaff`, which no human chooses:
      // the lead was told, so the act needs a paper trail. Vacates position 0 by
      // the same `DELETE` as `decline`, and carries `subject_netid`.
      | { type: "withdraw" }
      // The department pulling a class it has committed to running. Available
      // exactly downstream of `accept`, a boundary the ACT-UAW Local 7902
      // contract draws rather than this map: Art. IV(C) attaches cancellation
      // pay to "a course that an adjunct has accepted to teach" (issues/21).
      | { type: "cancel" }
      // The forward path — departmental bookkeeping, `coordinator` or the
      // offering's director (issues/8). None of it can be automated: issues/3
      // deferred term dates, so nothing can compute when a class starts.
      | { type: "schedule" }
      | { type: "publish" }
      | { type: "list" }
      | { type: "run" }
      | { type: "evaluate" }
      | { type: "conclude" }
      // Reviving a `Declined` or `Canceled` offering, and destroying one.
      // Director only (issues/8).
      | { type: "retry" }
      | { type: "kill" },
  },
  // **No guards at all**, and both absences are deletions rather than omissions.
  // `hasLead` is gone because `Staffed` encodes the same fact as a state, so
  // `offer` is unreachable without a lead (issues/15); the eight `was*` guards
  // went with the `Revising` state (issues/17).
  //
  // The one constraint this lifecycle cannot express is asserted in
  // `applyTransition`: **`retry` is refused when the Course is `Retired`**
  // (issues/14). A second door onto the same contradiction — creating a fresh
  // offering of a `Retired` course — is refused in the offering create path
  // (issues/43).
}).createMachine({
  context: {},
  id: "Offering",
  initial: "Slated",
  // Declared in lifecycle order. `OFFERING_STATES` below is read off this
  // object, and `db/classes/schema.ts` builds the CHECK from that, so this order
  // is the order the constraint reads in.
  states: {
    /**
     * The department has decided to run this class and has not picked who to
     * ask. A state departments genuinely rest in — the term's staffing plan is
     * assembled before offers go out — and it makes *"which Fall offerings still
     * need an instructor?"* a `status` filter rather than an anti-join.
     */
    Slated: {
      on: {
        staff: { target: "Staffed" },
        kill: { target: "Dead" },
      },
    },
    /**
     * Position 0 is occupied; no offer has gone out. Means exactly that, never
     * "the roster is final" — co-instructors at 1..n are non-gating and are
     * added and removed in any state (issues/2, issues/15).
     *
     * `Slated` and `Staffed` are the **only** states in which position 0 may be
     * written. It is frozen from `Offered` onward, where only `decline` and
     * `withdraw` empty it and both record who it was emptied of (issues/15).
     */
    Staffed: {
      on: {
        offer: { target: "Offered" },
        // Vacating before anyone was asked: cheap and silent, because nobody
        // was ever told.
        unstaff: { target: "Slated" },
        kill: { target: "Dead" },
      },
    },
    /**
     * Asked, no answer back — `accept`, `decline` and `defer` are its sole
     * exits, which is what makes `withdraw` provably honest here.
     */
    Offered: {
      on: {
        accept: { target: "Accepted" },
        decline: { target: "Declined" },
        defer: { target: "Deferred" },
        // Lands in `Slated`, not `Staffed`: swaps inside `Staffed` fire nothing,
        // so the log would show the offer pulled from one person and re-sent to
        // nobody in particular. `Slated` forces `staff` then `offer` to fire
        // again, putting the replacement on the record (issues/19).
        withdraw: { target: "Slated" },
      },
    },
    Accepted: {
      on: {
        schedule: { target: "Scheduled" },
        decline: { target: "Declined" },
        // The earliest `cancel` — this is the state `accept` creates, which is
        // exactly what the cancellation-pay obligation attaches to (issues/21).
        cancel: { target: "Canceled" },
      },
    },
    /**
     * The lead said no. Recoverable: `retry` re-slates rather than discarding
     * the offering, because `decline` is reachable from `Published` and a
     * dead end would have forced `kill` on a scheduled, published class
     * (issues/2).
     *
     * Not live, so a `Declined` offering never blocks its Course from being
     * retired — which is why `retry` carries the `Retired`-course refusal
     * (issues/14). It lands in `Slated` and needs no guard to say so: `decline`
     * vacated position 0 on the way in, so this offering provably has no lead.
     */
    Declined: {
      on: {
        retry: { target: "Slated" },
        kill: { target: "Dead" },
      },
    },
    /**
     * Asked and unanswered — "not yet". **One inbound edge**, from `Offered`,
     * which is what makes that sentence true of every offering here and what
     * lets `withdraw` leave it (issues/21). It rests here, and parked-ness is
     * present-tense, which is what a `status` column holds; the operational
     * distinction it buys is that *who hasn't replied at all?* wants a chase
     * while *who asked for time?* wants a wait.
     */
    Deferred: {
      on: {
        accept: { target: "Accepted" },
        decline: { target: "Declined" },
        // Identical to `Offered.withdraw` in every respect (issues/21).
        withdraw: { target: "Slated" },
      },
    },
    Scheduled: {
      on: {
        publish: { target: "Published" },
        decline: { target: "Declined" },
        cancel: { target: "Canceled" },
      },
    },
    Published: {
      on: {
        list: { target: "Listed" },
        cancel: { target: "Canceled" },
        // An instructor backing out after the offering is public is still a real
        // act. What is gone from here is `defer`, which let a published offering
        // land in a state whose only forward exit silently discarded the
        // schedule and the publication (issues/21).
        decline: { target: "Declined" },
      },
    },
    Listed: {
      on: {
        run: { target: "Running" },
        cancel: { target: "Canceled" },
      },
    },
    Running: {
      on: {
        evaluate: { target: "Evaluating" },
        // A class that collapses mid-term. The contract prices cancellation
        // after the first day of class, so it is a case the university has
        // already agreed can happen (issues/21).
        cancel: { target: "Canceled" },
      },
    },
    /**
     * A closed backwater: `conclude` is the sole exit, and nothing re-enters the
     * forward path. Correcting the record of a finished offering — wrong room,
     * wrong instructor credited, a call number keyed in wrong — is an ordinary
     * field write and not a transition (issues/17).
     */
    Evaluating: {
      on: {
        conclude: { target: "Concluded" },
      },
    },
    /**
     * The department pulled the class. Not live — and this is the state that
     * forced that definition, since `cancel` is how you clear the way to retire
     * a Course (issues/14).
     *
     * `retry` lands in `Staffed`, unlike `Declined`, and the proof is stated so
     * that it survives `cancel` gaining new source states: **every path into
     * `Canceled` runs through `accept`, and nothing downstream of `accept`
     * vacates position 0 except `decline` and `withdraw`, both of which leave
     * the forward path.** Position 0 is therefore provably occupied here
     * (issues/15, issues/21).
     */
    Canceled: {
      on: {
        retry: { target: "Staffed" },
        kill: { target: "Dead" },
      },
    },
    Concluded: { type: "final" },
    Dead: { type: "final" },
  },
});

/**
 * Every state of this machine, as a type. Derived from the machine rather than
 * hand-maintained beside it, so a renamed state cannot leave a stale union
 * behind.
 */
export type OfferingState = StateValueFrom<typeof machine>;

/**
 * The same set at runtime, in the machine's own declaration order. Read off the
 * machine for the reason issues/13 preferred a derived `SELECT DISTINCT status`
 * to a declared `machine_version` column: **prefer the form that cannot be
 * forgotten.**
 *
 * `db/classes/schema.ts` builds the `offering_status` CHECK from this list, and
 * `db/machine-states.test.ts` asserts that the applied migration still agrees —
 * which is the alarm for a machine changed without a migration behind it. The
 * fix when it fires is `npm run db:reset`; there is no snapshot migration
 * function by construction.
 */
export const OFFERING_STATES = Object.keys(machine.states) as OfferingState[];

/**
 * The states in which an Offering blocks its Course from being retired — the
 * definition of "live" behind the Course machine's `noLiveOfferings` guard
 * (issues/14). **Live ends when teaching ends**: the forward path up to and
 * including `Running`.
 *
 * Deliberately a constant and not an `is_live` generated column: the set is
 * arguable policy, and policy in a generated column costs a migration and a
 * table rewrite to change. The query that builds a `retire` event's
 * `liveOfferings` spreads it into a `status IN (...)`.
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
 * the two roles that hold nothing anywhere in the matrix (issues/28). The rule
 * is **an instructor agreed to teach this, or did once**; the six excluded
 * states are the department's staffing process, which is internal work.
 *
 * Drawn at `accept` because that boundary is *certifiable* and the obvious one
 * is not: `Canceled` has inbound edges from before publication, so it cannot say
 * whether it was ever published. `Canceled` is deliberately included — a class
 * that was going to run and isn't is what a student most needs to see.
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
