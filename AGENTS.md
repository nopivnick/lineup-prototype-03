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
holds the three machines and `lib/permissions.ts` the matrices, the thirteen field classes,
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

- **Dates are literal.** The four write paths take the moment as an argument beside the
  actor (`at`), so the seed's world stays dated 2018–2026 rather than collapsing onto the
  instant of the reset. The final shape of that seam is open as
  [#107](https://github.com/nopivnick/lineup-prototype-03/issues/107).
- **The seed is a caller, not an author.** If a row the fixtures require cannot be written
  through a path, that is a hole in the rules and it becomes a ticket — as
  `course_requirement_category` did, in
  [#106](https://github.com/nopivnick/lineup-prototype-03/issues/106). Do not widen the
  writers to make the seed pass.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
