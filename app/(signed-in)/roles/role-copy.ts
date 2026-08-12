import type { Role } from "@/lib/permissions";

/**
 * **What each role lets you do, in a sentence** (issues/38).
 *
 * Copy, not rules. The matrices say who may fire what and no sentence can be
 * derived from them, so these are written and kept beside the page that shows them
 * — the same standing this file's siblings give a state's colour or a program's
 * hue. What is **not** copy travels on the row instead: `kind` and *gates no
 * action* are read off `ROLE_KIND` and `HOLD_NOTHING_IN_THE_MATRIX` by the server,
 * so a role that stops being inert stops being marked without anybody editing this
 * file.
 *
 * Both maps are total `Record`s over the role union, so a role added to the model
 * is a compiler error here rather than a blank line on every record.
 */
export const WHAT_IT_LETS_YOU_DO: Readonly<Record<Role, string>> = {
  student: "Sees only the classes an instructor has agreed to teach. Registration is out of scope.",
  instructor: "May be staffed on a class. The lead accepts or declines it, and proposes courses.",
  advisor: "May be linked to an advisee. Nothing in the skeleton links one yet.",
  coordinator:
    "Runs scheduling day to day — moves classes through their lifecycle across every program.",
  program_director:
    "May be appointed to direct a program, which is what scopes every director permission. The appointment is the second write.",
  area_head: "May be put in charge of a course's area, and rule on its proposals.",
  chair: "Grants and revokes every role in the department, and is one clause ahead of every matrix.",
};

/** The short label a chip in the list and a heading on the record share. */
export const LABEL: Readonly<Record<Role, string>> = {
  student: "Student",
  instructor: "Instructor",
  advisor: "Advisor",
  coordinator: "Coordinator",
  program_director: "Program director",
  area_head: "Area head",
  chair: "Chair",
};

/**
 * *15 Aug 2018*, formatted in **UTC** on purpose: `granted_at` is an instant, and
 * rendering it in the reader's zone would put a grant made late in the evening on
 * the wrong day for anybody west of it.
 */
const GRANTED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function granted(at: string): string {
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? at : GRANTED.format(parsed);
}

/**
 * A stitched person as one string. **A netid with no `people` row is never
 * dropped** (issues/9), so the fallback is the identifier that is really theirs;
 * where there is room to say so, `PersonName` says *no name on file* beside it.
 */
export function named(person: { netid: string; displayName: string | null }): string {
  return person.displayName ?? person.netid;
}
