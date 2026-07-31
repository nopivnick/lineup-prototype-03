# State machines

The Course and Offering lifecycles. These files are **reference, not application
code** — nothing imports them yet.

They **track the wayfinder map**: when a map ticket decides something about a
lifecycle, the machine is amended and the resolved item moves from *Open questions*
below into *Decided*, linking the ticket that settled it. Never amend a machine
without a closed ticket behind it — the decision lives in the ticket, and a change
with no link is a decision nobody made.

## Standing principles

Rules that came out of specific tickets but bind every later one. Apply them in this
order.

**1. When a guard wants to read relational state, first ask whether that state should
be a *state*.** From [What does Offering machine context hold?](https://github.com/nopivnick/lineup-prototype-03/issues/15).
`hasLead` was never implemented — it was deleted, because `Staffed` encodes the same
fact in the lifecycle and makes `offer` unreachable without a lead. Encoding a fact as
a state removes the question of how a synchronous guard sees the database instead of
answering it, and it makes the fact queryable through the generated `status` column for
free. The cost to weigh against that is a second place that can disagree with the
first, which is only acceptable when one transaction writes both.

**2. Failing that: context holds machine-remembered facts, the event carries
query-derived ones.** From [Which Offering states count as live?](https://github.com/nopivnick/lineup-prototype-03/issues/14).
Context persists inside the snapshot, so a query result cached there is a stale copy
that survives to mislead the next read. `revisingFrom` qualifies because the machine
itself produced it. `liveOfferings` does not, and neither does the instructor roster —
worse, since roster writes fire no event at all.

**3. Never amend a machine without a closed ticket behind it.** The decision lives in
the ticket; a change with no link is a decision nobody made.

## Decided

Settled by closed map tickets. The machines already reflect these.

**`Declined` is recoverable.** [What is an Offering?](https://github.com/nopivnick/lineup-prototype-03/issues/2)
gave `Declined` a `retry` → `Slated`, matching `Canceled`. The old dead-end was a bug:
`decline` is reachable from `Published`, so an instructor withdrawing from a scheduled,
published class would have forced `kill` → `Dead`, discarding the call number, SIS
number, room and schedule. `Declined` keeps `kill` → `Dead`, and stays a distinct state
from `Canceled` — "they said no" and "we pulled it" carry different follow-up. It
remains the only non-final state without `revise`: you re-slate, then revise.

**Position 0 of the instructor roster is the lead.** Same ticket. An Offering owns an
ordered instructor roster, and `offer` / `accept` / `decline` / `defer` speak for the
lead alone. A `Slated` Offering may have an empty roster. `decline` vacates position 0,
with no auto-promotion of position 1 — that would make someone the lead of a class they
never agreed to lead.

That ticket also added a `hasLead` guard on `offer`, and left the vacate-on-decline
action out of the machine pending a context design. Both are now superseded — see
*The roster stays relational, and `hasLead` becomes a state* below.

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

**The roster stays relational, and `hasLead` becomes a state.**
[What does Offering machine context hold?](https://github.com/nopivnick/lineup-prototype-03/issues/15)
closed the context question with **nothing**: context is `{ revisingFrom }` and the
instructor roster is never mirrored into it. Mirroring would persist a copy inside the
`jsonb` snapshot that goes stale from writes the machine cannot see — adding a
co-instructor fires no event — and the only remedy would be to make every roster edit
load, mutate and re-save the snapshot.

The guard that wanted the roster is **gone rather than implemented**. A new state,
`Staffed`, sits between `Slated` and `Offered` and means exactly *position 0 is
occupied*. `offer` is reachable only from `Staffed`, so there is nothing for `hasLead`
to check. `Slated` now means "we are running this class and have not picked who to
ask", which is a state departments genuinely rest in — the term's staffing plan is
assembled before offers go out — and it makes *"which Fall offerings still need an
instructor?"* a `status` filter rather than an anti-join. `Staffed` joins `LIVE_STATES`
and `RevisableState`, adding a `wasStaffed` guard ahead of the `Slated` fallback in the
`approve` cascade.

The cost is two places that can disagree about whether a lead exists, and the mechanism
that prevents it is that **`staff` and `unstaff` are never user-facing events**. One
Server Action writes the `offering_instructor` row and sends the event in the same
transaction, so no code path writes one without the other. They track **occupancy, not
identity**: swapping lead A for lead B inside `Staffed` fires nothing, because the state
stays true.

**Position 0 is editable only in `Slated` (fill) and `Staffed` (swap or vacate).** It is
frozen everywhere else, `Revising` included — a vacate mid-revision would make
`approve` → `Staffed` assert a lead that no longer exists. From `Offered` onward the
only thing that empties it is `decline` — since ticket 19, `decline` or `withdraw` —
because a rewritable position 0 would leave the transition log saying the offer went to
one person while the roster says the class belongs to another. Positions 1..n stay
non-gating and freely editable in any state.

**Vacate-on-decline is a `DELETE` in the Server Action's transaction**, not an XState
action — the roster is relational and the machine cannot write to it. Every `decline`
edge now says so, since the machine previously implied otherwise by omission.

**`Canceled.retry` → `Staffed`; `Declined.retry` → `Slated`.** Both unconditional. A
`Declined` offering provably has no lead, because `decline` vacated position 0 on the
way in. A `Canceled` one provably has one: `Canceled` is reachable only from `Published`
and `Listed`, both downstream of `Offered`, and `decline` — the only thing that vacates
from there — lands in `Declined`. Routing `Canceled` to `Slated` would have asserted a
vacancy that isn't there, which is the `Staffed` divergence showing up on day one. It
deliberately does not land further forward: that lead had accepted, but revivals here
are slow and material, and a state asserting "they said yes" when the yes has gone stale
gets published to the catalog and never caught.

**The transition log gains a nullable `subject_netid`**, populated by `staff`, `unstaff`
and `decline` — and, since ticket 19, `withdraw` — null elsewhere. This **amends ticket
6's column list**. `actor_netid`
records who clicked, which for a decline is routinely an admin taking a refusal by
email — so with the roster row deleted in the same transaction, who said no would
survive nowhere, defeating ticket 2's requirement that it be recordable. The same hole
hit `staff`: the log would say a lead was assigned without saying whom, and since
swapping within `Staffed` fires no transition, the original name would simply be gone.
Rejected alternative: soft-deleting roster rows, which ticket 2 already refused and
which complicates the per-offering uniqueness constraint on `position`.

**The department can withdraw an offer: `Offered --withdraw--> Slated`.**
[Can the department withdraw an offer?](https://github.com/nopivnick/lineup-prototype-03/issues/19)
closed the gap ticket 15 opened by freezing position 0 from `Offered` onward. Pulling an
offer the lead has not refused had no honest move: `decline` writes a refusal that never
happened, `cancel` means the class is not running and is unreachable this early, `revise`
cannot touch position 0, and `kill` discards the offering ticket 2 preserved.

It is a **distinct event, not `unstaff` reaching further**. `unstaff` is deliberately
never user-facing — bookkeeping fired from inside the Server Action, justified by no human
ever choosing it. `withdraw` is chosen by a human and has an external consequence, because
the lead was told. One event for both would make the log read identically for "we tidied a
staffing plan nobody had seen" and "we retracted an offer from someone waiting on an
answer", and the second is the one that needs a paper trail.

**`Offered` is the only source state**, because it is the only one where the act is
provably honest — `accept`, `decline` and `defer` are its sole exits, so no answer has come
back. `Deferred` was the arguable case and was **excluded on a factual correction**: it has
four inbound edges, so it cannot certify that the lead hasn't already agreed, and `withdraw`
there would let a renege wear the name reserved for retracting an unanswered question. That
leaves a real hole — deferred, then the department wants someone else — deliberately left
visible as ticket 21 rather than closed by a move that can mislabel. `Accepted` onward is a
different act, breaking an agreement rather than retracting a question, and is out of scope
until someone shows it happens.

**It lands in `Slated` and vacates position 0** — the same `DELETE` in the same Server
Action transaction as `decline`, not an XState action. `Staffed` was rejected because swaps
inside it fire nothing: the log would show the offer pulled from Danny and then re-sent to
nobody in particular, with the replacement never appearing. `Slated` forces `staff` then
`offer` to fire again, putting every step on the record, and matches ticket 2 on routing
through `Slated` to force the decision rather than skip it. The re-ask-the-same-person case
now costs a redundant `staff`, which is a benefit — it logs an explicit re-assertion rather
than inheriting the pick silently.

**No `Withdrawn` state.** `Declined` exists because a refusal leaves the department stuck
and `retry` forces the decision; a withdrawal is the department *acting*, so it would only
ever pass through such a state on its way to `Slated`. The queryability argument fails too:
"has this offering had an offer pulled?" is a fact about history, and `status` only holds
the present. The transition log is its home. Consequently `LIVE_STATES` and
`RevisableState` are both unchanged — `Slated` is already live, which is right, since a
withdrawn offer means the department still intends to run the class.

`withdraw` joins `subject_netid`, forced by ticket 15's rule: the transaction deletes the
roster row, so without it the withdrawn instructor survives nowhere. `offer` and `accept`
deliberately do **not** carry one — the roster row survives those, and position 0 is frozen
from `Offered` onward, so the roster answers "who is the lead" directly.

Two things were ruled **out of scope** rather than settled, both because they are properties
of the system and not of this event: a free-text **reason** on the log row (`cancel` and
`kill` want it as much; it belongs to the schema ticket) and **notifying the instructor** —
`offer`, `withdraw` and `cancel` all imply an off-system act, the machines model decisions
rather than communication, and the map now says so explicitly.

## Open questions

**What does `Deferred` mean?** It has four inbound edges — `Offered`, `Accepted`,
`Scheduled` and `Published` — so a deferred offering is sometimes "asked, hasn't
answered" and sometimes "said yes, then put it on hold", and the machine cannot tell
which. That ambiguity is what kept `withdraw` off it. Surfaced while resolving ticket 19:
[What does Deferred mean, and can it tell you whether the lead agreed?](https://github.com/nopivnick/lineup-prototype-03/issues/21)

**Which states can be revised, and does revision always need approval?** `revise` is
available from `Evaluating` and `Canceled` — editing an offering whose class already
finished, or one that was abandoned. Post-hoc correction of the record is a real need,
but whether it deserves a full `revise` / `approve` round-trip is not settled. Surfaced
while resolving ticket 14:
[Which states can be revised, and does revision always need approval?](https://github.com/nopivnick/lineup-prototype-03/issues/17)

**Persisted snapshots do not survive machine changes.** `createActor(machine, { snapshot })` validates the persisted structure against the current machine definition,
so a renamed or removed state throws on read rather than degrading. Nothing is
invalidated today — nothing is built — but ticket 6 alone renamed a state and added a
context field, and ticket 15 has since **added** one (`Staffed`) and widened
`RevisableState`. Two tickets, three shape changes; the rate is the argument. Whether
there is a version stamp, a rebuild path, or an explicit deferral is
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
`context: ({ input }) => input` lines are gone. That design is now **closed**: ticket 15
settled Offering context as `{ revisingFrom }` and nothing more.
`course.machine.ts` still carries both scaffolding lines untouched. Nothing has
positively decided that Course context is empty, but nothing needs it either — ticket
14 was the one open claim on it, and routing `liveOfferings` through the event payload
withdrew that claim.
