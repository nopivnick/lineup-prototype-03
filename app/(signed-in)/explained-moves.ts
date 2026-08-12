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

/**
 * **The two review moves that ask why** — the same question asked of a different
 * machine (issues/10, issues/42, issues/85).
 *
 * A separate set rather than three more strings in the one above, because the
 * two machines share no event names and a set that spanned both would be a
 * lookup answering for events its screen could never fire. The test is the same
 * test: is *why* something the state pair in the log could not reconstruct?
 *
 *   * `develop` sends the proposal back for work, and the reason **is** the
 *     request — *"the outcomes overlap Creative Coding almost exactly"* is the
 *     whole content of the move, and `Proposed → Developing` carries none of it.
 *   * `reject` is final and leads nowhere at all, which makes it the one verdict
 *     whose reason is the only thing a proposer gets to read.
 *
 * `approve` is deliberately not here, and not because it needs no explanation:
 * it asks for something else, a **course number**, which is not optional and is
 * part of what the event is. The screen asks for both in one box; only one of
 * them is this set's business.
 */
export const EXPLAINED_REVIEW: ReadonlySet<string> = new Set(["develop", "reject"]);
