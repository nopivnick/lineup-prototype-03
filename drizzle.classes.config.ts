import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * The `classes` project's migration history. See `drizzle.people.config.ts` for
 * why `out` is set explicitly and why migrations use the direct connection.
 *
 * **A change touching both projects cannot be atomic**: one commit, two
 * migration files, applied in sequence, and a failure of the second leaves it
 * half-applied. What makes that acceptable is `db:reset` — drop, migrate both,
 * reseed — as the recovery path (issues/13).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/classes/schema.ts",
  out: "./db/classes/migrations",
  dbCredentials: {
    url: process.env.CLASSES_MIGRATION_DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
