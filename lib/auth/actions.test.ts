/**
 * **The dev bar's two Server Actions** (issues/11, issues/79).
 *
 * The claim this file exists for is the one `docs/data-access/` states about
 * every Server Action in the skeleton, not just these two: **an action that
 * resolves a null actor rejects.** It never guesses, never falls back to a
 * fixture user, and never writes on behalf of nobody — which matters most for
 * the write paths, whose transition log names whoever fired the event.
 *
 * The other two claims are about the payload: what the switcher persists is a
 * netid and nothing else, and the netid it persists is one of the seed's people
 * rather than any string a caller cares to post.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { DirectoryPerson } from "@/db/read/directory";

const jar = new Map<string, { value: string; options: Record<string, unknown> }>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) =>
      void jar.set(name, { value, options }),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const revalidated = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidated(...args) }));

const redirected = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...args: unknown[]) => redirected(...args) }));

/** The thirteen, standing in for the seed's. Two of them is enough to be a set. */
const DIRECTORY: DirectoryPerson[] = [
  { netid: "tv1067", displayName: "Theo Vance", roles: ["chair"] },
  { netid: "mo5512", displayName: "Marcus Ola", roles: ["student"] },
];

vi.mock("@/db/read/directory", () => ({ listDirectory: async () => DIRECTORY }));

function loadActions() {
  vi.resetModules();
  return import("./actions");
}

beforeEach(() => {
  jar.clear();
  revalidated.mockClear();
  redirected.mockClear();
  vi.stubEnv("ALLOW_DEV_ACTOR", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("beSomebody", () => {
  test("persists a bare netid, and nothing else", async () => {
    const { beSomebody } = await loadActions();

    await beSomebody("tv1067");

    expect(jar.get("lineup_dev_actor")?.value).toBe("tv1067");
    expect(revalidated).toHaveBeenCalledWith("/", "layout");
  });

  test("switching is one write, so the second choice replaces the first", async () => {
    const { beSomebody } = await loadActions();

    await beSomebody("tv1067");
    await beSomebody("mo5512");

    expect(jar.get("lineup_dev_actor")?.value).toBe("mo5512");
  });

  test("refuses a netid the directory does not list", async () => {
    const { beSomebody } = await loadActions();

    await expect(beSomebody("xq7742")).rejects.toThrow(/xq7742/);
    expect(jar.has("lineup_dev_actor")).toBe(false);
  });
});

describe("beNobody", () => {
  test("rejects when it resolves a null actor", async () => {
    const { beNobody } = await loadActions();

    await expect(beNobody()).rejects.toThrow();
    expect(redirected).not.toHaveBeenCalled();
  });

  test("clears the cookie and sends the reader back to the picker", async () => {
    const { beNobody, beSomebody } = await loadActions();
    await beSomebody("tv1067");

    await beNobody();

    expect(jar.has("lineup_dev_actor")).toBe(false);
    expect(redirected).toHaveBeenCalledWith("/be-somebody");
  });
});
