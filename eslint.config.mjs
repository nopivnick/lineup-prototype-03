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

/**
 * The message a Server Action author sees when they reach for the dated door.
 *
 * The rule is *only the seed says when a write happened* (issues/107). A
 * caller-supplied date is the one way to write a **plausible** lie into the
 * transition log — a forged `now()` is obvious and a forged 2019 is not — and
 * the log's credibility is what the seed exists to demonstrate.
 */
const NO_DATE_FROM_A_CALLER = [
  "Only the seed says when a write happened (issues/107).",
  "writeToClassesAt is db/seed.ts's alone, because the seed's world is dated 2018 to 2026",
  "and a run of db:reset may not stamp its own instant on it. Every other caller opens a",
  "transaction with writeToClasses and lets the column defaults answer —",
  "see docs/data-access/README.md.",
].join(" ");

/**
 * Restricting the module by path guards the module rather than the rule, so the
 * two imports that could reconstruct it are restricted with it. A caller holding
 * a handle can open its own transaction and hand a writer any moment it likes,
 * which is why this pattern rides beside the handle patterns everywhere and
 * survives alone inside the boundary, where the handle patterns are lifted.
 */
const NO_DATED_DOOR = {
  // **Two patterns, because the rule matches the import string as written and
  // not the path it resolves to.** `**/dated-transaction` covers the aliased and
  // the walked-up spellings — `@/db/write/dated-transaction`,
  // `../db/write/dated-transaction` — and misses the one that matters most: a
  // module sitting beside this one reaches it as `./dated-transaction`, which is
  // its own pattern. Verified against all three by lint, not by reading
  // minimatch.
  group: ["**/dated-transaction", "./dated-transaction"],
  message: NO_DATE_FROM_A_CALLER,
};

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
            NO_DATED_DOOR,
          ],
        },
      ],
    },
  },

  {
    // The two directories issues/9 named as the module boundary's inside, plus
    // the module itself. They are the only place a handle may be held.
    //
    // **The dated door stays shut here**, which is why this lists a pattern
    // rather than turning the rule off: the write paths are exactly the callers
    // that must not date their own writes, since a moment reaching one any way
    // but through its transaction is the shape issues/107 replaced.
    name: "no-handle-in-a-page/inside-the-boundary",
    files: ["db/handles.ts", "db/read/**/*.ts", "db/write/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [NO_DATED_DOOR] }],
    },
  },

  {
    // Outside the app entirely: `db:reset` drops schemas over its own
    // connection, and there is no page anywhere near it.
    //
    // The seed is here for a sharper reason than *it is a script*. It goes
    // through the four write paths like any other caller (issues/28), but two
    // categories of row have no in-app author and therefore no path to take:
    // the reference data and the `person` rows, which are `SEED_ORDER`'s first
    // two steps precisely because nothing in the running system writes them. A
    // handle is what a seed *is*, and it can never be a page.
    name: "no-handle-in-a-page/outside-the-app",
    files: ["scripts/**/*.ts", "drizzle.*.config.ts", "db/seed.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },

  {
    // The seed is not the only caller that has to *exercise* a dated
    // transaction: the seam has tests, and a fence a test cannot reach is a
    // fence nothing proves. Last, because the block above it does not match a
    // test file and the one above that shuts this door for all of `db/write/`.
    //
    // **`db/write/` and not `db/`.** `db/machine-states.test.ts` needs no
    // database at all and sits under the base rule like any other module; a
    // wider glob here would have lifted *no page holds a handle* off it for
    // nothing, which is a second fence quietly widened by a change about the
    // first.
    name: "only-the-seed-dates-a-write/tests-may-open-one",
    files: ["db/write/**/*.test.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);
