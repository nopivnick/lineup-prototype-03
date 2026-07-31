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

**`noLiveOfferings` is defined, and live ends when teaching ends.**
[Which Offering states count as live?](https://github.com/nopivnick/lineup-prototype-03/issues/14)
settled the guard on `retire`. It prevents a *workflow contradiction* — the department
saying "we no longer offer this" while preparing or running it — not a referential
problem, which never existed since offerings keep their `course_id` regardless. Nine
states are live, everything up to and including `Running`, exported as `LIVE_STATES`
from `offering.machine.ts`. The five excluded are `Declined`, `Canceled`, `Evaluating`,
`Concluded` and `Dead`. `Canceled` had to be excluded or the guard would be satisfiable
only by `kill` → `Dead`, destroying exactly the data ticket 2 preserved; `Evaluating`
because it is a closed backwater that can never re-enter the forward path; `Revising`
is live *unconditionally*, whatever `revisingFrom` holds, because an offering being
edited right now is the in-flight work retirement would contradict.

The guard is **blind to term**. The state set already filters honest history — a
properly run offering ends `Concluded` or `Dead` — so time-blindness only catches rows
that are wrong, and surfacing those beats burying them. It also avoids inventing a
"current term", which the schema cannot express since
[How is a term identified?](https://github.com/nopivnick/lineup-prototype-03/issues/3)
deferred term dates.

The guard **does not query**. `retire` carries `liveOfferings: LiveOffering[]` and the
guard is `length === 0` over it — the same array the UI renders as the disabled
control's reason, so rule and explanation cannot drift. This set the rule for both
machines: **context holds machine-remembered facts, the event carries query-derived
ones.** Course context stays empty as a result.

One consequence the machines cannot express: `retry` from `Declined` or `Canceled`
must be blocked when the Course is `Retired`. It is asserted in the Server Action —
see the comments on those two transitions.

## Open questions

**Context holds `revisingFrom` and nothing else yet.** `hasLead` is still
`return true`, and vacate-on-decline is still absent, because both depend on whether
the instructor roster is mirrored into context — which, now that context persists
inside a `jsonb` snapshot, means duplicating relational rows into a blob:
[What does Offering machine context hold?](https://github.com/nopivnick/lineup-prototype-03/issues/15)
`noLiveOfferings` no longer waits on this — ticket 14 took the event-payload route and
left `hasLead` a precedent to accept or reject.

**Which states can be revised, and does revision always need approval?** `revise` is
available from `Evaluating` and `Canceled` — editing an offering whose class already
finished, or one that was abandoned. Post-hoc correction of the record is a real need,
but whether it deserves a full `revise` / `approve` round-trip is not settled. Surfaced
while resolving ticket 14:
[Which states can be revised, and does revision always need approval?](https://github.com/nopivnick/lineup-prototype-03/issues/17)

**Persisted snapshots do not survive machine changes.** `createActor(machine, { snapshot })` validates the persisted structure against the current machine definition,
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
`course.machine.ts` still carries both scaffolding lines untouched. Nothing has
positively decided that Course context is empty, but nothing needs it either — ticket
14 was the one open claim on it, and routing `liveOfferings` through the event payload
withdrew that claim.
