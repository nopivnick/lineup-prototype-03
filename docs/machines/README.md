# State machines

The Course-proposal-review, Course and Offering lifecycles. These files are **reference,
not application code** — nothing imports them yet.

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

**3. A state certifies only what all of its inbound edges agree on.** From
[What does Deferred mean, and can it tell you whether the lead agreed?](https://github.com/nopivnick/lineup-prototype-03/issues/21).
Before reaching for a guard that asks *how did this offering get here?*, count the
inbound edges — if they disagree about the fact you need, the state cannot supply it and
no predicate over the transition log should be asked to, since principle 2 keeps
query-derived history out of the machine. `Deferred` had four inbound edges and so could
certify nothing, which is what blocked `withdraw` in ticket 19. The fix was to **delete
the edges that disagreed**, not to split the state or to add a guard: three of the four
turned out to encode an act the domain does not have. Splitting is the fallback when
every inbound edge is genuinely needed; deleting is better when they are not, because it
leaves one state whose name means one thing.

**4. A gate with one exit is not a gate.** From
[Which states can be revised, and does revision always need approval?](https://github.com/nopivnick/lineup-prototype-03/issues/17).
Before trusting a state that models review, approval or sign-off, count its exits. A
review you can only leave by approving is not a review — there is no outcome it can
record that its absence would not. Offering `Revising` had exactly one, `approve`: no
reject, no abandon, no `kill`. Course's real approval has the opposite shape, with
`Rejected` reachable from both states that approve into `Approved`.

Provenance is the tell, and it generalises past this pair: **these two machines were
split out of a single one**, so an event appearing in both may be one act duplicated
rather than two acts that agree. Ask what the child's copy refers to. Offering's
`approve` was the *curriculum* approval and referred to nothing once separated — it was
the only `approve` in that machine, and nothing else in it is an approval.

**5. A column whose nullability is decided by lifecycle position is usually two
entities sharing one table.** From
[How are ITP, IMA and LowRes modelled?](https://github.com/nopivnick/lineup-prototype-03/issues/7).
`program_code` was null in exactly `Proposed`, `Developing` and `Rejected`, and non-null
in exactly `Approved`, `Revising` and `Retired` — a clean partition of the state set by a
single column's nullability. That is the shape of two lifecycles wearing one name, and the
seam is the transition the partition falls across. The confirming test is whether a
terminal state can be reached twice with different answers: `reject` is final, yet one
proposal can be rejected by ITP while IMA approves it, which no single row can hold. When
a column and a state set disagree about how many things there are, the state set is
usually wrong.

**Its boundary, from
[Where are a course's area and area head assigned?](https://github.com/nopivnick/lineup-prototype-03/issues/32):
impossible-before and guaranteed-after is a seam; merely *incomplete* early is a
completeness rule.** `area_head` looked like this shape — null while `Proposed`, filled by
`Approved` — and is its opposite, because a director may assign it before approval, at
approval, or after. The early states *can* hold a value and the late ones *can* lack one,
so there is no partition at either end. The test is not "is it usually null early" but
"can it be non-null early at all". A seam finds a second entity; a completeness rule finds
a gate, and the gate belongs wherever the thing it protects happens — for that column, the
Offering create path, not `approve`.

**6. When a role is scoped by a relationship, the writer of the relationship refuses a
subject who does not hold the role.** From
[Who writes `user_role`?](https://github.com/nopivnick/lineup-prototype-03/issues/34).
[#4](https://github.com/nopivnick/lineup-prototype-03/issues/4) made every permission a
conjunction of a role and a relationship, which means a relationship row naming someone
without the role is **inert** — it looks like an assignment, confers nothing, and reports
nothing. That is a *silent under-grant*, the one combination
[#8](https://github.com/nopivnick/lineup-prototype-03/issues/8)'s axis has no comfort for,
and it is discovered when the person clicks and nothing happens.
[#32](https://github.com/nopivnick/lineup-prototype-03/issues/32) ruled it for
`course.area_head` by analogy to `instructor` plus roster position 0 — and the analogy had
the check the model lacked, so `staff` could write a roster row for a netid who then could
not `accept` their own offer. Ticket 34 closed that and generalised. It binds exactly three
pairs, which is what makes it a complete rule rather than an open-ended one:
`instructor`/`offering_instructor` (**every** roster row, not just position 0 — position is
scope for *events*, the role is the qualification to teach),
`area_head`/`course.area_head`, and `program_director`/`program_director(program_code,
netid)`. It does not reach `student` or `advisor`, which have no relationship to write.

**Its boundary: the check names no actor, so it is an *invariant*, not a permission.** By
[#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)'s test that is what
decides placement — and it is why the `chair` added by ticket 34, who bypasses permissions
entirely, still cannot be staffed on an offering without holding `instructor`. The bypass
covers what a person may **do**; this rule constrains what may be **done to** them, and no
amount of authority reaches the subject side. Read backwards it also governs revocation: a
role may not be revoked while a live relationship depends on it, or the same inert pair is
reached through the other door.

**7. Never amend a machine without a closed ticket behind it.** The decision lives in
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
`approve` → `Staffed` assert a lead that no longer exists. From `Offered` onward,
both `decline` and `withdraw` empty it, because a rewritable position 0 would leave
the transition log saying the offer went to
one person while the roster says the class belongs to another. Positions 1..n stay
non-gating and freely editable in any state.

**Vacate-on-decline is a `DELETE` in the Server Action's transaction**, not an XState
action — the roster is relational and the machine cannot write to it. Every `decline`
edge now says so, since the machine previously implied otherwise by omission.

**`Canceled.retry` → `Staffed`; `Declined.retry` → `Slated`.** Both unconditional. A
`Declined` offering provably has no lead, because `decline` vacated position 0 on the
way in. A `Canceled` one provably has one: **every path into `Canceled` runs through
`accept`, and nothing downstream of `accept` vacates position 0 except `decline` and
`withdraw`, both of which leave the forward path.** Routing `Canceled` to `Slated` would
have asserted a vacancy that isn't there, which is the `Staffed` divergence showing up on
day one. It
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

**`Offered` was the only source state**, because it was the only one where the act is
provably honest — `accept`, `decline` and `defer` are its sole exits, so no answer has come
back. `Deferred` was the arguable case and was **excluded on a factual correction**: it had
four inbound edges, so it could not certify that the lead hadn't already agreed, and
`withdraw` there would let a renege wear the name reserved for retracting an unanswered
question. That left a real hole — deferred, then the department wants someone else —
deliberately visible as ticket 21 rather than closed by a move that can mislabel.
**Ticket 21 has since closed it** by removing the three inbound edges that caused the
ambiguity, so `withdraw` now leaves `Deferred` too — see *`Deferred` means asked and
unanswered* below. `Accepted` onward remains a different act, breaking an agreement rather
than retracting a question, and is still out of scope until someone shows it happens.

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

**`Deferred` means asked and unanswered, and `defer` is the lead's third answer.**
[What does Deferred mean, and can it tell you whether the lead agreed?](https://github.com/nopivnick/lineup-prototype-03/issues/21)
settled `defer` as the **lead's** act — "ask me later", alongside `accept` and `decline`,
speaking for position 0 like the other three. It is not the department putting an
offering on hold; that reading was considered and rejected, and the giveaway was that
`defer` and `decline` shared an identical four-state inbound edge set, which is what a
sibling response looks like rather than a departmental hold.

**`defer` now leaves `Offered` and nowhere else.** The edges from `Accepted`, `Scheduled`
and `Published` are deleted. "Ask me later" is meaningless once the question has been
answered, and the ACT-UAW Local 7902 contract (2022–2028) — which covers ITP/IMA
adjuncts, Tisch not being among its excluded schools — recognises **no adjunct-side pause
after acceptance**. Nothing in its 98 pages mentions deferring, holding, or a tentative
or contingent appointment; the vocabulary is strictly accept-or-decline. After acceptance
it recognises exactly two moves, and a `Deferred` limbo obscures which one occurred while
money turns on the difference:

- the university **cancels**, owing cancellation pay (Art. IV(C)) — 20% of course
  compensation if cancelled 14 or fewer days before the first class, 20% plus a
  proportional amount for contact hours taught if after classes begin;
- the adjunct **declines**, which is counted — three consecutive declined offers cost
  them the good-faith reappointment consideration of Art. VI(B).

That second point sharpens ticket 19's don't-log-a-lie principle into something with
teeth: recording a `decline` that did not happen moves a real person toward losing a
contractual right. It is why folding the post-acceptance `defer` into `decline` was
rejected outright.

**`Deferred` survives as a state, with one inbound edge**, and is therefore able to
certify what `withdraw` needs. It was **not split**: `LIVE_STATES` and `RevisableState`
are unchanged, one entry each, and `wasDeferred` stays — ticket 14's ruling stands
untouched. It survives rather than collapsing into `Offered` (as a logged self-transition)
because a deferred offering **rests** here, and parked-ness is present-tense, which is
what a `status` column holds. That is the disanalogy with the `Withdrawn` state ticket 19
rejected, which an offering would only ever pass through. The distinction it buys is
operational: *who hasn't replied at all?* wants a chase, *who asked for time?* wants a
wait.

**`Deferred --withdraw--> Slated`**, closing the hole ticket 19 left visible. Identical to
`Offered.withdraw` in every respect — lands in `Slated`, vacates position 0 by the same
`DELETE` in the Server Action's transaction, carries `subject_netid`.

**`cancel` is available exactly downstream of `accept`** — `Accepted`, `Scheduled`,
`Published`, `Listed`, `Running`. The first two and the last are new. This boundary is
drawn by the contract rather than invented: Art. IV(C) attaches the cancellation-pay
obligation to "a course that an adjunct **has accepted** to teach", and to nothing
earlier. Before acceptance `Canceled` would have nothing to preserve — it exists to keep
the call number, SIS number, room and schedule, and a `Slated` or `Staffed` offering has
none of them; `withdraw` and `kill` cover that end. `Running` is included because
Art. IV(C)(2) prices cancellation "after the first day of class begins", so a class
collapsing mid-term is a case the university has already agreed can happen.

**The machine does not branch on union membership.** Not every lead is in the bargaining
unit — full-time faculty are explicitly excluded, and the unit covers adjuncts at 40+
contact hours per academic year — so offerings will hold leads of both kinds. But the
contract gives unionized leads *money and counting rules*, not *fewer moves*: the
lifecycle shape is identical either way, and the obligations attach outside the machine.
No guard reads employment class.

**Ticket 15's `Canceled.retry` proof was restated as an invariant**, not amended. Its
enumerated form had been reworded twice already — ticket 15 wrote it, ticket 19 reworded
it, and this ticket adds three more `cancel` sources — so it is now phrased so that new
source states cannot invalidate it. The claim is unchanged and still holds.

**Offering `revise` and `approve` are deleted, and so is `Revising`.**
[Which states can be revised, and does revision always need approval?](https://github.com/nopivnick/lineup-prototype-03/issues/17)
was opened to ask whether `revise` should leave `Evaluating` and `Canceled`. It leaves
those two and the other six as well, taking the `Revising` state, `revisingFrom`,
`RevisableState` and all eight `was*` guards with it. `OfferingState` goes 15 → 14,
`LIVE_STATES` 10 → 9, and `OfferingContext` is now genuinely empty.

**The reframe that decided it: these two machines were split out of one.** That is the
provenance, and it explains every anomaly the ticket was circling. `revise` on the
Offering is a real act — ticket 2's "a co-instructor's refusal is handled out-of-band by
revising the Offering" is unmistakably an edit to that offering's roster. `approve` is
not. In the combined machine it was the **curriculum** approval; split into two, the
Offering kept a copy referring to nothing. It was the only `approve` in that machine and
nothing else in it is an approval, whereas Course's invalidates a specific prior one.

So there are **two acts on two artifacts, and only one is a transition.** Revising the
Course re-opens the approval `Approved` asserts and needs a fresh `approve`. Revising an
Offering asserts nothing that needs re-approving, so it is an ordinary field write gated
by the permission matrix. A user who notices the course is wrong while looking at an
offering fires `revise` on the **Course** machine from that screen; the Offering does not
move. The opposite arrow — Course `revise` parking its Offerings — remains rejected, by
ticket 14, on a different argument; this ticket ruled on Offering → Course, which ticket
14 never considered.

Three further reasons, beyond the missing referent: the forward path **already carries
the departmental sign-offs**, since `schedule` and `publish` are where an offering's
details get checked; "this edit needs permission" is a permission fact and not a
lifecycle one, so putting it in the machine puts it in the one place a client cannot be
trusted to enforce it; and `Revising` had **exactly one exit** — see standing principle 4,
which came out of this.

**Post-hoc correction is not a lifecycle transition.** Correcting a finished or abandoned
offering — wrong room, wrong instructor credited, a call number keyed in wrong — is a
real need and the one the ticket opened with. Nothing about the offering's progress
changes, so it is an edit. `Canceled` was the worse of the two: `Revising` was
unconditionally live, so revising a canceled offering resurrected it into liveness and
blocked its Course from being retired — exactly what excluding `Canceled` from
`LIVE_STATES` was meant to prevent.

**Nothing freezes while a Course is `Revising`.** No cross-entity invariant, unlike
`retry` against a `Retired` course. `revise` leaves `Approved` and returns to it, so a
course in `Revising` is an *approved* course being edited and there is never an approval
missing for an offering to wait on. Keying an invariant on a transient state would also
freeze a whole term's offerings over a typo, and the obvious worry — a catalog showing a
half-edited description — is a read concern that freezing publication does not fix.

**What this does not disturb.** Ticket 15's position-0 rule survives verbatim: "editable
only in `Slated` and `Staffed`, frozen everywhere else" loses a clause from *everywhere
else* rather than a case. Tickets 2, 14 and 21 stand. No state is stranded — every
non-final state keeps an exit, `Evaluating`'s becoming `conclude` alone and `Canceled`'s
`retry` and `kill`, as the ticket predicted.

**It amends ticket 15 and cleans up ticket 14.** Offering context is still empty, now for
a second independent reason rather than one. And `Revising` leaves `LIVE_STATES`
altogether, so ticket 14's "live *unconditionally*, whatever `revisingFrom` holds" — which
it named as a compromise adopted partly to avoid reading context back out of the snapshot
— disappears rather than becoming exact. Every state left in the set is live for a reason
about that state alone.

**Ruled out of scope: a general audit trail.** Deleting the transition means an ordinary
field write now leaves no trace, where `revise` at least logged *someone changed this*.
That is sharpest for the post-hoc correction case — quietly editing history is the edit
you would most want attributable. It is a property of the schema rather than of this
decision, since it applies equally to a `Slated` offering's meeting pattern, so it is
recorded as a constraint on
[The curated Postgres schema for both projects](https://github.com/nopivnick/lineup-prototype-03/issues/10):
**the transition log is not a general audit log.** Same shape as the free-text `reason`
question ticket 19 parked there.

**The Course machine splits at `approve`, and `Proposed` / `Developing` / `Rejected`
leave it.** [How are ITP, IMA and LowRes modelled?](https://github.com/nopivnick/lineup-prototype-03/issues/7)
established that program is *requested* at proposal and *assigned* at approval, that each
requested program reviews the proposal **independently**, and that those reviews can
disagree and land at different times. A single Course row cannot represent that: `Rejected`
is final, and one proposal can be rejected by ITP while IMA approves it.

So there are two lifecycles, and the front half was never about a course:

- **`course-proposal-review.machine.ts`** — one actor per `(proposal, program)` pair,
  holding `Proposed` / `Developing` / `Rejected` and a now-final `Approved`. The proposal
  *body* is shared and edited once; only the verdicts are per-program.
- **`course.machine.ts`** — `Approved` (now the initial state) / `Revising` / `Retired`,
  structurally unchanged otherwise, `noLiveOfferings` intact.

**`approve` is the seam and mints a row.** The Server Action moves the review to `Approved`
and creates a `course` in that program's catalog in the same transaction — the `staff`
pattern from ticket 15. The minted course **copies** the proposal's body rather than
referencing it, because variants in different programs are meant to diverge; legacy agrees,
`course_x_attributes` carrying a per-row `title` and `course_num`.

**The proposal itself has no state.** All state lives in its reviews; "fully rejected" and
"still pending somewhere" are queries. A proposal-level machine was rejected on
reversibility rather than taste: adding one later is additive and invalidates no persisted
snapshot, while removing one later is the throwing case below.

**This amends ticket 4's stated reason, not its rule.** Course approval was ruled flat
across all program directors because a course can be approved before it has a program. That
holds for the *review's* `approve` — the proposal genuinely has no assigned program — and
does **not** hold for the Course machine's surviving `approve`, which re-approves a course
that already sits in a catalog. That one is program-scoped, and it belongs to
[Role x transition permission matrix](https://github.com/nopivnick/lineup-prototype-03/issues/8).

**Changing a machine invalidates persisted snapshots, and the recovery is to reseed.**
[What happens to persisted snapshots when the machine changes?](https://github.com/nopivnick/lineup-prototype-03/issues/13)
settled what the six shape changes above cost. **Nothing here changes any lifecycle** —
this is the only *Decided* entry that amends no machine — but it constrains what a
machine change costs from here on, so read it before making one.

**Only the state set matters.** XState validates the persisted snapshot's `value` against
the machine's state nodes and nothing else, so the four kinds of change this map has made
are not equally dangerous:

- **Removing or renaming an occupied state throws**, loudly, on read. Ticket 6's
  `Confirmed` → `Accepted` and ticket 17's deletion of `Revising`.
- **Adding a state, adding or deleting transitions, changing guards — all survive.**
  Ticket 15's `Staffed` and ticket 21 (three edges deleted, four added, state set
  untouched) would both have been harmless.
- **Removing a context field survives *silently*.** Ticket 17 emptied `OfferingContext`,
  but a persisted `{ revisingFrom: "Slated" }` restores without complaint — XState never
  validates context, so the dead key just sits there. **The only case that does not
  announce itself**, and currently vacuous: all three machines are
  `Record<string, never>`, and standing principles 1 and 2 both push facts *out* of
  context, toward states and event payloads.
- **Ticket 7's split is a different problem wearing the same clothes.** A `Proposed`
  Course snapshot is not merely invalid against `course.machine.ts`; the row is the wrong
  entity in the wrong table. No rehydration strategy addresses that.

So the ticket's own framing — does the answer need to distinguish edge changes from state
changes — resolves to *yes, and only the state set needs covering.*

**Reseed, with no version stamp.** Fixtures are regenerable by construction, so nothing is
lost. Ticket 6's generated `status` column already makes `SELECT DISTINCT status` an exact
enumeration of occupied states — *derived*, so it cannot be forgotten, where a
`machine_version` column is *declared*, and an unbumped stamp reports health it never
checked. **Rebuild-from-log was rejected on a fact worth remembering**: a row stuck in
`Revising` has a log whose last `to_state` is the *string* `'Revising'`, so replaying it
reconstructs the identical invalid snapshot. The log rebuilds history, not validity.

**The database now holds a second copy of the state set, and a test keeps it honest.**
Ticket 6's `CHECK` on `status` is that copy, which standing principle 1 permits only when
one transaction writes both — and here it is this file and a hand-written migration,
authored sessions apart. The build asserts the CHECK's value set `==` the machine's
exported state union. The **test** is the alarm, the **migration** is the gate (an `ALTER`
dropping an occupied value refuses to run), **reseed** is the fix. It is a forward guard,
not a reconciliation: there is no database during this map, so the six changes so far
leave no debt.

**What this means for amending a machine here.** Adding states and rewiring edges stays
free. Removing or renaming a state is the expensive move, and after the build exists it
costs a migration that will fail until the data is reseeded — so it is worth spending the
extra thought at the point of deletion rather than at the point of deploy. Ticket 17's
deletion of `Revising` is the worked example.

**Consequences that land outside the machines.** No genesis transition row: `from_state`
is `NOT NULL`, and creation is recorded as `created_at` / `created_by netid` on the entity
row — consistent with *the review has no `propose` event* below, creation being an act but
not a transition. `from_state` and `to_state` are CHECK-constrained against ticket 6's
`status` value list; `event` deliberately is not, staying exactly the event union as a
TypeScript fact. And transitions commit through a plain
`applyTransition(tx, entity, event, actor)` with the Server Action as a thin auth wrapper,
because the seed script is a second caller — it **drives fixtures through the machine**
rather than inserting them at rest, so snapshots are valid by construction instead of
hand-authored XState internals, and the transition log ships populated.

**Who may fire each transition is settled, and no machine changed.**
[Role x transition permission matrix](https://github.com/nopivnick/lineup-prototype-03/issues/8)
produced the full matrix for all three machines plus field writes. **Nothing here amends a
lifecycle** — like ticket 13, it constrains what the machines mean without changing what
they are — but three of its findings bear directly on these files.

**A sixth role, `coordinator`.** The Offering's forward path — `schedule`, `publish`,
`list`, `run`, `evaluate`, `conclude` — is departmental bookkeeping, and none of ticket 4's
five roles is that person. It cannot be automated either: ticket 3 deferred term dates, so
nothing can compute when a class starts and fire `run`. The line between `coordinator`
(flat, department-wide) and `program_director` (scoped by `offering.program_code`) is
**decision versus execution**. The coordinator executes and asks — the six forward-path
events plus `offer`, since ticket 15 already recorded the *pick* as the position-0 roster
write and `offer` is only the asking. The director reserves creation, the position-0 write,
`withdraw`, `cancel`, `retry` and `kill`.

**`accept` / `decline` / `defer` are not the lead's alone**, and ticket 15 had already
established why: the log carries `subject_netid` because `actor_netid` "records who
clicked, which for a decline is routinely an admin taking a refusal by email." All three
are available to the lead, a `coordinator`, or the offering's director. This costs **no
schema change** — ticket 19 ruled that `offer` and `accept` need no `subject_netid` because
the roster row survives them, and `defer` leaves it intact too.

**Offering edits are gated by field class, not by lifecycle state**, and Course edits are
gated by state. The rule behind the asymmetry: *a field write is state-gated exactly where
a state asserts something about that field's content.* `Approved` asserts the course body
was approved, so title, description, credits and number are editable only in `Revising`. No
Offering state asserts anything about a room, so room, call number, SIS number and meeting
pattern are editable by a coordinator or the offering's director in **any** state,
`Concluded` included. What is frozen instead is the structural set — `course_id`,
`term_code`, `program_code` — immutable for everyone, `kill` and recreate.

That kills the *published-means-cancel* observation above. It was an artifact of where
`revise` happened to be wired rather than a stated policy, and a freeze at `Published`
forbids the exact case ticket 17 opened with — post-hoc correction of a finished offering
— forcing a `Canceled` row for a typo.

**The Course `Revising` one-exit observation is deliberately left open.** An instructor
route on `revise` was weighed and would have made it a real gate at the permission level
without touching the machine — instructor proposes, governance signs off. It was declined
on reversibility: under-grants are loud and over-grants are silent, and the governance-only
rule is a strict subset that is free to widen later. So the observation stays parked rather
than being answered sideways through permissions.

**Permission enforcement lives in one TypeScript module, inside the writer.**
[Where does permission enforcement physically live?](https://github.com/nopivnick/lineup-prototype-03/issues/28)
settled where ticket 8's matrix runs. **No lifecycle changed**, but the Offering machine
gains a second exported state set and three of its findings bear on these files.

**`COMMITTED_STATES` — the states a `student` or `advisor` may see.** The rule is *an
instructor agreed to teach this, or did once*: `Accepted`, `Scheduled`, `Published`,
`Listed`, `Running`, `Evaluating`, `Concluded`, `Canceled`. The six excluded are the
department's staffing process. It sits beside `LIVE_STATES` for the same reason ticket 14
gave — an arguable policy costs a one-line edit rather than a table rewrite.

It is drawn at `accept` because that boundary is **certifiable** and the obvious one is
not. *Students see what has been published* is inexpressible under standing principle 3:
ticket 21 gave `Canceled` five inbound edges, two of them pre-publication, so a `Canceled`
offering cannot say whether it was ever published. `cancel` being available exactly
downstream of `accept` is what makes this set provable instead.

**Permissions and invariants are different things, and the test is whether the rule names
an actor.** A permission is ticket 4's conjunction of a role and a relationship. An
invariant holds regardless of who acts — a director cannot do it either. The test decides
placement, because **the database has no actor**: with RLS ruled out, Postgres cannot see
who is acting, so exactly the actorless rules are eligible for the schema.

Three rules in these machines that read as permissions are invariants: position 0 writable
only in `Slated` / `Staffed`, the course body only while `Revising`, the proposal body only
while a review is `Developing`. Ticket 8's own rule — *a field write is state-gated exactly
where a state asserts something about that field's content* — is a statement about states
with no actor in it. Those writes carry two predicates, ANDed: a state predicate binding
everyone including the seed script, and a role predicate binding the actor.

The two cross-entity invariants these files already carry stay **out** of the database.
`retry` against a `Retired` Course needs a cross-table read, so only a trigger could hold
it — rejected by tickets 13 and 30 on *where would a reader find it* — and it is a
transition rule, so it belongs where a reader looks for transition rules, inside
`applyTransition`. `staff` / `unstaff` never being user-facing is **non-exposure rather
than a check**: ticket 15's *divergence has no code path* is made structural by the action
layer exposing a narrower event union than `applyTransition` accepts.

**Two amendments land on the machines' surroundings.** The check moves **inside**
`applyTransition`, so ticket 13's "thin auth wrapper" becomes an actor-resolution wrapper
and **the seed script is checked like anyone else** — an exempt seed is the one caller able
to write a log row saying a `student` cancelled a class, which is the lie tickets 19 and 21
spent their length preventing. And **the machine is no longer imported client-side**:
ticket 17 deleted every Offering guard, so `.can()` client-side is bare edge existence,
while the invariants and permissions that decide whether a control is live are both
server-side. The server ships a per-row permitted-action set instead — ticket 14's shape,
so rule and explanation cannot drift. That amends ticket 6.

**The `approve` seam also copies the area assignment, and principle 1 was asked and
refused.** [Where are a course's area and area head assigned?](https://github.com/nopivnick/lineup-prototype-03/issues/32)
settled that a program director assigns a course's areas and its area head at **no fixed
point** — sometimes before approval, sometimes as part of it, sometimes after — but that a
course must not become an Offering without both. **Only one comment changed**, on the
review's `approve`, and the rest of this entry records what was checked and found not to
apply.

**The assignment lives on the review before `approve` and on the course after**, because
[#25](https://github.com/nopivnick/lineup-prototype-03/issues/25) made `area`
program-scoped and a shared proposal body cannot hold a program-scoped value. `approve`
copies it forward alongside the body — same reason, and three approving programs mint
three courses that may sit in three different areas under three different heads. Nullable
on both sides, and **no guard on this transition checks it**.

**Standing principle 1 was asked and refused on a structural obstruction.** A Course
`Ready` state meaning *area and head assigned* is the exact analogue of
[#15](https://github.com/nopivnick/lineup-prototype-03/issues/15)'s `Staffed`, and would
make offering creation unreachable without them while turning *"which approved courses
cannot be offered yet?"* into a `status` filter. It cannot be built. Course is
`Approved ⇄ Revising`, so a second post-approval state forces `Revising --approve--> ?` to
remember which to return to — that memory is `revisingFrom`, which
[#17](https://github.com/nopivnick/lineup-prototype-03/issues/17) deleted, in machines
whose empty context [#13](https://github.com/nopivnick/lineup-prototype-03/issues/13) then
made load-bearing. Orthogonal parallel states are the only escape and
[#6](https://github.com/nopivnick/lineup-prototype-03/issues/6) forbade them, having fixed
all three machines flat so `snapshot.value` stays a plain string.

Worth carrying, since principle 1 will be asked again: **the cost of a new state is not
local.** `Staffed` was cheap because `Slated → Staffed → Offered` is a chain with one
forward path. A state added *beside* one that a revision cycle returns to is expensive,
because the return needs memory this map has spent two tickets removing.

**The gate is the Offering create path, which no machine can hold.** Creation is an act and
not a transition ([#13](https://github.com/nopivnick/lineup-prototype-03/issues/13)), so
the rule is asserted in the single writer
[#30](https://github.com/nopivnick/lineup-prototype-03/issues/30) already established —
which loads the course row to derive `program_code`, so the check reads a row it has in
hand. It is the third actorless invariant to land in a writer rather than the schema, and
the first that is intra-database and still stays out of it. The assignment is **monotone** —
areas and heads may be swapped but never emptied, non-exposure in
[#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)'s `staff`/`unstaff`
sense — which is what makes a create-time check sufficient forever.

**The review's `approve` / `reject` / `develop` gain an area-head route.**
[#28](https://github.com/nopivnick/lineup-prototype-03/issues/28) found
[#8](https://github.com/nopivnick/lineup-prototype-03/issues/8) self-contradictory — its
prose dropped the area-head route from the review *for want of a subject*, its table kept
it. The subject now exists whenever a director assigned early, so the **table was right**:
the route is *director of that review's program* **or** `review.area_head`. Ticket 8's
finding that the review *is* a program by construction is untouched, so the director route
stays program-scoped. The route is contingent rather than arbitrary — a review with no
assigned head has nobody holding it, exactly as a course with no area head has nobody
holding the Course `revise` route, which is
[#4](https://github.com/nopivnick/lineup-prototype-03/issues/4)'s conjunction model working
as designed.

**No other machine is amended** — checked explicitly. `course.machine.ts` and
`offering.machine.ts` are untouched: this is a field with a gate outside every lifecycle,
and its write is **state-blind on the Course** by ticket 8's own rule, since `Approved`
asserts the body was approved and asserts nothing about an area proposers never requested.
That makes it the first state-blind Course field, and it shows ticket 8's cut was by field
class both times rather than by artifact.

**A seventh role, `chair`, writes `user_role` — and bypasses permissions only.**
[Who writes `user_role`?](https://github.com/nopivnick/lineup-prototype-03/issues/34) gave
the map's last unauthored table an author. Neither legacy database has a role table, a
director table or any authorization table at all — `itpdir.auth` is `(netid, token,
updated_at)`, authentication only — so `user_role` and `program_director` are both
[#4](https://github.com/nopivnick/lineup-prototype-03/issues/4) inventions with no
precedent to carry forward. The chair is department-wide and flat, writes any `user_role`
row and any `program_director` row, and is the **sole** writer of both; the bypass is one
OR-clause ahead of the matrix rather than a seventh column, so events added later are
covered by construction.

**What the bypass does not reach.** [#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)
made a write `machine-legality AND invariants AND permissions`, and "the chair can do
anything the other roles can do" is a statement about the third term only. So the chair
cannot fire an event the machine does not offer, cannot violate an invariant — including
[#32](https://github.com/nopivnick/lineup-prototype-03/issues/32)'s area-and-head gate on
offering creation and standing principle 6 — and **cannot write the immutable field
class**, because ticket 8's *"nobody — immutable"* on `course_id` / `term_code` /
`program_code` was reclassified by ticket 28 as an invariant on the test that it names no
actor. Ticket 30's whole argument therefore survives a superuser untouched, and it survives
because of where that rule was filed. Ticket 28's actor-naming test, which read as a
placement rule about databases, is what makes a superuser safe to add.

**`user_role` holds capabilities and qualifications, and the chair subsumes only the
first.** Capabilities are flat and actor-side: `coordinator`, and nothing else.
Qualifications are subject-side and gate whether a relationship row may name you —
`instructor`, `area_head`, `program_director`, and `advisor` once its table exists. This
retro-explains ticket 8's two empty rows: `student` and `advisor` hold nothing in the
matrix not because they were overlooked but because a qualification's entire content sits
on the subject side, and theirs are registration (out of scope) and the advisee link
(deliberately absent). The rows are **complete rather than incomplete**, which is what
ticket 28 needed when it landed Tier 2's boundary on them. One literal consequence: the
chair grants themselves `instructor` before teaching a class — not ceremony, since the
chair may already act, but the grant is what makes the roster and the role table say the
same thing.

**Appointing a director is two writes, and revocation refuses while a live dependency
exists.** The `program_director` role plus the `(program_code, netid)` row, both the
chair's, the second refusing a netid without the first under principle 6. A program
director may not appoint a co-director, rejected on circularity — an appointment power
that reproduces itself makes the chair's monopoly decorative. Revoke is a `DELETE`, refused
while the netid holds a roster row on an offering in `LIVE_STATES`, heads a non-`Retired`
course, or holds any `program_director` row; history never blocks, which is why the
predicate is over live dependencies rather than all of them. Cascade was rejected on ticket
32 — it made the area-head assignment monotone precisely so its create-time gate is
sufficient forever, and a cascade is the thing that violates it later. The writer also
refuses to remove the last `chair`, or the system has no one who may grant anything.

**The bootstrap is one seeded row.** Every route that writes `user_role` requires the
`chair` role, so the first row cannot be written from inside — a fixed point, not a
deferral. Ticket 28 made the seed *checked like anyone else*, so the seed inserts exactly
one `chair` row unchecked — the **genesis grant** — and every later role write in the seed
goes through the checked writer acting as that chair.

**No machine is amended, and one comment is.** Granting a role is not a lifecycle
transition; ticket 13 already established that creation is an act and not a transition, and
this is the same shape. `course.machine.ts` and `course-proposal-review.machine.ts` are
untouched, checked explicitly. `offering.machine.ts` gains one comment on `Staffed`,
recording that the roster writer refuses a netid lacking `instructor`.

## Open questions

None open. Every question raised of these machines has been settled by a closed ticket —
see *Decided* above. The *Observations* below are unresolved but unticketed.

## Observations about lifecycle shape

These may all be deliberate. They're recorded because they're the kind of thing that
is much cheaper to confirm now than to discover once the schema is built.

- **Course `Revising` has one exit too** — `approve`, plus `retire`. Standing principle 4
  came out of the Offering's identical shape, and it is worth asking here whether a course
  revision can be rejected or abandoned. It is *not* the same finding: Course `revise` has
  a referent, and `Rejected` is reachable from both states that approve into `Approved`,
  so the machine can express rejection and simply does not on this edge. Recorded rather
  than resolved, because ticket 17 ruled only on the Offering.
- **`Published` can still be `decline`d** — an instructor backing out after the offering
  is public. It could once be `defer`red too; ticket 21 removed that. `Listed` can only
  be cancelled. The related observation that `Published`, `Listed` and `Running` were the
  only non-final states that could not be `revise`d is gone: ticket 17 deleted `revise`,
  so no state can. The trailing half of this observation — whether
  "once an offering is published, editing it means cancelling it" survives as a
  permission rule — is **resolved**: it does not. See *Offering edits are gated by field
  class, not by lifecycle state* under *Decided*.
- **Course `Approved` cannot return to `Developing`.** Sharpened by ticket 7 rather than
  resolved: `Developing` is no longer in the same machine, so the return is not merely
  absent but inexpressible. A course needing that much rework would be a fresh proposal.
- **The review has no `propose` event.** `Proposed` is the initial state, so a review is
  opened by being created rather than by a transition — one per requested program, at
  proposal time. Formerly recorded of the Course machine; it moved with the state.

## Provenance

Both machines were authored in Stately and pasted in verbatim at map creation, then
amended as tickets landed — see *Decided* above for every change since.

**They were one machine before that.** Ticket 17 established it, and it is load-bearing
rather than trivia: it is why the Offering carried an `approve` that approved nothing, and
the reason standing principle 4 tells you to ask what a duplicated event refers to. Treat
any remaining symmetry between the files as evidence to be checked rather than as
design.

**There are now three files, not two.** Ticket 7 split `course.machine.ts` at `approve`;
`course-proposal-review.machine.ts` is its front half, moved rather than rewritten. So the
supplied pair has been found to be *under*-split twice, in opposite directions — the
Offering carried an event belonging to a machine it had been separated from, and the Course
carried a whole lifecycle belonging to an entity that had never been separated out. Both
were found by asking what a thing refers to rather than by reading the diagram.

The Stately scaffolding is now partly replaced. `offering.machine.ts` has a real
`OfferingContext` type and a real initial context, so its `context: {} as {}` and
`context: ({ input }) => input` lines are gone. That design is now **closed**: ticket 15
settled Offering context as `{ revisingFrom }` and nothing more, and ticket 17 then
deleted `revisingFrom` too, so the type is `Record<string, never>` — empty, and stated as
a type rather than left as scaffolding. `course.machine.ts` and
`course-proposal-review.machine.ts` now read the same way — `context: {} as Record<string,
never>` and `context: {}` — so the Stately scaffolding is gone from all three files.
Nothing has positively decided that Course context is empty, but nothing needs it either:
ticket 14 was the one open claim on it, and routing `liveOfferings` through the event
payload withdrew that claim. That all three are empty is now load-bearing rather than
incidental — it is why ticket 13 could rule the silent context-drift failure vacuous.
