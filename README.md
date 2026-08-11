# lineup-prototype-03

The ITP/IMA catalog and term lineup — a walking skeleton built from the settled spec in
[`docs/`](./docs/README.md).

Read [`CONTEXT.md`](./CONTEXT.md) before the packages: several words here mean something
narrower than usual.

## Running it

```
npm install
cp .env.example .env.local     # four connection strings, and ALLOW_DEV_ACTOR
npm run db:reset               # drop both, migrate both, seed the fixture world
npm run dev
```

There is no login screen. The first thing the app asks is **who you are**, and the answer is
one click from a list of the seed's thirteen people.

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

## Be somebody

[`lib/auth/actor.ts`](./lib/auth/actor.ts) is the application's **only identity import**, and
there is exactly one implementation of it at a time. `getActor()` reads a cookie whose entire
payload is a **netid** and returns `{ netid } | null`; `null` is not an error, it means nobody
has been chosen, and the reader lands on `/be-somebody` instead — the same shape as *no
session → sign in*. Wiring NYU's SSO means replacing that module's body, so *the dev path is
in* and *SSO is wired* cannot both be true. There is no `if (dev)` anywhere.

The module is gated on **`ALLOW_DEV_ACTOR` and never on `NODE_ENV`**: Vercel sets
`NODE_ENV=production` on previews too, and a `NODE_ENV` gate would brick the exact deployment
this skeleton exists to be shown on. Without the flag the module throws at import, so a build
carrying the dev reader does not start — `next build` fails, and CI's build job sets the flag
for that reason.

**The inherited risk travels with it**: the gate is chosen *so preview deploys carry it*,
which means a preview URL lets anyone with the link be any user. The deployment is
protected, and the next section is the whole of how.

**The switcher carries a netid and nothing else** — never a role. A serialized
`{netid, roles}` cookie would make the JSON an interface, and the role set has changed three
times. It is not a role switcher either: permissions OR independently-evaluated
`(role, relationship)` conjunctions, so narrowing to one active role would stop the app
running the rule under test. *See it as instructor-only* is a fixture concern — be a person
who holds only `instructor`.

Nothing else in the app may read that cookie. `cookies` is a restricted import outside
`lib/auth/`, under the same rule that keeps handles out of pages, so a second reader of the
actor — a second implementation of identity — fails the build.

**Roles are read where they are used**, three times in a request, each at the moment its
answer is used. The dev bar's list of people comes from
[`db/read/directory.ts`](./db/read/directory.ts) and the actor's own labels from
[`db/read/actor-roles.ts`](./db/read/actor-roles.ts) — the two anonymous reads `READ_TIERS`
allows. A *rule* consults neither: `readActorFacts` in
[`db/write/rules.ts`](./db/write/rules.ts) re-reads `user_role` and `program_director` inside
the locking transaction, because a set resolved at request scope would be stale by the time a
writer used it. Every Server Action starts with `requireActor()` and rejects a null actor
rather than guessing at one.

## The deployment is behind a door

