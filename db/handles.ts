import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * **The one module that holds a database handle.**
 *
 * No page holds a database handle. issues/9 made that structural rather than
 * disciplinary: both `drizzle()` instances live here, this module is imported by
 * the read modules and the writers and by nothing else, and the
 * `no-restricted-imports` rule in `eslint.config.mjs` makes a page importing it
 * **fail the build** — `npm run build` runs `eslint .` before `next build`.
 *
 * That pays a debt issues/28 knowingly left. Weighing RLS, it conceded RLS's
 * strongest argument — over-grants are silent, and a forgotten `WHERE` is the
 * silent-est of all — then ruled RLS out. The only answer that is not discipline
 * is that pages never write a `WHERE` clause at all, because they never hold a
 * handle. See `docs/data-access/README.md`.
 *
 * `import 'server-only'` is the second half: a Client Component importing this
 * is a build error rather than a leak.
 *
 * **These are handles, not an abstraction with swappable implementations.**
 * There is one adapter, Postgres. No interface-plus-in-memory-fake ceremony.
 */
type Handle = PostgresJsDatabase<Record<string, never>>;

/**
 * **`drizzle()` is handed no schema, on purpose.** The Drizzle docs describe 1.0
 * while `npm install` gives the 0.45 line, and the material difference between
 * them is the relational query builder. Passing no schema means
 * `db.query.<table>` does not exist on the object, so the one API the docs are
 * wrong about cannot be reached by accident. Every read is core `select()` /
 * `leftJoin()`.
 *
 * `{ prepare: false }` because the runtime endpoint is the pooler in transaction
 * mode, which forbids prepared statements (issues/5). Forgetting the flag fails
 * loudly under the pooler.
 */
function open(variable: string): Handle {
  const url = process.env[variable];
  if (!url) {
    throw new Error(`${variable} is not set. See .env.example.`);
  }
  return drizzle(postgres(url, { prepare: false }));
}

// Opened on first use rather than at import, so a build with no database
// configured is still a build.
let people: Handle | undefined;
let classes: Handle | undefined;

/** The `people` project — one table, `person`. Runtime endpoint, pooled. */
export function peopleDb(): Handle {
  return (people ??= open("PEOPLE_DATABASE_URL"));
}

/** The `classes` project — the other twenty tables. Runtime endpoint, pooled. */
export function classesDb(): Handle {
  return (classes ??= open("CLASSES_DATABASE_URL"));
}
