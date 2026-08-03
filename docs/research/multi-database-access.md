# Multi-database access options for two Supabase projects

Research notes for [issue #5](https://github.com/nopivnick/lineup-prototype-03/issues/5).
**Facts only — no recommendation.** The choice is made in a separate ticket.

- **Researched:** 2026-07-31
- **Scope:** Next.js App Router reading from two independent Supabase Postgres projects
  (`people`, `classes`). No cross-project foreign keys are possible; `netid` is the join
  key and joins happen in application code.
- **Sources:** official docs, release notes and issue trackers of the owning projects only.

## Versions this was checked against

Read from the npm registry (`npm view <pkg> dist-tags`) on 2026-07-31 unless noted.

| Package / product | `latest` | Notes |
| --- | --- | --- |
| `next` | **16.2.12** | docs pages served from nextjs.org self-report `version: 16.2.12` |
| `drizzle-orm` | **0.45.2** (2026-03-27) | `rc` tag is `1.0.0-rc.4`; **the docs site now documents v1.0** |
| `drizzle-kit` | **0.31.10** | `rc` tag is `1.0.0-rc.4` (2026-06-27) |
| `prisma` / `@prisma/client` | **7.9.1** | v7 is a hard break — see §2 |
| `@supabase/supabase-js` | **2.111.0** | `next` tag is `3.0.0-next.29` |
| `supabase` (CLI) | **2.111.0** | |
| `postgres` (postgres.js) | **3.4.9** (2026-04-05) | |
| `pg` (node-postgres) | **8.22.0** | |
| PostgREST (server) | **v14.16** (2026-07-27) | [release feed](https://github.com/PostgREST/postgrest/releases) — Supabase's deployed version is not user-pinned |

> **Version hazard.** `orm.drizzle.team` currently ships **v1.0 documentation**
> ("Upgrade to v1.0", "v0 → v1 updates", roadmap "v1.0 98%" — [Overview](https://orm.drizzle.team/docs/overview)),
> while npm `latest` is still `0.45.2`. Every Drizzle code sample below is quoted from
> the v1.0 docs; on `0.45.2` the relational-query API differs (see §1.3).

---

## Summary of the option space

| | **Drizzle ORM** | **Prisma 7** | **supabase-js** |
| --- | --- | --- | --- |
| Two databases in one app | Two `drizzle()` instances, two clients — no framework-level ceremony | Two schemas → two generated clients with distinct `output` paths ([first-party guide](https://www.prisma.io/docs/guides/multiple-databases)) | Two `createClient()` calls |
| Schema namespacing | Two TS modules; `import * as people` / `import * as classes` — collisions only if you barrel-export both | Two generated client packages; each has its own `PrismaClient` + model types | No schema in app code; types via generated `Database` types per project |
| Migration histories | Two `drizzle.config.ts`, two `out` dirs, `--config` per command | Two `schema.prisma` + two `prisma.config.ts`, `--schema` per command | Supabase CLI `supabase/migrations` per project dir |
| Wire protocol | SQL over Postgres wire | SQL over Postgres wire (driver adapter) | HTTP → PostgREST |
| Cross-project join | App code, 2 queries | App code, 2 queries | App code, 2 HTTP round-trips |
| Transaction-mode pooler | Yes, `postgres(url, { prepare: false })` | Yes, adapter + `?pgbouncer=true` | N/A (HTTP; Supabase manages its own pool) |
| Aggregates / arbitrary SQL | Full SQL | Full SQL (`$queryRaw`) | Only what PostgREST exposes; aggregates **off by default** |
| Needs DB credentials in the app | Yes (2 connection strings) | Yes (2 connection strings) | No — project URL + API key (2 pairs) |
| RSC-safe | Yes, server-only module | Yes, server-only module | Yes, but the client is isomorphic — leaks are a key-choice problem, not a bundling one |

---

## 1. Drizzle ORM

### 1.1 Two independent database instances in one app

Yes, and there is nothing special about it: a Drizzle "database" is just the value returned
by `drizzle()`, so two calls give two independent handles. The
[PostgreSQL get-started guide](https://orm.drizzle.team/docs/get-started-postgresql)
shows the constructor taking a connection string or a client directly:

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
const db = drizzle(process.env.DATABASE_URL);
```

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
const db = drizzle(process.env.DATABASE_URL);
```

Both `node-postgres` (`pg`) and `postgres.js` are natively supported drivers
([get-started-postgresql](https://orm.drizzle.team/docs/get-started-postgresql)).
Nothing in the docs registers a global/default database, so `peopleDb` and `classesDb`
coexist with no configuration. There is **no first-party statement** that a single app may
hold multiple database instances — it simply falls out of the API shape. (Flagged in
"Open / unverified".)

### 1.2 First-party Supabase guidance

Drizzle's [Connect Supabase](https://orm.drizzle.team/docs/connect-supabase) page gives:

```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(process.env.DATABASE_URL, { prepare: false })
const db = drizzle({ client });
```

with the rule "use the Connection Pooler for serverless environments, and the Direct
Connection for long-running servers."

Supabase's own [Drizzle guide](https://supabase.com/docs/guides/database/drizzle) says the
same from the other side: install `drizzle-orm postgres` + `drizzle-kit`, take the URI from
the **Shared Pooler** option, and set `{ prepare: false }` because "prefetch … is not
supported for 'Transaction' pool mode." It also notes that a **local** Supabase connection
string containing `postgres:postgres@supabase_db_…` needs its hostname rewritten before
Drizzle can use it.

### 1.3 Keeping the two schema namespaces apart in types

Drizzle has no global schema registry — table objects are ordinary TypeScript values, and
their types are derived per-object:

```ts
type SelectUser = typeof users.$inferSelect;
type InsertUser = typeof users.$inferInsert;
// or
type SelectUserAlt = InferSelectModel<typeof users>;
```

([Goodies / type inference](https://orm.drizzle.team/docs/goodies))

So a `user` table in each project produces two *different* types that never meet unless you
put them in the same lexical scope. The practical convention is module namespaces —
`import * as people from './schema/people'` / `import * as classes from './schema/classes'`
— which is exactly the shape the relational-query docs already use
(`import * as schema from './schema'`, [RQB](https://orm.drizzle.team/docs/rqb)).
A single barrel file that `export *`s both would collide; two barrels do not.

**Relational queries need the schema handed to the constructor.** On v1.0 the docs say
"You need to provide all `tables` and `relations` from your schema file/files upon
`drizzle()` initialization" to get `db.query.<table>`, via `defineRelations()`:

```ts
const db = drizzle(process.env.DATABASE_URL, { relations });
```

([RQB](https://orm.drizzle.team/docs/rqb)). This is per-instance, so each database gets its
own `db.query` surface — a second reason the namespaces cannot bleed. On `0.45.2` the
equivalent is the older `relations()` helper passed as `drizzle(client, { schema })`;
the docs site no longer shows that form (see the version hazard note above).

`pgTableCreator` exists for prefixing table names when **several projects share one
database**, paired with `tablesFilter: ['project1_*']`
([Goodies](https://orm.drizzle.team/docs/goodies)):

```ts
const pgTable = pgTableCreator((name) => `project1_${name}`);
```

That is
the *opposite* of this situation (two databases, one project each) and is not needed here,
but it is the mechanism the docs point at for "multi-project" naming.

### 1.4 Two migration histories in one repo

`drizzle-kit` is config-file-driven and the config file is selectable per invocation. From
the [Drizzle Kit configuration](https://orm.drizzle.team/docs/drizzle-config-file) page:

```bash
npx drizzle-kit generate --config=drizzle-dev.config.ts
npx drizzle-kit generate --config=drizzle-prod.config.ts
```

described there as the pattern that "supports multiple databases or deployment stages
within one repository." The three keys that separate the histories:

- **`schema`** — "glob-based paths to schema files or directories"; accepts a string, an
  array, or wildcards such as `"./src/schema/*"`.
- **`out`** — "output folder for SQL migrations and schema snapshots"; **defaults to
  `"drizzle"`**, so two configs *must* set it explicitly or they will overwrite each other.
- **`dbCredentials`** — per-config connection URL.

Also relevant:

- **`migrations`** — the journal table, default `{ table: "__drizzle_migrations", schema: "drizzle" }`.
  Because each Supabase project is a *separate database*, the default is already unambiguous;
  no renaming is needed.
- **`schemaFilter`** (default effectively `["public"]`-ish, e.g. `["public", "auth"]`) and
  **`tablesFilter`** exist to stop `push`/`pull` from managing objects you do not own — on
  Supabase this matters because `auth`, `storage`, `realtime` etc. live in the same database.
- **`entities: { roles: { provider: "supabase" } }`** is a documented provider-specific value
  for role management.

Command line, one project per config:

```bash
npx drizzle-kit generate --config=drizzle.people.config.ts
npx drizzle-kit migrate  --config=drizzle.people.config.ts
npx drizzle-kit generate --config=drizzle.classes.config.ts
npx drizzle-kit migrate  --config=drizzle.classes.config.ts
```

The [migrations overview](https://orm.drizzle.team/docs/migrations) documents the commands
themselves: `generate` ("find diff between current and previous schema"), `migrate`
(apply unapplied), `push` (apply directly, no SQL file), `pull` (introspect to TS),
plus `check` and `up`. Output is a folder of timestamped `migration.sql` + snapshot JSON.

Drizzle Kit 1.0 (RC) changes migration bookkeeping — "versioned migration table with
automatic upgrades", "migration history now tracked by folder name instead of timestamps",
and commutativity checks in `drizzle-kit check`
([1.0.0-rc release notes](https://github.com/drizzle-team/drizzle-orm/releases)). Two
histories are unaffected in principle, but the on-disk format differs between 0.31 and 1.0.

---

## 2. Prisma

### 2.1 One datasource per schema — still true

Yes. [Data sources](https://www.prisma.io/docs/orm/prisma-schema/overview/data-sources)
states plainly: **"A Prisma schema can only have *one* data source."** The only escapes it
lists are overriding the connection when constructing the client, and pointing Migrate's
shadow database elsewhere. There is no multi-datasource preview feature in flight that I
could find in the docs — the sanctioned answer is *two schemas, two clients*.

### 2.2 The sanctioned workaround (first-party guides)

Prisma publishes two guides that cover exactly this shape:
[Multiple databases in a single app](https://www.prisma.io/docs/guides/multiple-databases)
and [Multiple Prisma Clients in a single app](https://www.prisma.io/docs/guides/multiple-prisma-clients).
The recipe, quoted from the former:

```
my-multi-client-app/
├── prisma-user-database/
│   ├── schema.prisma
│   ├── prisma.config.ts
│   ├── migrations/
│   └── user-database-client-types/
├── prisma-post-database/
│   ├── schema.prisma
│   ├── prisma.config.ts
│   ├── migrations/
│   └── post-database-client-types/
├── lib/
│   ├── user-prisma-client.ts
│   └── post-prisma-client.ts
└── .env
```

```prisma
generator client {
  provider = "prisma-client"
  output = "../prisma-user-database/user-database-client-types"
}

datasource db {
  provider = "postgresql"
}
```

```ts
// prisma-user-database/prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma-user-database/schema.prisma",
  migrations: { path: "prisma-user-database/migrations" },
  datasource: { url: env("PPG_USER_DATABASE_URL") },
});
```

```json
{
  "generate": "npx prisma generate --schema ./prisma-user-database/schema.prisma && npx prisma generate --schema ./prisma-post-database/schema.prisma",
  "migrate":  "npx prisma migrate dev --schema ./prisma-user-database/schema.prisma && npx prisma migrate dev --schema ./prisma-post-database/schema.prisma",
  "deploy":   "npx prisma migrate deploy --schema ./prisma-user-database/schema.prisma && npx prisma migrate deploy --schema ./prisma-post-database/schema.prisma"
}
```

```ts
// lib/user-prisma-client.ts
import { PrismaClient } from "../prisma-user-database/user-database-client-types/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.PPG_USER_DATABASE_URL });
const getPrisma = () => new PrismaClient({ adapter });

const globalForUserDBPrismaClient = global as unknown as {
  userDBPrismaClient: ReturnType<typeof getPrisma>;
};
export const userDBPrismaClient = globalForUserDBPrismaClient.userDBPrismaClient || getPrisma();
if (process.env.NODE_ENV !== "production")
  globalForUserDBPrismaClient.userDBPrismaClient = userDBPrismaClient;
```

Both clients are then imported side by side in an App Router `page.tsx`. The guide is
explicitly written against Next.js and includes the `globalThis` singleton (see §5).

Caveats the guides call out: **the deployment fails if either env var is unset**; each
schema needs **its own migrations directory**; and there is "a known issue" with
**Next.js v15.2.0 + Turbopack** in this configuration
([multiple-prisma-clients](https://www.prisma.io/docs/guides/multiple-prisma-clients)).
Neither guide addresses cross-database relations — joins must be done in app code.

### 2.3 What changed in Prisma 7 (7.9.1 current)

From the [upgrade guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7):

- **Driver adapters are mandatory:** "The way to create a new Prisma Client has changed to
  require a driver adapter for all databases." The Rust query engine is gone; Prisma ships
  as an ES module and uses node-pg instead. The client reference lists `adapter` as
  "Required unless using `accelerateUrl`"
  ([client reference](https://www.prisma.io/docs/orm/reference/prisma-client-reference)).
- **`prisma-client` is the default generator**, replacing the deprecated `prisma-client-js`;
  **`output` is now required** and the client is no longer generated into `node_modules`
  ([generators](https://www.prisma.io/docs/orm/prisma-schema/overview/generators)).
  Options: `provider`, `output` (both required), `runtime`, `moduleFormat`,
  `generatedFileExtension`, `importFileExtension`.
- **`prisma.config.ts` is the default configuration surface** ("Prisma Config is now the
  default place for configuring how the Prisma CLI interacts with your database").
- **ESM required** (`"type": "module"`), **Node ≥ 20.19.0** (22.x recommended).

Practical consequence for two databases: the connection string is now supplied to the
**adapter** at runtime (`new PrismaPg({ connectionString })`), not baked into the schema, so
the "one datasource block" limit is a *schema/migration* constraint rather than a runtime one.
The old `datasourceUrl` / `datasources` constructor options no longer appear in the v7 client
reference.

### 2.4 Multi-file schema

Splitting one schema across several `.prisma` files in a directory is **Generally Available
since v6.7.0 — no preview flag**. Location is set with `schema` in `prisma.config.ts`
(recommended) or `--schema`
([Schema location](https://www.prisma.io/docs/orm/prisma-schema/overview/location)):

```ts
export default defineConfig({
  schema: "prisma/",
  migrations: { path: "prisma/migrations" },
});
```

Constraint from the same page: "The `schema.prisma` file (which contains your `generator`
block) must be located in the same directory that you specify in your schema configuration."
Note this feature splits **one** datasource across files — it does **not** give you two.

---

## 3. supabase-js (two clients, one per project)

### 3.1 What PostgREST can express

Supabase's Data API is PostgREST — "a thin API layer on top of Postgres"
([Data REST API](https://supabase.com/docs/guides/api)) — auto-generated from the exposed
schemas, enforcing "the Postgres security model — including Row Level Security, Roles, and
Grants", and covering "Postgres Views, Materialized Views and Foreign Tables".

For a catalog list view, all of the following are available:

- **Filtering** — `eq`, `neq`, `gt/gte/lt/lte`, `like`/`ilike`, `match`/`imatch`, `in`,
  `cs`/`cd`, full-text `fts`/`plfts`/`phfts`/`wfts`, range/array operators, plus explicit
  `and`/`or`/`not` (`or=(cond1,cond2)`)
  ([Tables and Views](https://docs.postgrest.org/en/stable/references/api/tables_views.html)).
- **Ordering** — `order=age.desc,height.asc`, with `nullsfirst`/`nullslast`.
- **Pagination** — `?limit=15&offset=30`, or an RFC 7233 `Range: 0-19` header; responses
  carry `Content-Range: 0-24/3573458`
  ([Pagination and count](https://docs.postgrest.org/en/stable/references/api/pagination_count.html)).
- **Counts, in the same round-trip** — `Prefer: count=exact|planned|estimated`, surfaced in
  supabase-js as `.select('*', { count: 'exact', head: true })`
  ([select reference](https://supabase.com/docs/reference/javascript/select)).
  Trade-offs, verbatim: `exact` — "the larger the table the slower this query runs";
  `planned` — "fairly accurate and fast", accuracy depends on how up-to-date the PG
  statistics are; `estimated` — exact up to a threshold, planned beyond it, using
  `db-max-rows` as the boundary.
- **Embedded resource joins, within one project** — `select('id, name, instruments(id, name)')`.
  "The Data APIs automatically detect relationships between Postgres tables" via foreign
  keys ([Joins and nesting](https://supabase.com/docs/guides/database/joins-and-nesting)).
  `!inner` turns the default left join into an inner join and lets embedded filters
  restrict the parent rows ("top-level filtering"). Filtering on joined columns uses
  `joined_table.column`. Ambiguity is resolved with `alias:relation!foreign_key(columns)`.
  Top-level rows can also be **ordered by a to-one embedded column**:
  `?order=directors(last_name).desc`, "many-to-one and one-to-one relationships" only
  ([Resource embedding](https://docs.postgrest.org/en/stable/references/api/resource_embedding.html)).
  Embedding also works via **computed relationships** — hand-written functions — "for
  objects that cannot define foreign keys, such as Foreign Data Wrappers."

### 3.2 Hard limits

- **Aggregates are opt-in and off by default.** PostgREST supports `avg()`, `count()`,
  `max()`, `min()`, `sum()` with `?select=amount.sum()`, but "Aggregate functions are
  *disabled* by default in PostgREST, because they can create performance problems without
  appropriate safeguards"; `db-aggregates-enabled` defaults to `False`
  ([Aggregate functions](https://docs.postgrest.org/en/stable/references/api/aggregate_functions.html),
  [configuration](https://docs.postgrest.org/en/stable/references/configuration.html)).
  Enabling on Supabase is a SQL-level change:
  `ALTER ROLE authenticator SET pgrst.db_aggregates_enabled = 'true'; NOTIFY pgrst, 'reload config';`
- **1,000-row default cap.** "By default, Supabase projects will return a maximum of 1,000
  rows", changeable in Project API Settings, with `range()` for paging beyond it
  ([select reference](https://supabase.com/docs/reference/javascript/v1/select)). PostgREST's
  own `db-max-rows` default is `∞`; the 1,000 is Supabase's setting.
- **No cross-project embedding.** Embedding requires a foreign key (or a computed
  relationship) inside one database. Two Supabase projects are two databases, so
  `people(…)` cannot be embedded from `classes`.
- **Only exposed schemas are reachable.** "By default, your database has a `public` schema
  which is automatically exposed on data APIs"; custom schemas need adding to *Exposed
  schemas* plus grants to `anon`/`authenticated`/`service_role`
  ([Using custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas)).
- **Casting is restricted on filters** — "casting on horizontal filtering is not allowed"
  (index invalidation); computed fields are the documented workaround.
- No window functions, CTEs, `GROUP BY … HAVING`, `DISTINCT ON`, or arbitrary SQL — anything
  beyond the above has to become a **view** or an **RPC** (`.rpc('fn', args)`) in the database.

### 3.3 Cost of an application-code join across two projects

Because `netid` is the only link, the shape is a two-step fetch:

1. Page the driving side (say `classes`) with `limit`/`range` + `count`. → 1 round-trip.
2. Collect the page's `netid`s and batch-fetch the other project with the `in` operator —
   PostgREST syntax `?netid=in.(a,b,c)`, quoted for values containing commas
   ([Tables and Views](https://docs.postgrest.org/en/stable/references/api/tables_views.html)).
   → 1 round-trip.

So **2 HTTP round-trips per page**, independent of page size — not N+1, provided the batch
is done with `in` rather than per-row lookups. The same two-query pattern applies to the
SQL clients; the difference is per-round-trip cost (HTTP+PostgREST vs a pooled Postgres
connection) and that the SQL clients cannot merge the two either.

What this pattern cannot do: **sort or filter the driving page by a column that lives in the
other project**, or produce an accurate total count of the joined result — both would need
the whole cross-product materialised somewhere. Documented escapes, in increasing order of
coupling:

- **RPC.** Move the logic into a Postgres function in one project and call it with
  `.rpc()`; it can accept the `netid` array as an argument.
- **Foreign Data Wrappers.** Supabase Wrappers "extends Postgres Foreign Data Wrappers",
  and Postgres "includes several built-in foreign data wrappers, such as `postgres_fdw` for
  accessing other Postgres databases"
  ([Wrappers overview](https://supabase.com/docs/guides/database/extensions/wrappers/overview)).
  Combined with PostgREST **computed relationships** — explicitly documented as the answer
  "for objects that cannot define foreign keys, such as Foreign Data Wrappers" — this would
  in principle let one project embed the other's rows. This re-introduces the cross-project
  coupling the map deliberately avoided, and I did **not** verify that `postgres_fdw` is
  enabled/allowed on Supabase-hosted projects (see "Open / unverified").

### 3.4 Keys

Supabase has moved to **publishable (`sb_publishable_…`) / secret (`sb_secret_…`)** keys.
Legacy JWT `anon` / `service_role` keys still work but "will be deprecated by the end of
2026, and you should now use the publishable … and secret … keys instead". Publishable keys
are "safe to expose online"; secret keys give "full access to your project's data, bypassing
Row Level Security" and return HTTP 401 if used from a browser
([API keys](https://supabase.com/docs/guides/api/api-keys)). Two projects ⇒ two key pairs.

---

## 4. Connection pooling (Supavisor / PgBouncer)

All from [Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres)
unless noted.

| Path | Host | Port | Mode | Network |
| --- | --- | --- | --- | --- |
| Direct connection | `db.[project-ref].supabase.co` | **5432** | session | IPv6, "or on IPv4 if the project has the IPv4 add-on" |
| Shared Pooler (Supavisor) — session | `aws-[region].pooler.supabase.com` | **5432** | session | IPv4 |
| Shared Pooler (Supavisor) — transaction | `aws-[region].pooler.supabase.com` | **6543** | transaction | IPv4 |
| Dedicated Pooler (PgBouncer) | co-located with Postgres | **6543** | transaction only | IPv6, or IPv4 with the add-on |

- The Shared Pooler is "multi-tenant, available on every project, and **IPv4-only**".
- The Dedicated Pooler is "available on paid plans and co-located with your Postgres
  instance"; it gives "best performance and latency, while using up more of your project's
  compute resources".
- **Serverless guidance, verbatim:** "Use pooler transaction mode for application traffic
  from temporary clients (for example, serverless or edge functions)", specifically the
  "Dedicated Pooler (PgBouncer, Pro plan) when IPv6 or the IPv4 add-on is available, or
  Supavisor in transaction mode when you need IPv4."
- **Transaction mode does not support prepared statements.**

Connection-string username differs: pooler connections use `postgres.[project-ref]` as the
user (`postgres://postgres.apbkobhfnmcqqzqeeqss:[PASSWORD]@aws-[REGION].pooler.supabase.com:6543/postgres`),
direct uses plain `postgres`.

### What "no prepared statements" means per client

- **postgres.js** — prepares by default; must be constructed as
  `postgres(url, { prepare: false })`. Both
  [Drizzle](https://orm.drizzle.team/docs/connect-supabase) and
  [Supabase](https://supabase.com/docs/guides/database/drizzle) state this explicitly.
- **node-postgres (`pg`)** — does *not* prepare by default. Statements are only prepared
  when you "supply a `name` parameter", in which case "the query execution plan will be
  cached on the PostgreSQL server on a **per connection basis**"
  ([node-postgres queries](https://node-postgres.com/features/queries)). So `pg` is
  transaction-mode-safe unless named queries are used.
- **Prisma 7** — Supabase's [Prisma guide](https://supabase.com/docs/guides/database/prisma)
  prescribes two URLs for serverless: `DATABASE_URL` on **port 6543** with **`?pgbouncer=true`**
  appended, and `DIRECT_URL` on **port 5432** (session mode) for migrations. For server-based
  deployments a single session-mode string on 5432 is used.
- **supabase-js** — not affected; it speaks HTTP to PostgREST, which manages its own
  Postgres pool server-side.

### Two projects, two pools

There is no shared pool between projects — each Supabase project has its own Postgres,
its own Supavisor tenant and its own limits. Per-compute limits, from
[Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk):

| Compute | Direct max connections | Pooler max clients |
| --- | --- | --- |
| Nano (free) | 60 | 200 |
| Micro | 60 | 200 |
| Small | 90 | 400 |
| Medium | 120 | 600 |
| Large | 160 | 800 |
| XL | 240 | 1,000 |
| 2XL | 380 | 1,500 |
| 4XL | 480 | 3,000 |
| 8XL | 490 | 6,000 |
| 12XL | 500 | 9,000 |
| 16XL | 500 | 12,000 |

"Database max connections are recommended values and can be customized via `max_connections`."
So a free-tier pair of projects gives 200 pooler clients each, backed by 60 direct
connections each.

Pool-size sizing guidance from
[Connection management](https://supabase.com/docs/guides/database/connection-management):
"if you are heavily using the PostgREST database API, you should be conscientious about
raising your pool size past 40% of the Database Max Connections", otherwise up to 80% may go
to the pool — with the caveat that "these numbers are generalizations". Supavisor's pool
size is what it will open *toward* Postgres: "If you set the pool size to 30, Supavisor can
open up to 30 server side connections to Postgres."

**IPv4/IPv6 matters concretely:** the Shared Pooler is IPv4-only, while direct connections
and the Dedicated Pooler are IPv6 unless the paid IPv4 add-on is enabled. A runtime without
IPv6 egress can only reach the Shared Pooler (or needs the add-on).

---

## 5. Server Components and Server Actions

Checked against Next.js **16.2.12** docs.

### All three work in RSC; only two carry a bundling risk

Server Components run only on the server, and the docs list "Use API keys, tokens, and other
secrets without exposing them to the client" as a reason to use them
([Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)).
Drizzle and Prisma modules are Node-only and can never be legitimately imported into a
Client Component; supabase-js is isomorphic and *can* be — which is fine with a publishable
key and RLS, and a leak with a secret key.

### Preventing environment poisoning

Two mechanisms, both documented on the same page:

1. **Env var prefixing.** "In Next.js, only environment variables prefixed with
   `NEXT_PUBLIC_` are included in the client bundle. If variables are not prefixed, Next.js
   replaces them with an empty string." So connection strings and secret keys must **not**
   carry the prefix; a Supabase project URL and publishable key may.
   ([Environment variables](https://nextjs.org/docs/app/guides/environment-variables))
2. **`server-only`.** `import 'server-only'` at the top of a data module makes an import
   from a Client Component "a build-time error". Installing the package is **optional** in
   Next.js — "Next.js handles `server-only` and `client-only` imports internally… The
   contents of these packages from NPM are not used by Next.js" — but you may want it
   installed if lint rules flag extraneous dependencies. Next.js also ships its own type
   declarations for it.

Also note: `"use client"` is a *module-graph* boundary — "Once a file is marked with
`"use client"`, all of its imports and the components it directly renders are included in
the client bundle." Server Components passed as `children`/props are not in that graph.

### Connection reuse across invocations

- **`NEXT_PUBLIC_` values are inlined at build time** and frozen: "After being built, your
  app will no longer respond to changes to these environment variables." Server-side values
  read during dynamic rendering are evaluated at runtime; the docs show `await connection()`
  from `next/server` as the way to force that.
- **Module-level singleton + `globalThis` in dev** is the documented pattern. Prisma:
  "Your application should generally only create **one instance** of `PrismaClient`" and
  "Creating multiple instances of `PrismaClient` will create multiple connection pools and
  can hit the connection limit for your database"
  ([Instantiate Prisma Client](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/instantiate-prisma-client)).
  The hot-reload guard, from
  [Database connections](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections):

  ```ts
  const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
  export const prisma = globalForPrisma.prisma || new PrismaClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
  ```

  The multiple-databases guide applies the same guard **twice**, once per client, with
  distinct global keys (`userDBPrismaClient`, `postDBPrismaClient`) — see §2.2.
- **Long-running vs serverless.** Prisma: long-running → "Create **one** instance of
  `PrismaClient` and re-use it"; serverless → "Instantiate `PrismaClient` outside the scope
  of the function handler" to maximise reuse. Pool timeouts arise when "many users are
  accessing your app simultaneously" or you "send a large number of queries in parallel
  (for example, using `await Promise.all()`)" — which is exactly what a two-project
  fan-out does if unbounded.
- Drizzle's docs do not prescribe a singleton pattern; the same module-scope + `globalThis`
  guard applies because the connection lives in the underlying `postgres`/`pg` client, not
  in Drizzle. (Not first-party — flagged below.)
- **`@next/env`** is the documented way to load `.env*` outside the Next.js runtime, e.g.
  in an ORM config file — directly relevant to `drizzle.config.ts` / `prisma.config.ts`:

  ```ts
  import { loadEnvConfig } from '@next/env'
  loadEnvConfig(process.cwd())
  ```

  and the docs' own example is an ORM config reading `process.env.DATABASE_URL`.

### Version-specific notes

- Next.js docs pages self-report `version: 16.2.12`; the env-var page's version history
  records only `v9.4.0` for `.env`/`NEXT_PUBLIC_`, i.e. that behaviour is long-stable.
- Prisma's multiple-clients guide flags a **known issue with Next.js v15.2.0 + Turbopack**
  in this configuration. Next.js 16 defaults to Turbopack; whether the issue persists on
  16.2.12 is unverified.

---

## 6. Local development

### Two local stacks side by side

Yes. The unit of isolation is the working directory plus `project_id` and ports.
From the [CLI config reference](https://supabase.com/docs/guides/local-development/cli/config):

- **`project_id`** — required, "A string used to distinguish different Supabase projects on
  the same host"; it is what container names are derived from, and defaults to the working
  directory name at `supabase init`. It must be unique per stack.
- Default ports that must be changed for the second stack:

  | Key | Default |
  | --- | --- |
  | `[api] port` | 54321 |
  | `[db] port` | 54322 |
  | `[studio] port` | 54323 |
  | `[inbucket] port` | 54324 |
  | `[analytics] port` | 54327 |
  | `[db.pooler] port` | 54329 |

The maintainer-answered discussion
[supabase/discussions#5968](https://github.com/orgs/supabase/discussions/5968) confirms the
approach: "I updated the port numbers and the `project_id` in the `config.toml`. These
values *must* be different between your projects so they do not conflict on your local
machine", covering `api.port`, `db.port`, `studio.port`, `inbucket.port`, `db.pooler.port`
and `analytics.port`, then `supabase stop` / `supabase start` to pick up changes. Each stack
is a fully separate Docker container set.

### Linking one repo to two remote projects

There is no "two links in one directory" mode — a link is per project directory. Two
mechanisms make that workable in one repo:

- **Two directories, each with its own `supabase/config.toml`**, e.g. `supabase/people/` and
  `supabase/classes/` (or `db/people/supabase/`, `db/classes/supabase/`).
- **`--workdir <string>`** — a global CLI flag, "a path to a Supabase project directory",
  with the `SUPABASE_WORKDIR` environment variable as the equivalent override
  ([supabase link reference](https://supabase.com/docs/reference/cli/supabase-link)).

`supabase link` flags: `--project-ref <string>`, `-p/--password <string>` (remote Postgres
password), `--skip-pooler` (use a direct connection instead of the pooler). Linking fetches
and validates PostgREST configuration from the platform, and "database password is saved in
native credentials storage if available."

So:

```bash
supabase link --project-ref <people-ref>  --workdir ./db/people
supabase link --project-ref <classes-ref> --workdir ./db/classes
```

### Migrations in that layout

Per [Local development](https://supabase.com/docs/guides/local-development/overview):

```bash
supabase init
supabase start
supabase migration new <name>        # writes supabase/migrations/
supabase db diff --schema public     # inspect before committing
supabase db reset                    # re-apply all migrations + seed
supabase link --project-ref <id>
supabase db pull                     # capture remote drift into a migration
supabase db push                     # apply local migrations to the linked project
```

Each of these takes `--workdir`, so the two-directory layout means every command is run
twice with a different `--workdir` (the same shape as the two `--config` / two `--schema`
invocations in §1.4 and §2.2).

[`supabase db push`](https://supabase.com/docs/reference/cli/supabase-db-push) "pushes all
local migrations to a remote database"; flags include `--db-url <string>` (percent-encoded),
`--linked`, `--local`, `--include-all` ("includes all migrations not found on remote history
table"), `--dry-run`, `--include-roles`, `--include-seed`. Tracking: on first run it creates
**`supabase_migrations.schema_migrations`** and inserts a row per applied migration keyed by
timestamp; subsequent pushes skip what is already recorded. Because the two projects are
separate databases, the two histories never interact.

### Interaction with the ORM tooling

If Drizzle or Prisma owns the schema, there are two candidate migration authorities per
project (`drizzle-kit` / `prisma migrate` vs `supabase/migrations`). Nothing in the primary
sources reconciles them; Supabase's Drizzle guide simply points Drizzle at the pooler URL
and its Prisma guide at `DATABASE_URL`/`DIRECT_URL`, leaving migration ownership to the ORM.
The local-stack connection string quirk noted in §1.2 (`postgres:postgres@supabase_db_…`)
applies when pointing an ORM at a local stack.

---

## Open / unverified

Things I could not settle from a primary source, listed so the decision ticket knows what it
is inheriting:

1. **Drizzle never states in prose that one app may hold multiple database instances.** The
   conclusion in §1.1 is inferred from the constructor API (`drizzle()` returns a value; no
   global registry). No doc page or release note asserts it.
2. **Drizzle docs/npm version skew.** `orm.drizzle.team` documents v1.0 while npm `latest`
   is `0.45.2` and v1.0 is at `rc.4`. The relational-query API shown in the docs
   (`defineRelations`, `drizzle(url, { relations })`) is not the `0.45.2` API. No first-party
   page states which doc version corresponds to which npm tag, and no v1.0 GA date is published.
3. **`drizzle-kit` migration journal table** — the default `{ table: "__drizzle_migrations",
   schema: "drizzle" }` comes from the config reference; I did not find a page confirming
   how the 1.0 "versioned migration table" changes that name or its upgrade path.
4. **Drizzle connection-reuse guidance for Next.js** — no first-party Drizzle page prescribes
   a module singleton / `globalThis` dev guard. The pattern in §5 is transferred from Prisma's
   docs and from how the underlying drivers hold connections.
5. **Prisma + Next.js 16 / Turbopack.** The known issue is documented against **v15.2.0**
   only. Whether it affects 16.2.12 (Turbopack by default) is unverified.
6. **Prisma runtime datasource override.** The v7 client reference lists `adapter` and
   `accelerateUrl` but no `datasourceUrl`/`datasources`; the data-sources page still refers
   to "override the database connection when creating your `PrismaClient`". I could not
   confirm whether the old constructor options survive in v7 or whether the adapter is now
   the only route.
7. **Supabase's deployed PostgREST version.** PostgREST upstream is v14.16 (2026-07-27);
   Supabase does not publish a per-project PostgREST version in the docs I read, so
   feature availability (e.g. aggregate syntax details) should be confirmed against a live
   project.
8. **URL-length ceiling for `in.(…)` batches.** Neither PostgREST nor Supabase documents a
   maximum request-URI length, so the safe batch size for a `netid` fan-out is unknown.
   PostgREST's documented escape hatch for oversized queries is an RPC (POST body).
9. **`postgres_fdw` on Supabase-hosted projects.** The Wrappers overview mentions
   `postgres_fdw` as a built-in Postgres FDW, but
   [Database extensions](https://supabase.com/docs/guides/database/extensions) does not
   publish the full enabled list ("over 50 extensions"), so I could not confirm it is
   available/permitted on a hosted project, nor whether outbound connections between two
   Supabase projects are allowed.
10. **Supavisor default pool size** per project/plan. The compute table gives max clients and
    max direct connections; the *default* `pool_size` is only described as configurable in
    the dashboard.
11. **Whether pooler clients and direct connections are counted against each other** — the
    connection-management page does not say.
12. **What `supabase link` writes to disk** (e.g. `supabase/.temp`) is not documented in the
    CLI reference beyond "database password is saved in native credentials storage if
    available" — relevant to whether two linked directories can safely coexist in one repo
    and what must be gitignored.
13. **Reconciling ORM migrations with `supabase/migrations`.** No primary source describes a
    sanctioned layout where `drizzle-kit`/`prisma migrate` owns the schema and the Supabase
    CLI runs the local stack.
