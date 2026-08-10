# Permissions

`permissions.ts` is **reference, not application code** — nothing runs it, in the same
sense that `docs/machines/*.ts` are reference and nothing imports them. The build effort
converts it.

It is the synthesis of nine closed map tickets, transcribed by
[Transcribe the permission matrix and read tiers into `docs/permissions/`](https://github.com/nopivnick/lineup-prototype-03/issues/56).
Every claim in the artifact names the ticket that settled it, per rule 2 of
[`docs/agents/spec-packages.md`](../agents/spec-packages.md). This file records what the
artifact says, what was considered and dropped on the way, and what has been amended since.

## Why one module

[Where does permission enforcement physically live?](https://github.com/nopivnick/lineup-prototype-03/issues/28)
put the matrix and the read tiers in **one TypeScript module** so that *what may a
`student` do* is one file. That is the same "where would a reader find it" ground on which
the map rejected a `BEFORE INSERT` trigger ([#13](https://github.com/nopivnick/lineup-prototype-03/issues/13)),
rejected a trigger again ([#30](https://github.com/nopivnick/lineup-prototype-03/issues/30)),
and rejected splitting the permission model along the read/write axis, which would have put
the answer half in SQL policies and half in TypeScript.

The **check lives inside the writer, never beside it**. That is
[#13](https://github.com/nopivnick/lineup-prototype-03/issues/13)'s *log completeness is a
single writer, not discipline*, promoted from log completeness to authorization generally.
The map had already put a single writer almost everywhere — transitions in
`applyTransition`, offering creation in the create path, tag grants in the tag writer — and
field writes were the one class with no writer yet, so they got one.

Three consequences worth having in view before reading the artifact:

- **The Server Action stopped being an auth wrapper** and became an actor-resolution
  wrapper: call `getActor()`, reject `null`, open the transaction, call in. This amends
  [#13](https://github.com/nopivnick/lineup-prototype-03/issues/13).
- **The seed script is checked like anyone else.** The deciding argument is the map's own:
  an unchecked seed writes lies into the transition log. Every log row names an actor and
  the seed has to name one for every row it writes, so unchecked, nothing stops it recording
  that a `student` cancelled a class. Tickets
  [19](https://github.com/nopivnick/lineup-prototype-03/issues/19) and
  [21](https://github.com/nopivnick/lineup-prototype-03/issues/21) both turned on *don't log
  a lie*. The bonus is that a seed which runs is a free proof the matrix is satisfiable; the
  cost is that the fixtures encode the matrix a second time, implicitly, and a future change
  to the role set breaks the seed. [#13](https://github.com/nopivnick/lineup-prototype-03/issues/13)
  wanted the seed to break loudly and called that a forward guard.
- **`actor` is a bare netid end to end.** [#11](https://github.com/nopivnick/lineup-prototype-03/issues/11)
  left roles outside `getActor()` for a structural reason, and #28 found the choice had been
  *forced* rather than merely polite: the permission check reads `user_role`,
  `program_director`, `course.area_head` and roster position 0 **inside** the locking
  transaction, and `getActor()` runs at request scope, so a role set resolved there would be
  stale by the time it was used.

## What the artifact holds

| Export | What it settles |
|---|---|
| `Role`, `ROLE_KIND` | the seven roles, and [#34](https://github.com/nopivnick/lineup-prototype-03/issues/34)'s capability / qualification split |
| `Relationship`, `Route` | the scope half of a permission, and the rule that conjunctions are OR'd independently |
| `CHAIR_BYPASS` | the chair's one OR-clause, and the three things it never reaches |
| `COURSE_PROPOSAL_REVIEW_MATRIX`, `COURSE_MATRIX`, `OFFERING_MATRIX` | who fires which transition, plus the two creation acts |
| `FIELD_CLASSES` | the thirteen-class field map, moved here from `docs/schema/` |
| `READ_TIERS` | the three tiers, each with a may-read and a may-act predicate |
| `ROLES_PAGE` | the fourth read predicate, which governs a page rather than a table |
| `INVARIANTS`, `FURTHER_INVARIANTS`, `REVOCATION_REFUSALS` | the actorless rules that bind the chair and the seed too |
| `RENDERED_ELSEWHERE` | the two rules with no boolean form, and where their rendering lives |

The transition matrices hold **transitions and creation acts only**. Field writes live in
`FIELD_CLASSES`. [#8](https://github.com/nopivnick/lineup-prototype-03/issues/8) wrote both
in one table per machine, and [#10](https://github.com/nopivnick/lineup-prototype-03/issues/10)
then made the field-class map the operative form for every column in the schema; keeping a
field rule in both places would be the second copy rule 3 forbids.

## The field-class map moved here

From [`docs/schema/README.md`](../schema/README.md#the-field-class-map), by
[Where does the rest of the spec live?](https://github.com/nopivnick/lineup-prototype-03/issues/50),
which ruled it [#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)'s **third
ruling** — it went to schema only because permissions had no directory yet. `docs/schema/`
keeps a link to it and records the move in its own ledger, because a schema reader
legitimately wants it.

The rule the map exists for is
[#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)'s: **every column gets a
field class and a column with no class is unwritable.** Declaring it as *data* buys
default-deny by construction — adding a column later forces someone to classify it rather
than leaving an open door.

Each class carries **two predicates, ANDed and checked separately**: a state predicate,
which is an **invariant** and names no actor, and a role predicate, which is a
**permission**. That separation is why a field refusal is sometimes two sentences where a
transition refusal is always one
([#62](https://github.com/nopivnick/lineup-prototype-03/issues/62)), and it is why the chair
gets the `Edit` control on an `Approved` course while the body section stays absent from the
form.

## The findings that shaped it

**Reads were missing entirely.** #28 opened on *action alone, or backstopped by RLS?* and
found it was missing its largest thread: #8's matrix had **no read rows at all**, and reads
are restricted. That gap had to close before the headline question could be answered
honestly, because RLS's strongest case is almost always reads.

**RLS lost on one argument.** Not the ticket's *backstopped by*, but the strong form — RLS
as the sole read enforcement, queries written naively with no permission `WHERE` clause.
That form dodges standing principle 1, since there would be exactly one copy. It still lost:
**there is no confidentiality property in this skeleton to defend.**
[#11](https://github.com/nopivnick/lineup-prototype-03/issues/11) built impersonation
deliberately, gated on `ALLOW_DEV_ACTOR` rather than `NODE_ENV` *specifically so preview
deploys carry it*, so anyone who cannot see a `Declined` offering can see it two clicks
later by becoming the coordinator. RLS would be enforcing, at the one layer whose entire
value proposition is being un-bypassable, a rule that is bypassable by design — on a
foundation that would itself be the forgeable cookie, since with no auth there is no JWT.
The shape RLS *would* take is recorded on the map for the effort that adds real
authentication: three predicates, one per tier, role-flat except a `created_by` comparison
on proposals.

**The student boundary had to be certifiable.** The first cut hid `Declined` and `Dead`.
That does not conceal a refusal — it *announces* one, since an offering that vanishes from
`Offered` and reappears in `Slated` leaks the decline by its absence. And the obvious rule,
*students see what has been published*, is inexpressible: standing principle 3 says a state
certifies only what all of its inbound edges agree on, and
[#21](https://github.com/nopivnick/lineup-prototype-03/issues/21) gave `Canceled` five
inbound edges, two of them pre-publication. What **is** certifiable is *an instructor agreed
to teach this, or did once*, which is `COMMITTED_STATES`.

**Invariants are a class, and the test is whether the rule names an actor.** That test
decides placement, because the database has no actor: with RLS out, exactly the actorless
rules are eligible for the schema and every actor-bearing rule must be in the module. The
ticket named two invariants; there were seven, and three were hiding inside rules that read
as permissions — #8's state gates. *Only while `Revising`* names no actor.

That filing turned out to be what makes a superuser safe to add at all.
[#34](https://github.com/nopivnick/lineup-prototype-03/issues/34) put the chair one
OR-clause ahead of the whole matrix, and the chair still cannot re-home a course — because
[#28](https://github.com/nopivnick/lineup-prototype-03/issues/28) had reclassified
immutability from a permission to an invariant. #30 spent its whole argument protecting that
rule, and it survives **only because of where the rule was filed.**

**Permitted actions ship as data.** #6 said the machine is imported client-side *purely for
`.can()` affordances*, written when the machines had guards.
[#17](https://github.com/nopivnick/lineup-prototype-03/issues/17) deleted every Offering
guard, so client-side `.can()` became nothing but *does an edge exist in this state* — a
static fact — while both things that actually decide whether a control should be live are
server-side. So the server computes the permitted set per row, already intersected, and the
machine no longer reaches the client. The rejected alternative kept #6 as written and ANDed
a client-computed edge set with a server-shipped permission set; it was declined for having
two sources whose answers drift when the client's snapshot is stale.

## Amendments

Recorded so the artifact is never the only place a change is visible. An amendment
**replaces** what it overturns; it never stands beside it.

- **`coordinator` is the sixth role, and the review's `approve` is program-scoped** — by
  [Role x transition permission matrix](https://github.com/nopivnick/lineup-prototype-03/issues/8),
  amending [#4](https://github.com/nopivnick/lineup-prototype-03/issues/4) on two counts.
  Charting had called `program_director` "Admin"; #4's rename left the department's
  operational seat unoccupied, and the Offering's forward path — six transitions that are
  bookkeeping rather than faculty judgement — had no holder. Folding the seat into
  `program_director` was rejected on a concrete over-grant: the real coordinator handles all
  three programs, and under program-scoped directorship they would need to direct ITP *and*
  IMA *and* LowRes, which also hands them curriculum approval over all three. `admin` was
  rejected for its superuser connotation and `staff` for colliding with the Offering
  machine's event.

- **The area-head route returns to the review, and Tier 3 widens** — by
  [Where are a course's area and area head assigned?](https://github.com/nopivnick/lineup-prototype-03/issues/32),
  which resolved a contradiction #28 had left standing: #8's prose dropped the area-head
  route from the review *for want of a subject*, while #8's own table kept it. The prose's
  reason was that `approve` mints the course that carries `area_head` — **and that reason is
  false**, because a director may assign the head on the review before approving. Resolved
  in favour of the table. The matrix also gains **one field-write row**, the assignment
  itself, which #8 never listed. #28's narrow Tier 3 default was taken explicitly so it
  could close; this is the widening it left free.

- **The chair, and a bypass that is a clause and not a column** — by
  [Who writes `user_role`?](https://github.com/nopivnick/lineup-prototype-03/issues/34).
  `user_role` and `program_director` had **no author anywhere in the map**, which was
  harmless while roles were something fixtures merely contained and stopped being harmless
  the moment #32 made a write depend on one. A column with every cell filled was rejected as
  a hand-maintained restatement of the word *all*, re-broken by every event the map adds.
  The same ticket added **standing principle 6**, closing a gap where `staff` could name a
  netid holding no `instructor` role — a silent under-grant discovered when the lead clicks
  and nothing happens — and settled reads for both tables at **Tier 1**, while noting that
  the enforcement read sits outside the tiers entirely.

- **A fourth read predicate, governing a page** — by
  [What does the roles page show?](https://github.com/nopivnick/lineup-prototype-03/issues/38).
  *Holds any role other than `student`*. Tier 2 would have cost nothing and was rejected at
  the requester's direction, so `advisor` gains its first permission anywhere in the map and
  the `student` / `advisor` twinship #34 had just certified as complete ends — they remain
  twins in the matrix and are no longer twins in what they may see. The predicate is
  deliberately *holds any role other than `student`* and never *does not hold `student`*,
  because ITP is full of graduate students who teach and #11 refuses role-narrowing.

- **A fourth Tier 3 arm, and a second predicate per tier** — by
  [What do the proposals list and the review detail page show?](https://github.com/nopivnick/lineup-prototype-03/issues/42),
  Tier 3's first reader. The chair's blanket clause reaches curriculum approval, confirmed
  at the requester's direction rather than inherited, because the alternative is a bypass
  with an exceptions list that grows. And reads widen past the arms entirely: the reviews
  being independent and able to disagree is #7's whole reason for splitting the machine, so
  a screen that hides the disagreement hides the point. **may-read and may-act became two
  predicates where every tier had one** — the finding #42 called the one with the longest
  reach. It gave the split content on Tier 3 alone; on Tiers 1 and 2 the tier predicate
  governs reading and the matrix governs acting, which is how the artifact states it.

- **A qualification survives the loss of its scope** — by
  [Can a chair remove a director from a programme?](https://github.com/nopivnick/lineup-prototype-03/issues/51).
  Removing a director from a program drops the `program_director` relationship row and
  leaves the role standing, exactly as finishing a term leaves `instructor` standing. This
  is the **only shape under which #34's revoke refusal is observable**: cascading to the role
  means nobody ever reaches the state the refusal was written for. The finding worth
  carrying is that **monotonicity is cheap on a column and impossible on a join table** —
  `course.area_head` assigns and reassigns with the same write, where a join table has no
  swap primitive at all, so a relationship modelled as rows needs its remover stated
  explicitly or the role depending on it becomes permanently irrevocable.

- **The Offering roster row narrows, and gains an eighth invariant** — by
  [Who writes co-instructor roster rows?](https://github.com/nopivnick/lineup-prototype-03/issues/61).
  *Edit positions 1..n | `coordinator` or director, any state* becomes **the offering's
  program director alone**, on #8's own decision-versus-execution axis: seating a second paid
  instructor commits the department to an appointment in the way reassigning a room does not.
  The Roster class **splits in two**, position 0 keeping the `staff` / `unstaff`
  non-exposure and positions 1..n becoming a real field class — the old single line was true
  of position 0 and overreached by one word, which under #28's *a column with no class is
  unwritable* had made every co-instructor row unwritable. State-blindness is **re-grounded,
  not re-decided**: #15's *positions 1..n stay non-gating and freely editable in any state*
  stands, but it hung on `revise`, which #17 deleted, so the surviving ground is #8's
  field-class rule — `Staffed` asserts *position 0 is occupied* and nothing else. And #28's
  invariant list goes from seven to **eight**: the field writer refuses any write naming
  position 0, in every state, which is what makes the state-blindness safe rather than a
  licence to rewrite a `Published` section's lead by `UPDATE … SET position = 0`.

## What this transcription found, and how it resolved

The transcription could not write down two rows of #8's CourseProposalReview table,
because four later tickets stated them narrower and nobody had said which was the rule.
It graduated the conflict as
[Do `program_director` and `area_head` hold flat routes on proposal creation and body edits?](https://github.com/nopivnick/lineup-prototype-03/issues/65)
rather than settling it here — a transcription that finds itself *deciding* something has
found a ticket, not a paragraph — and shipped the narrow form as a marked reversible
default in the meantime, on
[#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)'s own precedent for its
Tier 3 default.

| | [#8](https://github.com/nopivnick/lineup-prototype-03/issues/8)'s table | [#10](https://github.com/nopivnick/lineup-prototype-03/issues/10), [#42](https://github.com/nopivnick/lineup-prototype-03/issues/42), [#43](https://github.com/nopivnick/lineup-prototype-03/issues/43), [#62](https://github.com/nopivnick/lineup-prototype-03/issues/62) | **#65 ruled** |
|---|---|---|---|
| create proposal | `instructor`, `program_director`, `area_head` — flat | `instructor` alone | **#8's table, whole** |
| edit shared body | `course_proposal.created_by`, a director of **any requested** program, or `course_proposal_review.area_head` | `course_proposal.created_by` alone | **neither** — `course_proposal.created_by`, or the director or `course_proposal_review.area_head` of a program **whose own review is `Developing`** |

#65 is recorded in full below. The short version is that the two rows deserved different
answers, and the reason they had been read as one question is that both were residue from
the same drafting pass.

## Amendments (continued)

- **#8's create-proposal row is restored whole, and the body-edit row is scoped to the
  review that opened the edit** — by
  [Do `program_director` and `area_head` hold flat routes on proposal creation and body edits?](https://github.com/nopivnick/lineup-prototype-03/issues/65),
  which ends the narrow default this package shipped with.

  **The narrowing had no ruling behind it.** #43's own body states *"#8 already wrote both
  — proposing is the `instructor` role"*, which is a misquote of the row. So #43's
  resolution — *an IMA director who holds no `instructor` role cannot propose … #4's
  conjunction model and #34's capability/qualification split working exactly as written* —
  is a sound derivation from a premise #8 never wrote. It says *as written* because it
  believed it was applying #8. It never saw the wide reading, so it never weighed it. #42
  reached the same place more defensibly, citing #8's **prose** (*"the proposal's own
  `created_by` … gates body edits"*), which is real but non-exclusive: it argues
  `created_by` **is** a route, against *proposing confers nothing*, not that it is the only
  one. This is therefore #61's shape for the **third** time, and the third resolved for the
  table.

  **On create, flat is forced by the act.** At create time there is no proposal, no review
  and no course, so no relationship can scope anything. Under
  [#34](https://github.com/nopivnick/lineup-prototype-03/issues/34) all three arms are
  *qualifications*, normally scoped by a relationship, and on create none of them can be —
  `instructor` included. Any objection to a flat director arm applies word-for-word to the
  flat instructor arm nobody disputes, so it proves too much. The requester confirmed that
  **every ITP/IMA/LowRes director teaches**, so the two restored arms grant nobody today,
  and directed the widening anyway: an empty set is a fixture fact rather than a rule, and
  [#11](https://github.com/nopivnick/lineup-prototype-03/issues/11) refuses role-narrowing.
  The chair already proposes by `CHAIR_BYPASS` without holding `instructor`, so *only
  teachers may propose* was never a live principle.

  **On the body, #8's table lost — to #8.** #8 overturned flat approval three lines above
  that row (*flat approval would let an ITP director dispose of the IMA review*), rewrote
  the `develop`/`approve`/`reject` row to be program-scoped, and left the body row flat
  across every requested program — which reaches **further** than disposing of one review,
  since the body is shared and changing it changes what all of them are reading. #32 read
  all three rows, program-scoped that one, and left this one behind. But pure `created_by`
  has its own hole: a director fires `develop` and can then edit nothing, shrinking the job
  #8 gave `develop` to *hand it back to the proposer*. The ruling keeps both halves of #8:
  ITP cannot rewrite the body because IMA asked for changes — ITP must `develop` its own
  review first.

  **The cost is accepted, not overlooked.** #42 seeded *Critical Data Practice* as the
  fixture where a proposer who is also `review.area_head` writes and approves unsupervised.
  This makes that reachable **without being the proposer**: an assigned head may edit the
  body and then approve it.

- **A relationship may now carry a state, and that is where #65's condition had to go** —
  the model change #65 made rather than inherited, called out because it widens what the
  word *relationship* means in this package.

  Until now a relationship was a row that either exists or does not.
  [#32](https://github.com/nopivnick/lineup-prototype-03/issues/32) came closest to an
  exception — *a review with no assigned head has nobody holding it* — but that is a row
  **missing**, not a row **dormant**. The two `… of a review that is Developing` arms hold
  a row that exists and stops conferring anything when the review leaves `Developing`.

  It sits there because the alternative is worse. #28 split a field rule into a state
  predicate that **names no actor** and a role predicate that does, and that filing is what
  stops the chair re-homing a course. *Whose own review is `Developing`* is a state whose
  answer depends on who is asking, so putting it in the `StateGate` would make the actorless
  half name an actor. #4 already lets the relationship vary by actor. So the `StateGate` on
  the Proposal body class keeps the weaker **actorless floor** — *at least one review is
  `Developing`* — which is exactly what `created_by` writes under, an author having no
  review of their own, and the per-review condition rides in the two routes. The invariant
  entry carries a note saying why it is stated weakly, and `Invariant` gained an optional
  `note` to hold it, matching `Act` and `FieldClass`.

- **`FURTHER_INVARIANTS` gains a sixth entry, and the roster entry gains a third citation**
  — by [`docs/permissions/` omits the create-path invariant #43 settled](https://github.com/nopivnick/lineup-prototype-03/issues/96).
  **No rule changes and no writer behaves differently.** Both rules were already settled,
  and both were already stated in prose elsewhere in the map; what was wrong was the
  **list**, which is this package's operative form.

  **An Offering may not be created against a `Retired` Course**, settled by
  [#43](https://github.com/nopivnick/lineup-prototype-03/issues/43) completing a rule
  [#14](https://github.com/nopivnick/lineup-prototype-03/issues/14) left half-drawn. **The
  argument is not restated here.** It landed in
  [`docs/machines/README.md`](../machines/README.md), under *The Offering create path
  refuses a `Retired` course*, which is where a reader should go for why `retire`'s guard
  had a door on the other side, why the rule stays out of the schema, and why the create
  path is the worse of the two doors. What this package owed it was a **row in the list**,
  and that is what it now has.

  **The `CHAIR_BYPASS` bullet now names it**, between its two neighbours. That was the tell
  #96 found: the bullet enumerated #32's gate and #14's `retry` refusal and skipped the rule
  sitting between them, in the one place a reader checks what a chair cannot do, for the
  door a chair is likeliest to walk through. Ruled here rather than inherited, because #96
  left it open.

  **[#69](https://github.com/nopivnick/lineup-prototype-03/issues/69) joins the roster
  entry's `settledBy`.** #9 and #61 stated the rule; #69 is the ticket that ruled on the
  case the seed hits — the seed may **not** write a roster row for a netid `people` does
  not know — which is what `docs/README.md` already records. The Roster positions 1..n
  field-class note keeps `#9` alone: the invariant list is the operative form of that rule
  and is where the ticket coverage has to be complete.

  **How it was found is the point.** #43 appeared nowhere in `permissions.ts` while
  `docs/machines/README.md` carried the rule as a full ledger entry — and amended its own
  count of cross-entity invariants from two to three under a section named for this
  package's rule, *Permission enforcement lives in one TypeScript module*, while the module
  itself never picked it up. That is exactly the hole rule 2 of
  [`docs/agents/spec-packages.md`](../agents/spec-packages.md)
  exists to make findable by diffing ticket coverage. It had teeth because
  [#76](https://github.com/nopivnick/lineup-prototype-03/issues/76) had already shipped
  `lib/permissions.ts` carrying both entries: the copy asserted something its authority did
  not, which #76's own header says is the copy being wrong. Recorded as a ticket rather than
  fixed silently, per [#50](https://github.com/nopivnick/lineup-prototype-03/issues/50).
  **The invariant lists in the two files now agree**, entry for entry and citation for
  citation, modulo the copy's `issues/n` style — so `lib/permissions.ts` needs no edit.

## What #65 left for the prototypes

**#65 reaches two settled screens**, both built on the narrow reading it overturned:
`create-forms.html` ([#43](https://github.com/nopivnick/lineup-prototype-03/issues/43)) refuses
a create control the restored row permits, and `field-edits.html`
([#62](https://github.com/nopivnick/lineup-prototype-03/issues/62)) gains a proposal-body
section on a review edit page. Neither page is redrawn, and **the disposition of both is
recorded in [`docs/prototypes/README.md`](../prototypes/README.md)** — which is where it moved
when [#59](https://github.com/nopivnick/lineup-prototype-03/issues/59) gave that package its
ledger. It was parked here only because writing an amendment into an HTML file with no ledger
beside it puts it where no reader looks.

## Notes for the build effort

- **No RLS.** The read tiers are a product rule, not a security boundary. See above, and
  `docs/README.md`'s inherited constraint about preview deployments — that is the live risk
  this decision leaves standing.
- **This module is server-only** and is never imported client-side. The permitted-action set
  crosses to the client as data;
  [#9](https://github.com/nopivnick/lineup-prototype-03/issues/9) owns where the read
  predicates are *applied*, and `docs/data-access/` is where that lands.
- **The application's copy is `lib/permissions.ts`**, converted by
  [#76](https://github.com/nopivnick/lineup-prototype-03/issues/76). It carries an
  `import "server-only"`, which makes the bullet above structural rather than a convention —
  a Client Component that reaches for the rules fails the build. Two things there are
  operative where they are prose here: each matrix row lists the **event names** it covers,
  typed against the machine's own event union, so a renamed event is a compiler error; and
  `fieldClassFor(column)` is **total**, returning an `UNCLASSIFIED` class whose writers are
  `NOBODY`, which is what makes [#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)'s
  *a column with no class is unwritable* true by construction rather than by discipline.
- **Two rules have no boolean form**, and their rendering lives in `docs/prototypes/`, not
  here — `getReviewPage`'s two fidelities and the record-level refusal on a detail page. See
  `RENDERED_ELSEWHERE`.
- **The state unions come from the machine.** `permissions.ts` imports `COMMITTED_STATES`,
  `LIVE_STATES` and `OfferingState` from `../machines/offering.machine` rather than
  restating their values, so a renamed state is a compiler error here. `npm run typecheck`
  covers it; CI runs it on every push and PR.
