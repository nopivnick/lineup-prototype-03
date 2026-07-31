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

**`remember(...)` is now `assign`, and the store is machine context.**
[How does machine state persist?](https://github.com/nopivnick/lineup-prototype-03/issues/6)
made the persisted XState snapshot the source of truth for both machines, which means
context persists for free. The remembered prior state is therefore not a column or a
derived query but an ordinary context field, `revisingFrom`, and the six `was*` guards
string-compare against it. The machine stays **flat** — this was chosen over an XState
history state precisely to keep `snapshot.value` a plain string, because the catalog
list view filters on a `status` column generated from `snapshot->>'value'`, and a
history state would have made `value` sometimes a string and sometimes an object.

**`Confirmed` is gone; the state is `Accepted`.** Same ticket. `accept` → `Accepted`
matches `decline` → `Declined` and `defer` → `Deferred`; `Confirmed` was the sole pair
breaking the rule, and it appears nowhere in the legacy database. The guard is now
`wasAccepted`. This mattered more than cosmetics: `revisingFrom` holds a state-name
literal that a guard compares, so the mismatch would have silently fallen through the
`approve` cascade to the `Slated` default.

## Open questions

**`noLiveOfferings` has no definition of "live".** It guards `retire` on both
`Approved` and `Revising` Courses. The persistence half of this is now discharged —
`offering.status` is a generated, indexed column in the same project as `course`, so
the query is cheap and same-project. What remains is which of the fourteen Offering
states count as live, and whether the question is scoped by term:
[Which Offering states count as live?](https://github.com/nopivnick/lineup-prototype-03/issues/14)

**Context holds `revisingFrom` and nothing else yet.** `hasLead` is still
`return true`, and vacate-on-decline is still absent, because both depend on whether
the instructor roster is mirrored into context — which, now that context persists
inside a `jsonb` snapshot, means duplicating relational rows into a blob. A
synchronous guard cannot query the database, so this also decides how `noLiveOfferings`
gets its answer:
[What does Offering machine context hold?](https://github.com/nopivnick/lineup-prototype-03/issues/15)

**Persisted snapshots do not survive machine changes.** `createActor(machine, {
snapshot })` validates the persisted structure against the current machine definition,
so a renamed or removed state throws on read rather than degrading. Nothing is
invalidated today — nothing is built — but this ticket alone renamed a state and added
a context field. Whether there is a version stamp, a rebuild path, or an explicit
deferral is
[What happens to persisted snapshots when the machine changes?](https://github.com/nopivnick/lineup-prototype-03/issues/13)

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
amended as tickets landed — see *Decided* above for every change since.

The Stately scaffolding is now partly replaced. `offering.machine.ts` has a real
`OfferingContext` type and a real initial context, so its `context: {} as {}` and
`context: ({ input }) => input` lines are gone — though only `revisingFrom` is a
considered field, and the rest of that design is open above.
`course.machine.ts` still carries both scaffolding lines untouched: nothing has yet
decided whether Course context holds anything at all.
