import next from "eslint-config-next";
import { defineConfig, globalIgnores } from "eslint/config";

/**
 * The message a page author sees when they reach for a handle. It names the
 * rule, the reason and the place the query belongs, because the point of the
 * rule is not to be obeyed but to redirect.
 */
const NO_HANDLE_IN_A_PAGE = [
  "No page holds a database handle (issues/9).",
  "Both drizzle() instances live in db/handles.ts and are imported by the view-shaped",
  "read modules in db/read/ and the write paths in db/write/ and by nothing else, so that",
  "a forgotten WHERE clause has no page to be written in. Call a read module instead —",
  "see docs/data-access/README.md.",
].join(" ");

/**
 * Restricting the path to `db/handles.ts` alone guards the module, not the rule:
 * a page that imports the driver can open its own handle and write the exact
 * `WHERE` clause the design exists to prevent. The rule is *no page holds a
 * database handle*, so the two imports that can make one are restricted too.
 *
 * `drizzle-orm` itself is not on this list, and neither is `drizzle-orm/pg-core`
 * — the schema modules are ordinary importable TypeScript, and nothing in them
 * can reach a database.
 */
const NO_OPENING_YOUR_OWN = [
  "No page holds a database handle (issues/9), including one it opens itself.",
  "postgres() and drizzle() belong in db/handles.ts, which is the only module that",
  "connects to anything. Call a read module instead — see docs/data-access/README.md.",
].join(" ");

export default defineConfig([
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "db/*/migrations/**",
    // Reference artifacts, not application code. They are typechecked by
    // `npm run typecheck` against tsconfig.docs.json and linted by nothing.
    "docs/**",
  ]),

  ...next,

  {
    name: "no-handle-in-a-page",
    rules: {
      // `error`, not `warn`: `npm run build` runs `eslint .` first, so this
      // fails the build rather than printing something nobody reads.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/db/handles", "@/db/handles"],
              message: NO_HANDLE_IN_A_PAGE,
            },
            {
              group: ["postgres", "drizzle-orm/postgres-js"],
              message: NO_OPENING_YOUR_OWN,
            },
          ],
        },
      ],
    },
  },

  {
    // The two directories issues/9 named as the module boundary's inside, plus
    // the module itself. They are the only place a handle may be held.
    name: "no-handle-in-a-page/inside-the-boundary",
    files: ["db/handles.ts", "db/read/**/*.ts", "db/write/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },

  {
    // Outside the app entirely: `db:reset` drops schemas over its own
    // connection, and there is no page anywhere near it.
    name: "no-handle-in-a-page/outside-the-app",
    files: ["scripts/**/*.ts", "drizzle.*.config.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);
