import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The test runner exists for one test the map owes
 * (`db/machine-states.test.ts`), and it runs in CI beside `typecheck` and
 * `build` — issues/13 made a failing CI run the alarm for a machine changed
 * without a migration behind it, in place of a `machine_version` column.
 *
 * `docs/` is excluded for the same reason `eslint.config.mjs` ignores it: the
 * artifacts there are reference and are covered by `npm run typecheck` against
 * `tsconfig.docs.json`.
 *
 * A test that ever needs to import a `server-only` module — `lib/permissions.ts`
 * is the only one — has to add `resolve.conditions: ["react-server"]`, because
 * the package throws under every other condition. That is the point of it, and
 * it is why the test below reaches for the machines and the migration SQL
 * rather than for the rules.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "docs/**"],
  },
});
