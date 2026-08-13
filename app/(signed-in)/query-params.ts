/**
 * **Reading a query parameter, the one way three screens read one** (issues/82,
 * issues/85, issues/89).
 *
 * The sixth thing to move up beside `named.tsx`, `stamp.ts`, `program-hue.ts`,
 * `verdicts.tsx`, `refused.tsx` and `history-row.tsx`, and it moves for the
 * reason those moved: a rule the map states in one sentence, carried privately by
 * three pages, is how one copy quietly stops obeying the sentence. The Lineup and
 * the proposals list each held an identical private copy; the slating form was
 * about to be the third, which is the count that made `refused.tsx` worth moving.
 *
 * A plain module and not a `"use client"` one — every caller is a Server
 * Component, and a client module's exports reach the server as client
 * **references**, which typechecks and builds before it fails (issues/85).
 */

/**
 * **A repeated query parameter is a caller's mistake, not a second filter.**
 *
 * Next hands `?term=A&term=B` back as an array, and a page that treated it as one
 * would be inventing a way to ask for two terms that no control can produce. The
 * first value wins; whether it names anything is the page's own question, and on
 * the Lineup that is `offered`, which narrows every filter to something its picker
 * actually offers.
 */
export function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
