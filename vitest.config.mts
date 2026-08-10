import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The test runner covers two things.
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
    setupFiles: ["./db/test-env.ts"],
  },
});
