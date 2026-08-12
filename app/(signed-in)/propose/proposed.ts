/**
 * **What the propose form asks for, and what makes it well formed** (issues/43,
 * issues/88).
 *
 * A plain module and not a `"use client"` one, deliberately — the same reason
 * `review-where.ts` is plain: the Server Action imports it too, and a client
 * module's exports reach the server as client **references**, which typechecks
 * and builds before it fails (issues/85).
 *
 * **It holds no rule.** The rules of proposing are `createProposal`'s — who may,
 * and that the program set may not be empty — and both reach the screen as the
 * writer's own `Refusal`. What is here is the form's *validity*: the two body
 * fields the schema requires, checked once and read by both sides, so the
 * disabled submit and the action's own guard cannot come apart. They already had:
 * the client asked `Number(credits) > 0` where the action asked for a safe
 * integer, which made a decimal a crash on one side of a boundary and a live
 * button on the other.
 */

/** The post, in the shape a browser sends it. */
export type Proposed = {
  title: string;
  description: string;
  credits: number | string;
  programs: readonly string[];
};

/**
 * The body as the writer takes it, or `null` where the form is not well formed
 * yet — **one function, so *well formed* is one answer.**
 *
 * **A blank description is an absence and not an empty string**, the same reading
 * `fireReviewEvent` gives a blank reason: the column is nullable and the two are
 * different facts.
 *
 * The programs are trimmed and de-duplicated rather than checked. Which codes
 * exist is the database's to say — `course_proposal_review`'s foreign key onto
 * `program` is one statement of it, and a second copy here would be a list to
 * keep in step with a table. *Asked twice* is plainly *asked*, and the unique key
 * on `(course_proposal_id, program_code)` would refuse it.
 */
export function bodyOf(
  proposed: Proposed,
): { title: string; description: string | null; credits: number; programs: string[] } | null {
  if (bodyProblem(proposed) !== null) return null;

  const description = proposed.description.trim();

  return {
    title: proposed.title.trim(),
    description: description.length > 0 ? description : null,
    credits: Number(proposed.credits),
    programs: [...new Set(proposed.programs.map((code) => code.trim()).filter(Boolean))],
  };
}

/**
 * The first thing standing between this body and a well-formed submit, in the
 * order the fields are asked — one sentence, because a list of two is a wall and
 * the reader fixes them one at a time anyway.
 *
 * These are **the form's own validity and not the department's rules**, which is
 * why they are sentences here and refusals everywhere else in the map: nothing
 * about a person or a state decides them, and `course_proposal`'s own `NOT NULL`
 * and `credits > 0` CHECK are what they are stating one step earlier.
 */
export function bodyProblem(proposed: Proposed): string | null {
  if (proposed.title.trim().length === 0) return "A proposal needs a title.";

  const credits = Number(proposed.credits);
  if (!Number.isSafeInteger(credits) || credits <= 0) {
    return "A proposal needs a whole number of credits, greater than zero.";
  }

  return null;
}
