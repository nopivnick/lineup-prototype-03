/**
 * The **Course** lifecycle — a course already in one program's catalog.
 *
 * `docs/machines/course.machine.ts` is authoritative for the shape and
 * `docs/machines/README.md` for the reasoning; this file states the same
 * lifecycle as code the application runs (issues/76). Where the two ever
 * disagree the spec wins.
 *
 * A course does not begin life by being proposed. It is **minted** by an
 * approving review, already in `Approved`, in exactly one program's catalog —
 * issues/7 split the original machine at `approve` and moved `Proposed`,
 * `Developing` and `Rejected` to `course-proposal-review.machine.ts`. The tell
 * was `program_code`: null in exactly the three states that left, non-null in
 * exactly the three that stayed (standing principle 5).
 */
import { setup, type StateValueFrom } from "xstate";

import type { LiveState } from "./offering.machine";

/**
 * One Offering standing in the way of a `retire`, carried on the event that
 * attempts it. Three fields off the offering row, no join — enough for the UI to
 * render "Fall 2025 — Scheduled" as a link.
 *
 * `id` is a `string` and the row's key is a `number`, so the read module that
 * builds this puts a `String()` at the boundary (issues/93). `termCode` is the
 * `char(5)` term code (issues/3), camel-cased here against the schema's
 * `term_code`. The lead instructor is deliberately absent: naming them would
 * need a roster join, and the roster is relational (issues/15).
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
      // The Course machine's guard is the only guard in the map, and it does not
      // query: the caller runs the query and hands the result over. Context
      // would persist the answer inside the snapshot (issues/6), where it goes
      // stale the moment any offering transitions (standing principle 2).
      | { type: "retire"; liveOfferings: LiveOffering[] }
      // **The only revision in the system.** Revising the Course — title,
      // description, credits, the curriculum record — invalidates the approval
      // `Approved` asserts, so it re-opens it and needs a fresh `approve`.
      // Revising an *Offering* asserts nothing that needs re-approving and is an
      // ordinary field write; the Offering's own `revise` / `approve` pair was
      // deleted, having been the curriculum approval's orphaned copy
      // (issues/17).
      //
      // A user who notices the course is wrong while looking at one of its
      // offerings fires this event, from that screen. The Offering does not
      // move, and nothing about it freezes while its Course sits in `Revising`.
      | { type: "revise" }
      // Re-approval after a revision, and **not** the review's `approve`: that
      // one mints a course, this one restores an approval a `revise` re-opened
      // on a course that already has a program. The difference bites on
      // permissions — this event is program-scoped where the review's is not
      // (issues/8, amending issues/4).
      //
      // **It bumps `course.edition`**, and it is the only thing that does. A
      // stored copy of a fact `course_transition` already holds, legal under
      // standing principle 1 by the exemption route — `applyTransition` writes
      // both in one transaction, the shape `staff` and `Staffed` established
      // (issues/10, issues/15). On `approve` and not on `revise`,
      // because an edition is a thing that was published and stood, so the
      // number never has to go backwards.
      | { type: "approve" },
  },
  guards: {
    noLiveOfferings: function ({ event }) {
      // The guard does not decide what "live" means and does not query — it is a
      // predicate over a list it is handed. `LIVE_STATES` in
      // `offering.machine.ts` holds the definition; the write path runs the
      // query, inside the transaction that locks the course row (issues/14).
      //
      // The same list is what the UI renders as the disabled `retire` control's
      // reason, so the rule and its explanation cannot drift apart. A client
      // passing this to `.can()` is producing an affordance, not a decision.
      if (event.type !== "retire") return false;
      return event.liveOfferings?.length === 0;
    },
  },
}).createMachine({
  context: {},
  id: "Course",
  initial: "Approved",
  states: {
    Approved: {
      on: {
        revise: { target: "Revising" },
        retire: {
          target: "Retired",
          guard: { type: "noLiveOfferings" },
        },
      },
    },
    /**
     * An *approved* course being edited: `revise` leaves `Approved` and returns
     * to it, so there is never an approval missing for an offering to wait on.
     * The course body is writable **only** here, and that gate names no actor —
     * it binds the chair and the seed script alike (issues/8, issues/28).
     */
    Revising: {
      on: {
        approve: { target: "Approved" },
        retire: {
          target: "Retired",
          guard: { type: "noLiveOfferings" },
        },
      },
    },
    Retired: { type: "final" },
  },
});

/** Every state of this machine, derived from it rather than restated. */
export type CourseState = StateValueFrom<typeof machine>;

/**
 * The same set at runtime, in declaration order. `db/classes/schema.ts` builds
 * the `course_status` CHECK from this list and `db/machine-states.test.ts`
 * asserts the applied migration agrees — see `offering.machine.ts` for the
 * whole of that arrangement (issues/13).
 */
export const COURSE_STATES = Object.keys(machine.states) as CourseState[];
