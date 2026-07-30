# State machines

The Course and Offering lifecycles, as supplied at the start of the wayfinder map.
These files are **reference, not application code** — nothing imports them yet.

Do not "fix" the observations below in place. Each one is a question for a map
ticket to answer; silently resolving one loses the decision.

## Known gaps

**`remember(...)` is undefined.** `offering.machine.ts` calls it on every `revise`
transition but never defines or imports it. Whatever it writes is the same store the
six `was*` guards read to route `approve` back out of `Revising`. That store has no
home yet — deciding where it lives is the substance of the "how does machine state
persist" ticket.

**`remember("Confirmed")` names a state that doesn't exist.** The `Accepted` state
remembers itself as `"Confirmed"`, and the guard that routes back to it is
`wasConfirmed`. Every other state remembers itself under its own name. Either the
state should be `Confirmed`, or the label and guard should be `Accepted` — the two
vocabularies are currently mixed.

**`noLiveOfferings` has no definition of "live".** It guards `retire` on both
`Approved` and `Revising` Courses. Which of the fourteen Offering states count as
live is undecided — and it's a cross-entity query, so it also depends on how machine
state is persisted.

## Observations about lifecycle shape

These may all be deliberate. They're recorded because they're the kind of thing that
is much cheaper to confirm now than to discover once the schema is built.

- **`Declined` is a near-dead end.** Its only transition is `kill` → `Dead`. An
  offering declined by one instructor cannot be re-offered to another; it must be
  killed and a new offering slated.
- **`Published`, `Listed` and `Running` cannot be revised.** Every other non-final
  state can. Once an offering is published, editing it means cancelling it.
- **`Published` can still be `decline`d or `defer`red** — an instructor backing out
  after the offering is public. `Listed` cannot; it can only be cancelled.
- **`Running` has one exit,** `evaluate`. There's no path for a class that collapses
  mid-term.
- **Course `Approved` cannot return to `Developing`** — only `Revising`.
- **Course has no `propose` event.** `Proposed` is the initial state, so a course is
  proposed by being created rather than by a transition.

## Provenance

Both machines were authored in Stately and pasted in verbatim at map creation. The
`context: ({ input }) => input` line and empty `context: {} as {}` type are Stately
scaffolding, not a considered context design.
