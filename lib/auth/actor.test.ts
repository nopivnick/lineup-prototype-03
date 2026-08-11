/**
 * **The identity seam** (issues/11, issues/79).
 *
 * Four claims, and none of them is about a cookie library. They are the four
 * things `docs/data-access/README.md` says have to stay true of whatever module
 * sits here: the gate is `ALLOW_DEV_ACTOR` and the module will not load without
 * it, `null` is an ordinary answer rather than an error, what the reader hands
 * back is a **bare netid and nothing else**, and a caller that needs an actor
 * gets a rejection rather than a guess.
 *
 * The last two are the ones a later change is most likely to break by being
 * helpful — folding roles into the actor to save a lookup, or defaulting to a
 * fixture user so a page never has to branch. issues/11 rejected both by name.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The cookie jar the mocked `next/headers` writes into. A `Map`, because the
 * only thing under test is what the reader does with a string that is either
 * there or not.
 */
const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

/**
 * The gate runs at module scope, so every test loads the module afresh rather
 * than importing it at the top of the file. That is the shape of the thing being
 * asserted: a build carrying this reader without the flag does not start.
 */
function loadActor() {
  vi.resetModules();
  return import("./actor");
}

beforeEach(() => {
  jar.clear();
  vi.stubEnv("ALLOW_DEV_ACTOR", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the dev identity reader", () => {
  test("will not load at all without ALLOW_DEV_ACTOR", async () => {
    vi.stubEnv("ALLOW_DEV_ACTOR", undefined);

    await expect(loadActor()).rejects.toThrow(/ALLOW_DEV_ACTOR/);
  });

  test("does not read NODE_ENV", async () => {
    // Vercel sets `NODE_ENV=production` on previews too, and the skeleton exists
    // to be shown on one. A gate that keyed on this would brick that deployment.
    vi.stubEnv("NODE_ENV", "production");

    const { getActor } = await loadActor();
    jar.set("lineup_dev_actor", "tv1067");

    await expect(getActor()).resolves.toEqual({ netid: "tv1067" });
  });

  test("returns null when nobody has been chosen, and that is not an error", async () => {
    const { getActor } = await loadActor();

    await expect(getActor()).resolves.toBeNull();
  });

  test("carries a netid and nothing else", async () => {
    const { getActor, writeActorCookie } = await loadActor();
    await writeActorCookie("pr3390");

    const actor = await getActor();

    expect(actor).not.toBeNull();
    // The assertion is the *absence* of everything else: a role set resolved at
    // request scope would be stale by the time a writer used it, so it is read
    // inside the locking transaction instead (issues/28, `db/write/rules.ts`).
    expect(Object.keys(actor!)).toEqual(["netid"]);
    expect(actor!.netid).toBe("pr3390");
  });

  test("clearing the cookie makes the actor null again", async () => {
    const { clearActorCookie, getActor, writeActorCookie } = await loadActor();
    await writeActorCookie("pr3390");

    await clearActorCookie();

    await expect(getActor()).resolves.toBeNull();
  });

  test("requireActor rejects rather than inventing a fallback user", async () => {
    const { requireActor } = await loadActor();

    await expect(requireActor()).rejects.toThrow();
  });

  test("requireActor hands back the actor when there is one", async () => {
    const { requireActor, writeActorCookie } = await loadActor();
    await writeActorCookie("dk2210");

    await expect(requireActor()).resolves.toEqual({ netid: "dk2210" });
  });
});
