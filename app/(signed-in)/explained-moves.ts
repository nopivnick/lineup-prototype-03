/**
 * **The two moves that ask why** (issues/10, issues/37) — one answer, shared,
 * rather than one answer written twice (issues/84).
 *
 * `reason` is free text and optional **on every event** — the schema says so and
 * the writer takes it from all of them — so *which controls offer a box* is a
 * question about the screen rather than about the rules. These two are the acts
 * that end something the department had committed to running, and the two where
 * the state pair in the log cannot reconstruct *why*: `Accepted → Canceled` says
 * a class was pulled and nothing about whether enrolment collapsed or a room did.
 *
 * **It is a module of its own because both screens fire the same Server Action
 * and a `"use server"` file may export nothing but async functions**, so this
 * could not simply sit beside `fireOfferingEvent`. Shared rather than copied for
 * the reason `offeringActionsFor` and `asMeeting` are: a third explained event
 * added to one copy would leave the Lineup's menu asking and the class rail
 * firing straight past it, writing `null` where a human had something to say.
 *
 * The box is optional either way, and skipping it writes `null` rather than an
 * empty string: a blank reason and no reason are different facts, and the log has
 * room for both.
 */
export const EXPLAINED: ReadonlySet<string> = new Set(["cancel", "kill"]);
