# Spec packages

How this repo homes a settled decision, and how it absorbs one that gets overturned.

Settled by [Where does the rest of the spec live?](https://github.com/nopivnick/lineup-prototype-03/issues/50),
which found the convention rather than invented it: `docs/machines/`, `docs/schema/` and
`docs/prototypes/` had each independently arrived at the same shape without anyone writing
it down.

## What a package is

A **spec package** is a directory under `docs/`:

```
docs/<area>/
├── README.md          ← the ledger
└── <artifact>         ← the reference artifact
```

**The artifact is the primary statement**, written in the language the build effort will
actually use — TypeScript for lifecycles, permissions, seams and fixtures; SQL for the
schema; HTML for the screens. It is **reference, not application code**: nothing runs it,
nothing imports it into a running system, and the build effort converts it rather than
lifting it.

**The README is the ledger.** It narrates what the artifact says, records what was
considered and dropped, and — the part that earns the split — absorbs amendments in place.

The artifact carries the shape; the README carries the reasoning and the history. Neither
substitutes for the other, and a package with only one of them is unfinished. That was the
concrete defect this convention was written to fix: `docs/prototypes/` held the settled
variant of every screen and no ledger, so the verdict *"variant A for both forms"* existed
only in a git commit message.

## The packages

| Package | Artifact | What it settles |
|---|---|---|
| `docs/machines/` | 3 × `.ts` | the three lifecycles |
| `docs/schema/` | 2 × `.sql` | the curated Postgres schema for both projects |
| `docs/prototypes/` | 5 × `.html` | what each screen displays |
| `docs/permissions/` | `.ts` | the matrix, the read tiers, the field-class map |
| `docs/data-access/` | `.ts` | the read modules, the write paths, the identity seam |
| `docs/fixtures/` | `.ts` | the seed content |

`docs/legacy/` and `docs/research/` are **not** packages. They hold material this repo
received rather than decided — the legacy dumps and a research subagent's findings. They
have no ledger because nothing about them can be overturned.

`docs/README.md` is the index to the six, and the build effort's entry point. `CONTEXT.md`
at the repo root is the glossary; see [domain.md](./domain.md).

## Three rules

### 1. Never amend an artifact without a closed ticket behind it

The decision lives in the ticket. A change with no link is a decision nobody made.

### 2. Every claim names the ticket that settled it

Inline, at the claim — a SQL comment beside the column, a link in the README sentence, a
`//` above the type. Already the practice in `docs/schema/README.md`
(*"Where a column exists because a ticket said so, the SQL comment names the ticket"*).

It exists so a dropped clause is **findable by diffing ticket coverage** rather than by
re-reading the prose. A README that cites eight tickets when nine settled the area has a
hole you can locate without knowing what it is.

### 3. An amendment replaces the original — it never stands beside it

This is the rule the convention exists for. Closed tickets get overturned here routinely:
[#41](https://github.com/nopivnick/lineup-prototype-03/issues/41) amended
[#19](https://github.com/nopivnick/lineup-prototype-03/issues/19),
[#42](https://github.com/nopivnick/lineup-prototype-03/issues/42) amended
[#41](https://github.com/nopivnick/lineup-prototype-03/issues/41),
[#43](https://github.com/nopivnick/lineup-prototype-03/issues/43) completed a rule
[#14](https://github.com/nopivnick/lineup-prototype-03/issues/14) left half-drawn.

So when a ticket overturns something:

1. **Change the artifact.** The old shape does not survive anywhere in it.
2. **Move the claim in the README**, don't append a correction next to it.
3. **Log the amendment** in the README's ledger section, linking the ticket, saying what
   the rule was and what it now is.

The ledger is a record that the change happened, not a second copy of the rule. A reader
who skips it must still get the current answer from the artifact and the README body.

Both existing packages already do this, and their section names are now the standard:
`docs/machines/README.md` moves items from **Open questions** to **Decided**;
`docs/schema/README.md` keeps **Amendments**. A package uses whichever fits — the
requirement is that one of them exists and that nothing stale is left standing.

## Why not `docs/adr/`

[#50](https://github.com/nopivnick/lineup-prototype-03/issues/50) deleted the ADR
convention `AGENTS.md` used to state, which thirty tickets had never used.

**The tickets are the ADRs.** Each carries context, alternatives, a decision and its
consequences, and each is hard to reverse. A `docs/adr/` directory would be a second copy
of the issue tracker with no single transaction writing both — which is the map's own
[standing principle 1](../machines/README.md) turned on its own documentation.

What the packages add that the tracker cannot is the thing rule 3 describes: an issue
comment is immutable, so an overturned clause stands in the tracker forever beside its
replacement. The README is where the current answer lives; the tracker is where the
reasoning and the history live. The link between them is rule 2.
