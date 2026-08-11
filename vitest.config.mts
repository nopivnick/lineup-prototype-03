import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The test runner covers three things.
 *
 * The first is the one test the map owes (`db/machine-states.test.ts`), which
 * reads SQL and TypeScript and needs no database — issues/13 made a failing CI
 * run the alarm for a machine changed without a migration behind it, in place of
 * a `machine_version` column.
 *
 * The second is **Seam 1** (issues/74, issues/77): the four write paths, called
 * directly with a netid as the actor, against a **real** database pair. That is
 * forced rather than preferred — `docs/data-access/` states in terms strong
 * enough to warn an agent off that these are modules with one adapter and no
 * swappable implementations, and a fake could not exercise the locking
 * transaction, the generated `status` column, the CHECK constraints or the
 * cross-project check that a netid is somebody the directory knows.
 *
 * Those tests **skip themselves** when the two connection strings are absent, so
 * the machine-states alarm still runs in CI, where there is no database.
 *
 * The third is `scripts/deployment-protection.test.ts` (issues/80): the rule that
 * says whether the deployment carrying the dev identity reader could be reached
 * with a link alone. It is a pure function over two Vercel API payloads, so it
 * runs here for the same reason the machine-states alarm does — the thing it
 * reasons about is elsewhere, and reading it needs no network. Its **caller**
 * needs a credential and is deliberately not a test.
 *
 * `docs/` is excluded for the same reason `eslint.config.mjs` ignores it: the
 * artifacts there are reference and are covered by `npm run typecheck` against
 * `tsconfig.docs.json`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
    /**
     * `lib/permissions.ts` and every write path import `server-only`, which
     * throws under every condition but this one. That is the point of the
     * package: a Client Component reaching for the rules fails the build. A test
     * is server-side by definition, so it resolves the same way a Server
     * Component does.
     */
    conditions: ["react-server", "node", "import", "default"],
  },
  // The same list again for externalised dependencies, which is how `server-only`
  // is loaded: Vitest does not transform anything in `node_modules`, so the
  // condition has to be set on the side that actually resolves it.
  ssr: {
    resolve: {
      conditions: ["react-server", "node", "import", "default"],
      externalConditions: ["react-server", "node", "import", "default"],
    },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "docs/**"],
    // The Seam 1 tests share one database pair and each rebuilds the world, so
    // two files running at once would assert against rows the other wrote.
    fileParallelism: false,
    /**
     * **Rebuilding the world is the test, not the setup** (issues/81).
     *
     * A Seam test's `beforeEach` drives a proposal, a review, a mint and an
     * offering through the write paths against a hosted database over a pooler
     * — two dozen sequential transactions, seconds rather than milliseconds, and
     * re-run before every test in the file. Vitest's five-second default was
     * already being spent almost entirely on that, so a test that then asked one
     * question too many failed as a timeout and left its transaction open. The
     * next file's `TRUNCATE` deadlocked against the abandoned one, which reads as
     * a database fault rather than as a slow test.
     *
     * **Both timeouts, because the expensive half is the hook and the hook has
     * its own** — `hookTimeout` defaults to ten seconds and `testTimeout` does
     * not govern it, so raising one alone leaves the world builder as the thing
     * most likely to abort mid-transaction and produce that same deadlock.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ["./db/test-env.ts"],
  },
});
