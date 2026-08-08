# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring
the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the glossary, and nothing else.
- **`docs/README.md`** — the index to the six spec packages, and the build effort's entry
  point.
- **The `README.md` of any `docs/<area>/` package** that touches the area you're about to
  work in. Those READMEs hold the current answer and the log of what overturned what. See
  [spec-packages.md](./spec-packages.md).

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't
suggest creating them upfront. The `/domain-modeling` skill creates `CONTEXT.md` lazily
when terms actually get resolved.

## This repo is single-context

```
/
├── CONTEXT.md                 ← glossary
└── docs/
    ├── README.md              ← index to the packages, entry point for the build effort
    ├── machines/              ┐
    ├── schema/                │
    ├── prototypes/            │ spec packages: artifact + README ledger
    ├── permissions/           │
    ├── data-access/           │
    ├── fixtures/              ┘
    ├── legacy/                ← received, not decided
    └── research/              ← received, not decided
```

## No `docs/adr/`

Ruled out by [#50](https://github.com/nopivnick/lineup-prototype-03/issues/50): **the issue
tracker is the decision log.** Every decision in this repo is a closed GitHub issue
carrying context, alternatives, a decision and its consequences — an ADR directory would be
a second copy of it.

Don't create one, and don't read for one. Where you would look for an ADR, read the
relevant package README instead: it holds the current answer and links the ticket that
settled it.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a
hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms
the glossary explicitly avoids.

This repo has several near-miss words that mean something specific, and `CONTEXT.md`
defines the excluded ones too — **cross-listing** is not seat sharing, **semester** is not
a term, a **capability** is not a qualification, and the transition log is not an audit
log. Getting one of these wrong by defaulting to its ordinary meaning is the failure mode
the glossary exists to prevent.

If the concept you need isn't in the glossary yet, that's a signal — either you're
inventing language the project doesn't use (reconsider) or there's a real gap (note it for
`/domain-modeling`).

## Flag conflicts with a settled decision

If your output contradicts something a package README records as settled, surface it
explicitly rather than silently overriding:

> _Contradicts [#28](https://github.com/nopivnick/lineup-prototype-03/issues/28) (permission
> enforcement lives in the writer, not beside it) — but worth reopening because…_
