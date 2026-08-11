import "server-only";

/**
 * **The refused thing and its explanation are one value** (issues/14).
 *
 * A writer refuses by throwing one of these rather than by returning a boolean,
 * so a caller cannot proceed having ignored the answer, and the transaction rolls
 * back with nothing written. The read modules ship the same shape ahead of the
 * click, as `PermittedAction`'s `refusal` — which is what makes the rule and its
 * explanation impossible to drift apart, since both are computed from the same
 * routes by the same functions.
 *
 * The wording rules are three clauses, accumulated across three tickets:
 *
 *   1. the refused thing and its reason are one object (issues/14);
 *   2. **name the person or the role, never the rule** (issues/37) — the writer
 *      names the role, having no directory to resolve a name from;
 *   3. **name the dependency and list it** (issues/38), where the refusal's whole
 *      content is data elsewhere in the system. `dependencies` is that list, and
 *      it is empty for the refusals that name only a role.
 */
export type Refusal = {
  sentence: string;
  dependencies: readonly string[];
};

/**
 * **Several refusals, not one.** issues/28 ANDs a state predicate and a role
 * predicate on a field write and checks them **separately**, so both can fail at
 * once and both must be reportable — an `Approved` course read by another
 * program's director refuses its body on both counts, and stating one hides the
 * wall the reader walks into next (issues/62).
 *
 * A transition refusal is always one; a field refusal is sometimes two per class,
 * across as many classes as the write named.
 */
export class WriteRefused extends Error {
  readonly refusals: readonly Refusal[];

  constructor(refusals: readonly Refusal[]) {
    super(refusals.map((refused) => refused.sentence).join(" "));
    this.name = "WriteRefused";
    this.refusals = refusals;
  }
}

export function refusal(sentence: string, dependencies: readonly string[] = []): Refusal {
  return { sentence, dependencies };
}

/** Refuse with one sentence. */
export function refuse(sentence: string, dependencies: readonly string[] = []): never {
  throw new WriteRefused([refusal(sentence, dependencies)]);
}

/** Refuse with everything that failed, where more than one thing can (issues/62). */
export function refuseAll(refusals: readonly Refusal[]): never {
  throw new WriteRefused(refusals);
}
