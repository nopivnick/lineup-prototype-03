/**
 * **One hue per program** (issues/37, issues/82, issues/85).
 *
 * **Not read off the database**, because a program's colour is not a fact the
 * schema holds and inventing a column for it is a migration in exchange for
 * nothing; and not hashed from the code either, because three named programs
 * whose chips a reader learns are worth more than a rule that survives a fourth.
 * An unknown code falls back to grey, which still carries the program's name.
 *
 * It is a module of its own because **three screens now render a program chip**
 * — the Lineup's seat-sharing tags, the class page's, and the proposals list's
 * verdicts — and a hue that meant one thing on one screen and another on the
 * next would break the only thing a colour is doing here, which is being
 * recognised. It moved up beside `named.tsx` and `stamp.ts` for the reason those
 * moved (issues/84): two copies of a rendering is how one of them quietly
 * becomes a different rendering.
 *
 * Colour is never the only signal. A seat-sharing chip carries four (the other
 * program's name, its hue, a dashed edge and a `↳`) and a verdict chip carries
 * three (the program's code, the glyph and the hue), so a reader who cannot tell
 * indigo from grape loses nothing.
 */
export const PROGRAM_HUE: Readonly<Record<string, string>> = {
  ITP: "indigo",
  IMA: "grape",
  LOWRES: "teal",
};

/** The hue for a program code, grey for one nobody has chosen a colour for. */
export function hueOf(programCode: string): string {
  return PROGRAM_HUE[programCode] ?? "gray";
}
