# State machines

The Course and Offering lifecycles. These files are **reference, not application
code** — nothing imports them yet.

They **track the wayfinder map**: when a map ticket decides something about a
lifecycle, the machine is amended and the resolved item moves from *Open questions*
below into *Decided*, linking the ticket that settled it. Never amend a machine
without a closed ticket behind it — the decision lives in the ticket, and a change
with no link is a decision nobody made.

## Decided

Settled by closed map tickets. The machines already reflect these.

**`Declined` is recoverable.** [What is an Offering?](https://github.com/nopivnick/lineup-prototype-03/issues/2)
gave `Declined` a `retry` → `Slated`, matching `Canceled`. The old dead-end was a bug:
`decline` is reachable from `Published`, so an instructor withdrawing from a scheduled,
published class would have forced `kill` → `Dead`, discarding the call number, SIS
number, room and schedule. `Declined` keeps `kill` → `Dead`, and stays a distinct state
from `Canceled` — "they said no" and "we pulled it" carry different follow-up. It
remains the only non-final state without `revise`: you re-slate, then revise.

**`offer` is guarded on `hasLead`.** Same ticket. An Offering owns an ordered instructor
roster where position 0 is the lead, and `offer` / `accept` / `decline` / `defer` speak
for the lead alone. A `Slated` Offering may have an empty roster, so `offer` has no one
to address until position 0 is filled. `decline` vacates position 0 with no
auto-promotion of position 1.

The vacate-on-decline action is **not** in the machine: what it writes depends on the
context design, which is still open below.

## Open questions

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

Both machines were authored in Stately and pasted in verbatim at map creation, then
amended as tickets landed — see *Decided* above for every change since. The
`context: ({ input }) => input` line and empty `context: {} as {}` type are Stately
scaffolding, not a considered context design.
