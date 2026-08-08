# The spec

This repo is a **spec, not an application.** Nothing here runs. It is the output of
[Map: a buildable spec for the ITP/IMA catalog walking skeleton](https://github.com/nopivnick/lineup-prototype-03/issues/1),
a wayfinder map of thirty closed tickets, and it exists to be built from **in a single
pass, with no decisions left to make**.

If you are the build effort, this file is your entry point. Read it, then read the six
packages in the order below. You should not need to open the issue tracker to build — the
tickets are linked throughout as provenance, not as required reading.

## What gets built

Next.js + Mantine + mantine-datatable, two Supabase projects (`people` and `classes`),
curated Postgres schemas, hand-written fixtures, a dev user-switcher with no login, and
**seven screens**: a Catalog list, a term Lineup, a chair-only roles page, a Course detail
page, an Offering detail page, a proposals list, and a proposal review page — plus two create
forms. The Course, Offering and Course-proposal-review lifecycles persist as XState
snapshots.

## Read in this order

| # | Package | What it settles |
|---|---|---|
| 1 | [`machines/`](./machines/) | the three lifecycles — states, events, and the standing principles the whole map reasons by |
| 2 | [`schema/`](./schema/) | 21 tables of reference DDL, and the field-class map |
| 3 | [`permissions/`](./permissions/) | the matrix, the read tiers, who may write what |
| 4 | [`data-access/`](./data-access/) | the seven read modules, the two write paths, the identity seam |
| 5 | [`fixtures/`](./fixtures/) | the seed content |
| 6 | [`prototypes/`](./prototypes/) | what each screen displays — **variant D** in each file is the settled shape |

Start with `machines/README.md` regardless. Its **Standing principles** section is the
reasoning six other packages inherit, and several decisions elsewhere are only legible
through it.

`legacy/` and `research/` are material this repo received rather than decided — the two
legacy MySQL dumps and one research subagent's findings on multi-database access. Read them
if a package points you there.

> **Packages 3, 4 and 5 are being written now.** They were settled in issue comments and
> are being transcribed into packages by
> [#50](https://github.com/nopivnick/lineup-prototype-03/issues/50)'s task tickets. Until
> those close, the settled content lives in the tickets each package will cite.

## What the build effort inherits

Seven constraints the map decided but deliberately did not act on. Nothing in an ordinary
build brief would tell you to look for these.

**A preview deploy lets anyone with the link be any user.**
[#11](https://github.com/nopivnick/lineup-prototype-03/issues/11) gates the dev identity
reader on an `ALLOW_DEV_ACTOR` env var *precisely so a preview deploy can carry it*, and
[#28](https://github.com/nopivnick/lineup-prototype-03/issues/28) declined to close that
door with RLS on the grounds that it was opened on purpose. **That deployment needs
protection** — Vercel deployment protection or equivalent. This is the one inherited
constraint that is a live risk rather than a design note.

**You owe a ~15-line test.** It asserts that the `CHECK` constraint's value set equals the
machine's exported state union.
[#13](https://github.com/nopivnick/lineup-prototype-03/issues/13) made this the detection
mechanism for a machine change that invalidates persisted snapshots, in place of a
`machine_version` column. Write it against `snapshot->>'value'`, not against the generated
`status` column — see `schema/README.md`.

**Reseed is the recovery path**, not a migration function. When a machine change
invalidates a snapshot, `db:reset`. Per-version snapshot migration functions are out of
scope by construction: every fixture is reproducible from the seed script.

**No RLS.** [#28](https://github.com/nopivnick/lineup-prototype-03/issues/28) ruled the read
tiers a product rule rather than a security boundary. The shape RLS *would* take is
recorded on the map for the effort that adds real authentication — three predicates, one
per tier, role-flat except a `created_by` comparison on proposals.

**`updated_at` / `updated_by` only — there is no audit table.**
[#10](https://github.com/nopivnick/lineup-prototype-03/issues/10) records *that* a row
changed and by whom, never *what*, and nothing at all for a deletion. **Do not widen the
transition log to cover it**: `event`, `from_state` and `to_state` are exactly machine
values and that meaning is load-bearing. A later effort inherits a table to add, not a
table to reshape.

**The machines model decisions, not communication.** No notifications, to anyone.
[#19](https://github.com/nopivnick/lineup-prototype-03/issues/19) named three transitions
that imply an off-system act the skeleton represents without discharging — `offer` (the
lead never learns they were asked), `withdraw` (the lead waits on an answer to a question
that no longer exists) and `cancel` (enrolled students). A real department tells people by
email, as they do now.

**`course.minted_from_review_id` is `NOT NULL` and legacy migration can drop it.**
[#49](https://github.com/nopivnick/lineup-prototype-03/issues/49) tightened it because every
seeded course is minted through a proposal and an approving review. Legacy migration, which
is out of scope, would import courses with no review behind them — it inherits a constraint
it can drop in one statement that cannot fail.

## Typechecking

The `.ts` artifacts are real TypeScript and they cross-import: `machines/course.machine.ts`
imports `LiveState` from `offering.machine`, and `permissions/` and `fixtures/` name the
state unions `offering.machine` exports.

```
npm install
npm run typecheck    # tsc --noEmit over docs/**/*.ts
```

CI runs it on every push and PR. This is not the build — no framework, no database, no
runtime. It exists so that a typo'd state name in the spec is a compiler error rather than
something you discover while building from it.

## Conventions

- [`agents/spec-packages.md`](./agents/spec-packages.md) — what a package is, and how an
  overturned decision gets absorbed without leaving the original standing beside its
  replacement.
- [`agents/domain.md`](./agents/domain.md) — the glossary contract. There is no
  `docs/adr/`; the issue tracker is the decision log.
- [`agents/issue-tracker.md`](./agents/issue-tracker.md) — GitHub, via `gh`.
- [`agents/triage-labels.md`](./agents/triage-labels.md) — the five triage roles.
- [`../CONTEXT.md`](../CONTEXT.md) — the glossary. Several words here mean something
  specific and narrower than usual; the excluded ones are defined too.