The skeleton is deployed at **`itp-ima/lineup-prototype-03`** on Vercel, and it is behind
**Vercel Authentication on every generated URL** — a request without an ITP-IMA Vercel
session is redirected to a sign-in page and never reaches the application at all. This was
set before the project's first deployment existed and before any link was shared, by
[#80](https://github.com/nopivnick/lineup-prototype-03/issues/80).

**Read this before removing it.** The door it holds shut is open on purpose and cannot be
closed from inside the application:

- The dev identity reader is deployed *deliberately*.
  [#11](https://github.com/nopivnick/lineup-prototype-03/issues/11) gated it on
  `ALLOW_DEV_ACTOR` rather than `NODE_ENV` **so that a preview deployment could carry it** —
  a skeleton nobody can walk through demonstrates nothing.
- [#28](https://github.com/nopivnick/lineup-prototype-03/issues/28) then declined to close
  the door with row-level security, on the grounds that it was opened on purpose and the
  read tiers are a product rule rather than a security boundary.
- So the application has no notion of a stranger: **anyone who reaches a page can be any of
  the thirteen people**, including the chair, and can write as them. The protection is not
  defence in depth. It is the only thing there.

`ALLOW_DEV_ACTOR` is set on the **Preview** environment and nowhere else, which is also
deliberate. Production has no value for it, so a production build **fails at import** —
`lib/auth/actor.ts` throws, `next build` stops, and nothing deploys. That is the safe half
of the pair and it is worth leaving broken: the day SSO lands, that variable and the
reader's body come out together.

**The standing check**:

```
npm run check:protection
```

It reads the live project settings and the live environment list and fails if a preview of
this repository could be reached with a link alone, or if the flag has appeared on an
environment that is not protected. The rule is a pure function in
[`scripts/deployment-protection.ts`](./scripts/deployment-protection.ts) with tests beside
it; the caller needs `vercel link` to have been run — it reads the project id out of the
git-ignored `.vercel/project.json` — and a Vercel credential, which it takes from
`VERCEL_TOKEN` or from the login `vercel` itself already holds. That is why it is a command
somebody runs — before sharing a URL, and after touching anything under Project Settings →
Deployment Protection — rather than a CI job, which has neither, and which would report a
shut door on every run in which it learned nothing.

**One gap is known and left open**: the protection is Vercel's *Standard* — every generated
`*.vercel.app` URL, preview and production alike. It does **not** cover a custom domain, and
the plan on this team rejects the setting that would. Nothing is affected today, because
there is no custom domain and production carries no flag; the day either changes, that is
the thing to change with it. `npm run check:protection` encodes this by counting production
as protected only under the strongest setting.

**The Preview environment points at the development database pair** — the same two
connection strings `.env.local` carries. So `npm run db:reset` reseeds what the deployment
serves, both routes being server-rendered on demand, and a write made on the preview is a
write to the world you develop against. That is the arrangement a skeleton wants and it is
worth knowing before demonstrating from it.

Deploying by hand is `vercel deploy --target=preview`. **Name the target.** This project's
first bare `vercel deploy` went to production, where there is no flag, and the build stopped
at the reader's import — the gate doing exactly its job, and not the deployment anyone
wanted. [`vercel.json`](./vercel.json) names the framework for the same class of reason: the
project was created empty, so the first build produced a Next.js app and was then asked for
a static `public/` directory it had no reason to have.

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

## The Catalog

The first real screen, at [`/catalog`](./app/(signed-in)/catalog): every Course eligible to be
offered, grouped into ITP's, IMA's and LowRes's three catalogs, with no term anywhere. It reads
through [`db/read/catalog.ts`](./db/read/catalog.ts) and holds no handle, and what comes back is
composed rows — the record, what this actor may do about it, and the refusal for what they may
not, already intersected across machine legality, the invariants and the permission term.

**It is the one view that never touches the `people` project.** [#37](https://github.com/nopivnick/lineup-prototype-03/issues/37)
ruled that the Catalog displays no person, which makes this the only read in the skeleton immune
to the cross-project failure mode — and `db/read/catalog.test.ts` asserts it by counting calls
to `peopleDb`, because a build reading [#9](https://github.com/nopivnick/lineup-prototype-03/issues/9)
alone would add the batch fetch back. The gap that opens — *which of my courses cannot be offered
yet?* — closes without a person, as a derived **`not offerable yet`** marker over an empty area
set or a null area head, whose tooltip names which is missing.

Three conventions the rest of the skeleton inherits are built here first:

- **The `⋯ n` menu.** One control per row; `n` is how many moves the actor can actually make, so
  `⋯ 0` says *nothing to do here* without opening anything. Opening it lists **every** move the
  machine offers from that state — the permitted ones clickable, the refused ones greyed with the
  reason beneath. A move the machine does not offer is absent rather than greyed, so a `Retired`
  course carries no menu at all.
- **Refusal wording, three clauses.** The refused thing and its explanation are one value; the
  person or the role is named, never the rule; and where the refusal's whole content is data
  elsewhere, the dependency is named and listed — *"This course has 1 class that has not finished
  teaching. · 20261 — Slated"*. The greyed control and the writer's own exception carry the
  **same sentence**, because both come out of `db/write/rules.ts`.
- **Absent, never empty.** The Actions column is absent for an actor who can never act, on Tier
  2's *holds any acting role* predicate — read off `READ_TIERS` rather than restated.

Two things about it are the library's constraint rather than a choice: rows group with
`rowExpansion` and `trigger: 'always'`, because mantine-datatable has no row grouping and its
`groups` groups *columns*; and **sorting is the application's**, the table handing over a column
and a direction and sorting nothing.

`Retired` is hidden by the filter's **default** and not by the query, so widening the filter
reaches it — which is what keeps a retired course reachable from the only view that lists
courses. The search box covers title and number, and nothing else: a Course has no instructor.

Course transitions fire from here for real, through
[`app/(signed-in)/catalog/actions.ts`](./app/(signed-in)/catalog/actions.ts), which is an
actor-resolution wrapper and nothing more — resolve, reject a `null`, open the transaction, call
`applyTransition` in. It holds no rules.

## The Lineup

The second screen, at [`/lineup`](./app/(signed-in)/lineup): the classes running in one selected
term, gathered under the course they are sections of, so that two sections of Physical Computing
read as variations rather than as repetition. Course-level facts — number, title, credits, the
course's own tags — sit on the group header and are stated once; a section row carries only what
differs from its siblings: section number, state, roster, meetings, cap, foreign tags, actions.

**This is where the cross-project stitch happens**, and since [#37](https://github.com/nopivnick/lineup-prototype-03/issues/37)
made the Catalog person-free it is the only list that consumes it. `classes` drives; every netid
the page will show — the rosters, and the granter of every seat-sharing tag — is batched into
**one** query against `people` and matched in memory. **Two round trips per page, whatever its
size**, and `db/read/lineup.test.ts` asserts it by wrapping both handles and counting, with the
actor's facts *measured* and subtracted because they are `cache()`d and shared with every other
read on the page. No name is denormalised into `classes` and no transaction spans the two
projects — it cannot, which is why a roster netid is not a foreign key.

**A roster entry whose netid the directory does not know renders anyway**, as the netid in
monospace plus a quiet *no name on file*, deliberately not styled as an error. It is never
dropped: skipping it would leave a class sitting in `Staffed` with an empty roster, a cosmetic
problem masquerading as the lifecycle being broken. `db/read/stitch.ts` makes that structural
rather than careful — it hands back a resolver that answers for **every** netid rather than a
`Map` whose misses invite a `.filter()`.

**This is also where the read tiers first become visible.** A `student` sees the classes an
instructor agreed to teach or once did, and nothing of the six states that are the department's
staffing process. Sign in as Marcus Ola and Spring 2027 has four sections; sign in as Dana Kirsch
and it has ten, with a whole LowRes course appearing that was **absent** before — not an empty
group, because an empty group announces that the department is staffing something the reader may
not see. There are **two** empty states and no third: a term with nothing slated in it, and a view
filtered to nothing.

**The lead is whoever holds position 0, never `roster[0]`.** `leadOf` and `rosterShape` are
[`lib/roster.ts`](./lib/roster.ts), and the shape is a **union of three** — nobody seated, a lead
with co-instructors, and *rows below a vacant position 0*. That third one is what `decline` and
`withdraw` leave behind, and making it an arm of a union rather than a nullable lead is why the
renderer cannot report it as an ordinary staffed roster.

**The three meeting kinds read differently at a glance**, which is the first thing in the skeleton
that makes LowRes visibly different from ITP and IMA: a weekday and a time over a room; the word
**Intensive** over a date range; and *Asynchronous* alone, with no time and no room. One LowRes
section carries an intensive **and** an asynchronous slot at once, which is the whole reason
[#10](https://github.com/nopivnick/lineup-prototype-03/issues/10) declared the `kind` column
instead of inferring it from which columns are filled.

**Foreign tags carry four signals**, under *Also counts toward*: the other program's name, its
hue, a dashed edge and a `↳`, so the one cross-program fact in the model does not rest on colour —
and the tooltip names who granted it and when. Seat sharing is the only place a program other than
the course's own appears anywhere, so every program name this screen renders is a grant.

Offering transitions fire from here for real, through
[`app/(signed-in)/lineup/actions.ts`](./app/(signed-in)/lineup/actions.ts), which holds no rules.
`cancel` and `kill` open a free-text **why** box first — those are the two acts that end something
the department had committed to, and the two where the state pair in the log cannot reconstruct the
reason. `staff` and `unstaff` appear nowhere on the screen and nowhere in the action, which is
**non-exposure rather than a check**: there is no branch refusing them, so a browser naming one
gets the same answer as a browser naming nonsense.

## Checks

```
npm run typecheck    # tsc over docs/**/*.ts — the spec, not the app
npm run lint         # includes the no-handle-in-a-page rule
npm run test         # the machine-state CHECK test and the deployment-protection rule,
                     # plus the write paths against a real database pair when .env.local
                     # has one; those skip themselves when it does not
npm run build        # lint, then next build
npm run db:reset     # and the seed with it — the matrix's satisfiability test

npm run check:protection   # asks Vercel whether the preview is still behind its door;
                           # needs a Vercel login, so it is not in CI
```

CI runs `typecheck`, `test`, `build` and the seed on every push to `main` and every pull
request. The seed job brings up its own Postgres and runs `db:reset` against it.
