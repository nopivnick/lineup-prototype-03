import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * The `people` project's migration history.
 *
 * `out` is set **explicitly**, as it is in the `classes` config: it defaults to
 * `./drizzle`, so two configs that both left it unset would silently overwrite
 * each other's migrations (issues/5). The two projects have two independent
 * histories and every `drizzle-kit` command is run once per config, `people`
 * first.
 *
 * Migrations run against the **direct** connection in session mode, not the
 * pooled runtime one — a different string, not the same string with the port
 * swapped.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/people/schema.ts",
  out: "./db/people/migrations",
  dbCredentials: {
    url: process.env.PEOPLE_MIGRATION_DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
