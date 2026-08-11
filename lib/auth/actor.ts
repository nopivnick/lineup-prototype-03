import "server-only";

import { cookies } from "next/headers";

/**
 * **The application's only identity import, and the whole of the seam to real
 * auth** (issues/11, issues/79).
 *
 * There is **exactly one implementation at a time and no `if (dev)` anywhere**.
 * That is the structural fact, not the gate below it: wiring NYU's SSO means
 * replacing this module's body, so *the dev path is still in* and *SSO is wired*
 * cannot both be true. A branch would have made them able to be, and would have
 * left the dev reader in the tree of every real deployment forever.
 *
 * **The gate keys on `ALLOW_DEV_ACTOR` and never on `NODE_ENV`.** Vercel sets
 * `NODE_ENV=production` on preview deployments too, so a `NODE_ENV` gate would
 * brick the exact deployment this skeleton exists to be shown on. The **absence**
 * of the variable is what a real production deploy looks like, and this module
 * refuses to load into one rather than quietly serving an impersonation reader.
 *
 * The inherited risk rides with that choice and is recorded rather than
 * mitigated: the flag is chosen *so preview deploys carry it*, which means a
 * preview URL lets anyone with the link be any user. See
 * `docs/README.md#what-the-build-effort-inherits` — it is the one inherited
 * constraint that is a live risk rather than a design note, and the deployment
 * needs its own protection.
 */
if (!process.env.ALLOW_DEV_ACTOR) {
  throw new Error(
    "ALLOW_DEV_ACTOR is not set and this build carries the dev identity reader (issues/11). " +
      "Set it — see .env.example — or replace lib/auth/actor.ts's body with real SSO. " +
      "There is no third state: the dev path is in, or SSO is wired.",
  );
}

/**
 * **The cookie's entire payload is a bare netid**, and the name never leaves this
 * module — the two functions that write it are below, so nothing else in the app
 * can reach the cookie at all.
 *
 * A serialized `{netid, roles}` cookie was rejected (issues/11): it makes the
 * JSON an interface, and the role set has changed three times (issues/4,
 * issues/8, issues/34), each change leaving stale cookies deserializing into
 * actors holding roles that no longer exist. An index into a fixture array was
 * worse — identity coupled to fixture ordering, with no error when the array is
 * reordered. A netid derives roles; roles do not derive a netid.
 */
const DEV_ACTOR_COOKIE = "lineup_dev_actor";

/**
 * The actor. A bare netid and nothing more (issues/11, confirmed with a stronger
 * reason by issues/28).
 *
 * Roles are **not** here, deliberately. Every relationship a permission consults
 * is re-read inside the locking transaction — `readActorFacts` in
 * `db/write/rules.ts` — and this runs at request scope, so a role set resolved
 * here would already be stale by the time a writer used it. The chair may have
 * revoked a grant in between, and the whole point of the lock is that the row and
 * the rules are read together.
 */
export type Actor = { netid: string };

/**
 * Who is acting, or nobody.
 *
 * **`null` is not an error**: it means no cookie, and the app sends the reader to
 * the picker instead of the page, which is the same shape as *no session → sign
 * in*. SSO therefore **replaces** an entry screen rather than deleting a concept.
 * A fallback fixture user was rejected for being a concept real auth has no
 * counterpart for, and for making *nobody chose* indistinguishable from *someone
 * chose the first user*.
 */
export async function getActor(): Promise<Actor | null> {
  const netid = (await cookies()).get(DEV_ACTOR_COOKIE)?.value;
  return netid ? { netid } : null;
}

/**
 * The actor, or a rejection — **the first line of every Server Action**.
 *
 * A Server Action is an actor-resolution wrapper and nothing else: call this,
 * open a transaction with `writeToClasses`, and call one of the four write paths
 * in. It holds no rules, because every check is inside the writer (issues/28),
 * and it holds no fallback, because an action that guessed at an actor would
 * write that guess into the transition log.
 */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    throw new Error("No actor: this action needs somebody to be acting (issues/11).");
  }
  return actor;
}

/**
 * **Written by a Server Action, never by the client** (issues/11) — `lib/auth/
 * actions.ts` is the only caller, and it is the only place the cookie is set.
 *
 * `httpOnly` because nothing in the browser has any business reading it: the dev
 * bar renders from what the server already handed it. There is no `secure` flag
 * and no `NODE_ENV` behind one — the payload is a netid rather than a secret, the
 * read tiers are a product rule rather than a security boundary (issues/28), and
 * a `NODE_ENV` branch is the single thing this seam refuses.
 */
export async function writeActorCookie(netid: string): Promise<void> {
  (await cookies()).set(DEV_ACTOR_COOKIE, netid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Long enough that a demo survives a weekend, and expiring at all only so a
    // stale browser eventually lands back on the picker.
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Stop being anybody, and land back on the picker. */
export async function clearActorCookie(): Promise<void> {
  (await cookies()).delete(DEV_ACTOR_COOKIE);
}
