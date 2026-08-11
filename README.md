# lineup-prototype-03

The ITP/IMA catalog and term lineup — a walking skeleton built from the settled spec in
[`docs/`](./docs/README.md).

Read [`CONTEXT.md`](./CONTEXT.md) before the packages: several words here mean something
narrower than usual.

## Running it

```
npm install
cp .env.example .env.local     # fill in four connection strings
npm run db:reset               # drop both, migrate both, seed the fixture world
npm run dev
```

`docs/` still holds the spec, and it is still reference rather than application code —
nothing imports it into the running system. What changed is that there is now a running
system beside it.

## Two Postgres projects

`people` holds one table, `person`. `classes` holds the other twenty. **No foreign key
crosses between them** — the two projects cannot reference each other, so `netid` is the
join key and the stitch is two queries in TypeScript rather than a join. `docs/schema/` is
authoritative for every table, type and constraint; `db/*/schema.ts` states the same schema
in the form `drizzle-kit` generates migrations from.

Each project has its own `drizzle-kit` config with its own explicitly-set `out` directory,
so the two have two independent migration histories. Every database command runs once per
project, `people` first:

| Script | What it does |
|---|---|
| `npm run db:generate` | writes a migration per project from `db/*/schema.ts` |
| `npm run db:migrate` | applies pending migrations, `people` then `classes` |
| `npm run db:reset` | drops both, migrates both, reseeds |

**A change touching both projects cannot be atomic** — one commit, two migration files,
applied in sequence, and a failure of the second leaves it half-applied. `db:reset` is the
recovery path, and it is also the recovery path when a machine change invalidates persisted
XState snapshots. There are no per-version snapshot migrations by construction: every
fixture is reproducible from the seed.

Nothing Supabase-specific is in use, and no Postgres extension is required. Search is plain
`ILIKE`; adding `pg_trgm` later would change no application code.

## The seed drives the world through the machines

[`db/seed.ts`](./db/seed.ts) builds the department's fixture world — thirteen people,
seventeen courses, twenty-eight classes, twenty-three proposals — by **doing things** rather
than by inserting rows at rest. Every course was minted by approving a review, every class
walked its own history event by event, and the transition log ships populated with 218 rows
because the seed drove it. No snapshot is hand-authored anywhere. `db/fixtures.ts` holds the
world, converted from [`docs/fixtures/`](./docs/fixtures/README.md), which stays
authoritative.

**The seed is checked like any other caller.** Exactly one write in the whole run is
unchecked — the genesis `chair` grant, which has to come from somewhere, because the chair
writes `user_role` and nobody else does. Everything else goes through the same four write
paths a screen uses, with every permission, invariant and field-class state gate enforced.
Two categories of row have no in-app author and therefore no path to take: the reference
data and the `person` rows, which is why they are the seed order's first two steps. There
were three: `course_requirement_category` was claimed by no field class, so nothing could
write it, and the seed said so rather than widening a writer to suit itself.
[#106](https://github.com/nopivnick/lineup-prototype-03/issues/106) closed that by giving
the table a field class of its own, and the rows go through the field writer now.

That makes a passing seed a **satisfiability proof of the permission matrix**. If no legal
actor existed for some act the world needs, the seed could not run — so it runs in CI on
every push, against a real Postgres pair, where a failure is a much louder report of a hole
than a matrix nobody ever tried to use.

Dates are literal and never computed from run time: the world sits on 20 October 2026 and
its history runs from 2018, so a screenshot stays true across resets. A transaction is
opened *at* a moment and every write path called inside it inherits that moment; a Server
Action opens an undated one and gets the database's clock. Only the seed can open a dated
transaction, and an ESLint rule is what makes that true.

The seed is not idempotent and does not try to be — it refuses a database that already holds
rows. Reseed is the recovery path, and `db:reset` is how you take it.

## No page holds a database handle

Both `drizzle()` instances live in [`db/handles.ts`](./db/handles.ts) and nowhere else. It
is imported by the view-shaped read modules under `db/read/` and the write paths under
`db/write/`, and by nothing else — a page, component or Server Action that imports it
**fails the build**, because `npm run build` is `eslint . && next build` and the
`no-restricted-imports` rule in [`eslint.config.mjs`](./eslint.config.mjs) is set to
`error`.

That is structural rather than disciplinary on purpose. The read tiers are enforced in
TypeScript and not by row-level security, which means a forgotten `WHERE` clause in a page
would leak rows silently, with the database unable to help. The answer is that pages never
write a `WHERE` clause at all, because they never hold a handle. See
[`docs/data-access/README.md`](./docs/data-access/README.md).

`drizzle()` is handed no schema, so `db.query.<table>` does not exist on the object. Every
read is core `select()` / `leftJoin()`.

## The lifecycles and the rules

The three machines are [`lib/machines/*.machine.ts`](./lib/machines) and the permission model
is [`lib/permissions.ts`](./lib/permissions.ts) — real modules the app imports, converted from
the spec, which stays authoritative. `lib/permissions.ts` is `server-only`: a Client Component
that imports it fails the build, and the client renders from a permitted-action set the server
ships as data.

State persists as an XState snapshot in a `jsonb` column, projected by a generated, indexed
`status` column. Each state `CHECK` is written against `snapshot->>'value'`, and
`db/classes/schema.ts` builds its value set from the machine, so the only hand-written copy is
the migration. [`db/machine-states.test.ts`](./db/machine-states.test.ts) asserts the applied
migration still admits exactly the states its machine declares — **the alarm for a machine
changed without a migration behind it**, in place of a `machine_version` column. When it
fires, reseed: `npm run db:reset`. There are no per-version snapshot migrations by
construction.

## Checks

```
npm run typecheck    # tsc over docs/**/*.ts — the spec, not the app
npm run lint         # includes the no-handle-in-a-page rule
npm run test         # the machine-state CHECK test, plus the write paths against a real
                     # database pair when .env.local has one; skipped when it does not
npm run build        # lint, then next build
npm run db:reset     # and the seed with it — the matrix's satisfiability test
```

CI runs `typecheck`, `test`, `build` and the seed on every push to `main` and every pull
request. The seed job brings up its own Postgres and runs `db:reset` against it.
