# lineup-prototype-03

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in `nopivnick/lineup-prototype-03`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, using the default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Spec packages

Settled decisions live in `docs/<area>/` — a reference artifact plus a README that logs
amendments. Six packages; `docs/README.md` indexes them. See `docs/agents/spec-packages.md`.

### Domain docs

Single-context — one `CONTEXT.md` at the repo root, glossary only. No `docs/adr/`: the
issue tracker is the decision log. See `docs/agents/domain.md`.

## Typechecking

The reference artifacts in `docs/` are real TypeScript and they cross-import. `npm run
typecheck` runs `tsc --noEmit` over them against `tsconfig.docs.json`; CI runs it on every
push and PR. It is separate from the application's own typecheck, which `next build` runs
against the root `tsconfig.json` — `docs/` is excluded there.

## The application

There is now one, scaffolded by
[#75](https://github.com/nopivnick/lineup-prototype-03/issues/75): Next.js and Mantine over
two Postgres projects. See `README.md` to run it. `docs/` is still the spec and still
reference rather than application code — the build converts it rather than lifting it, per
`docs/agents/spec-packages.md`.

**No page holds a database handle.** Both `drizzle()` instances live in `db/handles.ts`;
`npm run build` is `eslint . && next build` so that a page importing one fails the build.
See `docs/data-access/README.md`.

**The lifecycles and the rules are code now**, converted by
[#76](https://github.com/nopivnick/lineup-prototype-03/issues/76). `lib/machines/*.machine.ts`
holds the three machines and `lib/permissions.ts` the matrices, the fourteen field classes,
the read tiers, the chair bypass and the invariants. Three things about them are structural
rather than conventional:

- `lib/permissions.ts` imports `server-only`, so a Client Component reaching for the rules
  fails the build.
- `fieldClassFor(column)` is total and returns an unwritable class for anything unclassified,
  which is [#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)'s *a column with
  no field class is unwritable*.
- `db/classes/schema.ts` builds each state `CHECK` from the machine's own state set, and
  `db/machine-states.test.ts` asserts the applied migration agrees — `npm run test`, in CI.
  That is the alarm [#13](https://github.com/nopivnick/lineup-prototype-03/issues/13) chose
  over a `machine_version` column. When it fires, the fix is `npm run db:reset`; there are no
  per-version snapshot migrations by construction.

**The four write paths are `db/write/`**, built by
[#77](https://github.com/nopivnick/lineup-prototype-03/issues/77), and every check is inside
the writer rather than beside it. **The fixture world is seeded through them**, by
[#78](https://github.com/nopivnick/lineup-prototype-03/issues/78): `db/seed.ts` walks the
eleven steps of the seed order over `db/fixtures.ts`, minting each course by approving a
review and driving each class event by event, so the transition log ships populated and no
snapshot is hand-authored anywhere.

Exactly one write in the run is unchecked — the genesis `chair` grant — which is what makes
a passing seed a satisfiability proof of the matrix rather than a fixture load; `db/seed.ts`
carries that argument in full. It runs in CI against a real Postgres pair on every push, and
`npm run db:reset` is how you run it here. Two rules travel with it and are easy to break by
accident:

- **Dates are literal.** A transaction is opened *at* a moment and every write path called
  inside it inherits that moment, so the seed's world stays dated 2018–2026 rather than
  collapsing onto the instant of the reset. Settled by
  [#107](https://github.com/nopivnick/lineup-prototype-03/issues/107), which also fenced the
  dated opener: `writeToClassesAt` is `db/seed.ts`'s alone, behind the same ESLint rule that
  keeps handles out of pages, because a caller-supplied date is the one way to write a
  plausible lie into the transition log. Everything else calls `writeToClasses` and lets the
  column defaults answer.
- **The seed is a caller, not an author.** If a row the fixtures require cannot be written
  through a path, that is a hole in the rules and it becomes a ticket — as
  `course_requirement_category` did, in
  [#106](https://github.com/nopivnick/lineup-prototype-03/issues/106). Do not widen the
  writers to make the seed pass. #106 is what that looks like when it closes: the table
  got a field class of its own, and the seed's raw insert became a `writeFields` call.

**Nobody signs in**, by [#79](https://github.com/nopivnick/lineup-prototype-03/issues/79).
`lib/auth/actor.ts` is the application's only identity import and has exactly one
implementation at a time — there is no `if (dev)` anywhere, and wiring SSO means replacing
that module's body, so *the dev path is in* and *SSO is wired* cannot both be true. Three
things about it are structural rather than conventional:

- It is gated on **`ALLOW_DEV_ACTOR` and never on `NODE_ENV`**, because Vercel sets
  `NODE_ENV=production` on previews too and the skeleton exists to be shown on one. Without
  the flag the module throws at import and `next build` fails; CI's build job sets it, and
  the day SSO lands that line comes out with the reader's body.
- **`cookies` is a restricted import everywhere but `lib/auth/`**, under the same
  `no-restricted-imports` rule that keeps handles out of pages, so *the only identity import*
  is a build failure rather than a claim in a doc comment. A second reader of the cookie
  would be a second implementation of identity, which is what makes *the dev path is in* and
  *SSO is wired* able to be true at once.
- **What the switcher persists is a netid and nothing else.** `user_role` is read three times
  in a request and each read is at the moment its answer is used: `db/read/directory.ts` for
  the dev bar's list, `db/read/actor-roles.ts` for the actor's own labels — the two anonymous
  reads `READ_TIERS` allows — and `readActorFacts` in `db/write/rules.ts` inside the locking
  transaction, which is the only one a *rule* consults. A set resolved at request scope would
  already be stale.
- **Every Server Action starts with `requireActor()`** and rejects a null actor rather than
  guessing at one. `getActor()` returning `null` is not an error: it means nobody has been
  chosen, and the reader lands on `/be-somebody`.

**The deployment carrying that reader is behind a door**, by
[#80](https://github.com/nopivnick/lineup-prototype-03/issues/80): `itp-ima/lineup-prototype-03`
is behind Vercel Authentication, `ALLOW_DEV_ACTOR` is set on **Preview and nowhere else**, and
a production build therefore fails at import rather than deploying an impersonation reader.
The protection is the only boundary there is — [#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)
declined RLS on the grounds the door was opened on purpose — so removing it is not a
housekeeping change. `npm run check:protection` reads the live settings and fails if it has
stopped being true; the rule is `scripts/deployment-protection.ts` and is tested without a
network. It is deliberately not in CI: a pull request has no credential to read project
settings with, and a job that skipped itself would report a shut door on every run in which
it learned nothing. See `README.md#the-deployment-is-behind-a-door`.

**The first real screen is the Catalog**, built by
[#81](https://github.com/nopivnick/lineup-prototype-03/issues/81): `db/read/catalog.ts` is the
first of the seven view-shaped read modules, `app/(signed-in)/catalog/` is the screen, and the
three conventions the six later views inherit — the `⋯ n` menu, the three-clause refusal
wording, and *absent, never empty* — are built there. Four things about it are structural rather
than conventional:

- **It issues no query against `people` and a test asserts it**, by counting calls to `peopleDb`
  rather than by reading the source. That is [#37](https://github.com/nopivnick/lineup-prototype-03/issues/37)'s
  *the Catalog displays no person* made checkable, and it is the property a build agent reading
  [#9](https://github.com/nopivnick/lineup-prototype-03/issues/9) alone would undo.
- **The greyed control and the writer's exception carry one sentence.** `routesFor` and
  `stillTeaching` moved into `db/write/rules.ts` so the read side and `applyTransition` compute
  refusals with the same functions; a second copy of the wording is how a rule and its
  explanation drift apart, which is the thing #14 exists to prevent.
- **`db/read/actor-facts.ts` is the read side's copy of `ActorFacts` and nothing may write
  through it.** The writer re-reads inside the locking transaction; this one runs at request
  scope and produces an **affordance**, so a grant revoked between the render and the click makes
  the menu stale and the writer refuses. That is the design working, not failing.
- **The Server Action is an actor-resolution wrapper**, and the only rule-shaped thing in it is
  the narrower event union — read off the machine, because the event arrives from a browser.

The dev path is `lib/auth/`, `db/read/directory.ts`, `app/be-somebody/`, `app/role-chips.tsx`
and the dev bar in `app/(signed-in)/`. The SSO swap deletes all of it but the reader, whose
body it replaces, and `db/read/actor-roles.ts`, which survives — the netid it is keyed by is
the one thing SSO changes the source of.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
