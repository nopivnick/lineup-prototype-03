/**
 * A moment, as the record page states it.
 *
 * **In UTC**, and that is a decision rather than a default: a moment is a
 * moment, and rendering the department's log in whatever zone a reader's laptop
 * happens to be set to would leave two people reading one page disagreeing about
 * what day something happened — the one thing a history is for.
 *
 * It is its own module because both halves of the page state a time and they
 * must state it identically: the history's lines, which are a Server Component,
 * and the rail's *last changed* box, which is a Client Component because the
 * actions beside it are.
 */
const STAMP = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export function stamp(at: string): string {
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? at : STAMP.format(parsed);
}
