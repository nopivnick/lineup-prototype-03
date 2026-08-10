import "dotenv/config";

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import postgres from "postgres";

/**
 * **Coherence is not a property of the databases but of `db:reset`** (issues/9,
 * issues/13).
 *
 * A change touching both projects cannot be atomic — one commit, two migration
 * files, applied in sequence — so the recovery path when the two schemas
 * disagree, or when a machine change invalidates persisted snapshots, is to drop
 * both, migrate both and reseed both. Per-version snapshot migration functions
 * are out of scope by construction: every fixture is reproducible from the seed.
 *
 * `people` first, every step, because `classes` holds netids that the seed
 * checks against it.
 *
 * This runs against the **direct** connections in session mode. It is
 * destructive by design and refuses nothing, so point it only at a development
 * database.
 */
const PROJECTS = [
  {
    name: "people",
    urlVariable: "PEOPLE_MIGRATION_DATABASE_URL",
    config: "drizzle.people.config.ts",
  },
  {
    name: "classes",
    urlVariable: "CLASSES_MIGRATION_DATABASE_URL",
    config: "drizzle.classes.config.ts",
  },
] as const;

/** Where the seed will live. It is a later ticket's; until then reset stops after migrating. */
const SEED = "db/seed.ts";

function requireUrl(variable: string): string {
  const url = process.env[variable];
  if (!url) {
    throw new Error(`${variable} is not set. See .env.example.`);
  }
  return url;
}

/**
 * Drop `public` and `drizzle` together. The journal `drizzle-kit` writes lives
 * in the `drizzle` schema, so dropping only `public` would leave a history
 * claiming every migration had already been applied to tables that no longer
 * exist.
 */
async function drop(urlVariable: string): Promise<void> {
  const sql = postgres(requireUrl(urlVariable), {
    max: 1,
    // The cascade notices are the only useful output here — they say what the
    // drop actually took with it. postgres.js dumps the whole notice object by
    // default; one line each is enough.
    onnotice: (notice) => console.log(`  ${notice.message}`),
  });
  try {
    await sql.unsafe(`
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
    `);
  } finally {
    await sql.end();
  }
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status ?? "a signal"}`);
  }
}

async function main(): Promise<void> {
  for (const project of PROJECTS) {
    console.log(`\n— dropping ${project.name}`);
    await drop(project.urlVariable);
  }

  for (const project of PROJECTS) {
    console.log(`\n— migrating ${project.name}`);
    run("npx", ["drizzle-kit", "migrate", `--config=${project.config}`]);
  }

  if (existsSync(SEED)) {
    console.log("\n— seeding");
    run("npx", ["tsx", SEED]);
  } else {
    console.log(`\n— no ${SEED} yet; both projects are migrated and empty`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
