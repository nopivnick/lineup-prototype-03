# lineup-prototype-03

The ITP/IMA catalog and term lineup — a walking skeleton built from the settled spec in
[`docs/`](./docs/README.md).

Read [`CONTEXT.md`](./CONTEXT.md) before the packages: several words here mean something
narrower than usual.

## Running it

```
npm install
cp .env.example .env.local     # fill in four connection strings
npm run db:reset               # drop, migrate both projects, reseed
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

## Checks

```
npm run typecheck    # tsc over docs/**/*.ts — the spec, not the app
npm run lint         # includes the no-handle-in-a-page rule
npm run build        # lint, then next build
```

CI runs `typecheck` and `build` on every push to `main` and every pull request.
