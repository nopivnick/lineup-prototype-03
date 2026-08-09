# Fixtures

`fixtures.ts` is **reference, not application code** — nothing runs it, in the same sense
that `docs/machines/*.ts`, `docs/permissions/permissions.ts` and
`docs/data-access/data-access.ts` are reference and nothing imports them. The build effort
converts it into a seed script.

It holds the whole seed world: 14 netids, 21 role grants, 23 proposals, 29 reviews, 17
courses, 28 classes and every transition that puts them where they are. It is the synthesis
of [What are the seed fixtures?](https://github.com/nopivnick/lineup-prototype-03/issues/49)
— one dense ticket that settled all twelve constraints it had inherited from eleven closed
tickets and ruled the two that conflicted — as amended by
[#61](https://github.com/nopivnick/lineup-prototype-03/issues/61),
[#65](https://github.com/nopivnick/lineup-prototype-03/issues/65) and
[#69](https://github.com/nopivnick/lineup-prototype-03/issues/69), and transcribed by
[Transcribe the seed fixtures into `docs/fixtures/`](https://github.com/nopivnick/lineup-prototype-03/issues/58).
Every claim in the artifact names the ticket that settled it, per rule 2 of
[`docs/agents/spec-packages.md`](../agents/spec-packages.md). This file records what the
artifact says, what was considered and dropped, and what has been amended since.

## Why this is its own package

It touches all three of the packages that precede it, which is what earns it a directory
rather than a section of `docs/schema/`:

- **schema** for row shape — every table in `docs/schema/classes.sql` and the one in
  `people.sql` has rows here.
- **machines**, because [#13](https://github.com/nopivnick/lineup-prototype-03/issues/13)
  drives the seed **through the machine** rather than inserting rows at rest. There is no
  `snapshot` anywhere in the artifact and no `from_state` / `to_state`: an offering carries
  an ordered event list and the seed calls `applyTransition` once per step. A hand-authored
  snapshot literal would be a third copy of the machine's shape, re-broken by every change,
  where `getPersistedSnapshot()` is valid by construction — and it is what makes the
  skeleton walk the transition log instead of shipping it empty.
- **permissions**, because [#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)
  has the seed **checked like any other caller**.

**The third point is a known cost, taken deliberately.** #28 stated it — *the seed
implicitly encodes the matrix a second time* — and buys a real thing for it: the fixtures
are a free satisfiability test of a matrix this map amended six times and whose role set it
changed twice. If no legal actor exists for some act the seed needs, the seed cannot be
written, and that is a louder failure than a matrix nobody ever tried to use.

#49 then found the cost has a shape #28 did not anticipate. Every role and relationship row
exists **before any transition is driven**, and the permission check reads the rows as they
are rather than as they were on the fictional date in the log. So **the seed cannot
attribute a historical act to someone who no longer holds the role** — a 2019 approval by a
director who has since stepped down is not awkward, it is *refused*. That is not only which
actor may fire what; it is **the cast's present shape constraining its own past**, and it is
why every historical approval in the artifact is by a current director or the review's own
area head, and why `vm7781` holds a director role and appears in no history at all.

## What the artifact holds

| Export | What it settles |
|---|---|
| `WORLD_DATE` | 20 October 2026 — literal, never computed |
| `PEOPLE`, `NETID_WITH_NO_PERSON_ROW` | the thirteen `person` rows and the fourteenth netid |
| `ROLE_GRANTS`, `PROGRAM_DIRECTORS` | twenty grants, one of them the unchecked genesis row |
| `PROGRAMS`, `TERMS`, `AREAS`, `REQUIREMENT_CATEGORIES` | the reference data |
| `PROPOSALS` | 23 proposals and their 29 reviews, each with its history |
| `COURSES` | 17 courses, their areas, categories, editions and revise/approve cycles |
| `OFFERINGS` | 28 classes with rosters, meetings, seat-sharing tags and 164 events |
| `FIELD_EDITS` | one edit on every kind of record, and the field class each goes through |
| `SEED_ORDER` | #34's eleven steps, extended at each end |
| `COUNTS`, `STATE_COVERAGE`, `REVOKE_COVERAGE` | what a build effort should assert |
| `SEED_ONLY` | rendered, never minted — three of them |
| `OPEN_AGAINST_THIS_PACKAGE` | the one conflict this transcription could not settle |
| `AMENDMENTS` | what #61, #65 and #49 overturned |

**Keys are not columns.** `C1`, `O28`, `P23`, `R29` are #49's own labels, kept because the
ticket argues in them; every id in the schema is `bigint GENERATED ALWAYS AS IDENTITY`, so
the seed resolves a key to an id as it inserts. Typing them as literal unions is what makes
a mistyped cross-reference a compiler error rather than a foreign-key violation discovered
at seed time — which is the whole reason this package is TypeScript and not a markdown
table. The state and event unions come off the machines through
[`docs/data-access/data-access.ts`](../data-access/data-access.ts) rather than being derived
a second time, so a state renamed in a machine breaks the build here.

`endState` on a course, review or offering is an **assertion, not a stored value**. The seed
drives `history` and checks it lands there; nothing writes it to a column, so it is not the
second copy standing principle 1 objects to. Same for `edition`, which is one plus the
number of `approve` rows and is bumped by `applyTransition`.

## The rulings worth carrying

**Every course is minted through a proposal and an approving review**, at the requester's
direction and against the recommended mixed backfill — the ruling with the longest reach.
It is what closed `course.minted_from_review_id` to `NOT NULL`, a nullability
[#42](https://github.com/nopivnick/lineup-prototype-03/issues/42) had deferred to whoever
settled the seed, by name.

**LowRes gets a director**, so #38's *programme with no director* strip is not seedable —
and, since the roles page appoints and nothing un-appoints, not reachable at runtime either.
A third door existed: the chair could have created LowRes's classes with the seat vacant,
rendering the empty state *and* exercising #34's bypass in data for the only time anywhere.
It lost on the cost it carries — every LowRes act would be signed by the chair, so an
ordinary LowRes director's point of view would not exist to switch to. The bypass is
exercised once instead, on P4's review.

**Three directors, three different people.** #42 needs a director whose programme shares a
proposal with two others, which holds only if nobody directs two. Ruling the LowRes conflict
in favour of a full complement **dissolves** that constraint rather than trading against it:
it is satisfied by construction rather than by care.

**Dates are literal.** A seed working backwards from its own run time would have to decide
which term is current, and *current term is not computable* is a fact
[#3](https://github.com/nopivnick/lineup-prototype-03/issues/3) established. Fixed dates
also mean a screenshot stays true across resets.

## Amendments

Recorded so the artifact is never the only place a change is visible. An amendment
**replaces** what it overturns; it never stands beside it.

- **Every roster row carries `granted_by` / `granted_at`, position 0 included** — by
  [Who writes co-instructor roster rows?](https://github.com/nopivnick/lineup-prototype-03/issues/61),
  which gave `offering_instructor` the two columns `offering_area` already had, for a
  stronger reason than won them there: a seat-sharing tag records that another programme's
  students may enrol, where a roster row names a person to a paid teaching role with the
  contractual weight [#21](https://github.com/nopivnick/lineup-prototype-03/issues/21)
  documented. Every `granted_by` in the seed is **the offering's own programme director**,
  and that is forced from both sides — `staff` is director-only
  ([#8](https://github.com/nopivnick/lineup-prototype-03/issues/8)), and #61 narrowed
  positions 1..n from *coordinator or director* to the director alone. It also has to name
  someone who legitimately holds the write **at seed time**, per #49's end-state constraint,
  which leaves exactly the three sitting directors.

- **O21 seats a co-instructor, where #49 left its roster empty** — by #61, and it is the
  point of the amendment rather than a detail of it. `decline` and `withdraw` each `DELETE`
  position 0 and leave everything below untouched, so a section holding co-instructors and
  **no lead** is a shape the machine's own edges *produce*. #41 had shipped the roster as
  `roster[0]`, an array indexed by convention — a shape that cannot express a gap — with an
  empty state firing on `roster.length`, so exactly this section would have rendered as an
  ordinary staffed roster with nothing saying it could not be offered to anyone. O21 is the
  only section in the seed that reaches the state, and therefore the only way #41's **sixth**
  empty state renders at all.

- **`hs5540` holds `instructor`, where #49 deliberately withheld it** — by
  [#65](https://github.com/nopivnick/lineup-prototype-03/issues/65), which handed this
  correction to #58 by name. #49 gave Hana no `instructor` so that #43's refusal of the
  propose control had a person behind it. #65 then found #43's narrowing of the create row
  was a **misquote of #8's table**, restored `program_director` and `area_head` as flat
  create arms, and recorded the requester's statement that every real ITP/IMA/LowRes
  director teaches — so a cast holding a non-teaching director is a fixture fault rather
  than a rule being demonstrated. Two things survive the change rather than being lost:
  the refusal still renders, on `dk2210`, `ok3356` and `mo5512`, who hold none of the three
  arms; and **the two restored arms are exercised**, by `vm7781` and `jl8802`, who reach the
  create control through them and through nothing else. #65 said the two arms *grant nobody
  today* — in the fixtures they grant two people, which is the difference between an empty
  rule and a rendered one.

- **`xq7742` holds no roster row, where #49 gave it three** — by
  [May the seed write a roster row for a netid `people` does not know?](https://github.com/nopivnick/lineup-prototype-03/issues/69),
  which is the conflict this transcription raised and could not settle. #49 seeded the netid
  as *a new hire ahead of the directory feed*, leading O4, O17 and O22. That story needs an
  **insert** the map forbids: *a roster write refuses a netid the `people` project does not
  know* ([#9](https://github.com/nopivnick/lineup-prototype-03/issues/9), restated by #61),
  and [#28](https://github.com/nopivnick/lineup-prototype-03/issues/28) makes an actorless
  rule bind the seed exactly as it binds the chair. The leads are now `hs5540` on **O4**
  (self-staffed, on O3's precedent, which also spends the `instructor` grant #65 restored to
  her and nothing had spent), `ab9034` on **O17** (staffed onto an ITP class by ITP's own
  director — her second lead outside IMA after O15), and `rc1129` on **O22** (who led O18,
  the same course canceled the term before, so C13 reads as pulled in Fall and re-run in
  Spring under the same person). No count moves: `na2481` keeps five live roster rows and
  nine headed courses, `hs4417` keeps a clean `instructor` revoke, and the offering-event
  total is still **164**.

- **`xq7742` gains `area_head` and heads R2** — by #69, and it is what the reassignment had
  to buy back rather than a detail of it. All nine of the netid's transition-log rows sat on
  those three offerings, so closing the roster route would have deleted
  [#41](https://github.com/nopivnick/lineup-prototype-03/issues/41)'s *history line whose
  actor the directory does not know* along with them, and no other netid can supply it. An
  instructor acts only from position 0; an **area head** acts on
  [#32](https://github.com/nopivnick/lineup-prototype-03/issues/32)'s
  `approve`/`reject`/`develop` arm and needs no roster row. R2's head moves from `ab9034`,
  who carries no counted head fact, and R2's `develop` is now the only act anywhere in the
  fixtures whose actor renders as a bare netid. The `area_head` revoke stays **clean**:
  #34's refusal is over `course.area_head` on a non-`Retired` course, and R2 mints nothing.

- **`course.minted_from_review_id` is `NOT NULL`** — by #49 amending #42. Already carried in
  `docs/schema/classes.sql`; restated here because this package is what made it true.

## Three of #49's own tallies disagree with its own tables

Counted rather than restated, and resolved **for the table** — which is how this map has
resolved prose-against-table four times ([#32](https://github.com/nopivnick/lineup-prototype-03/issues/32),
#61, #65, and #49's own C3 note below). An arithmetic slip is the weakest form of the same
disagreement, and none of these three changes a decision.

| #49 says | The tables give |
|---|---|
| *the remaining 17 `user_role` rows* | **eighteen**, before #65's amendment adds the nineteenth |
| `na2481` blocked on *3 live classes* | **five** — `LIVE_STATES` includes `Scheduled` (O19) and `Published` (O26), not only `Running` |
| `na2481` heads *8 non-retired courses* | **nine** |

The second is the one worth a sentence: it is not a miscount so much as a reading of *live*
as *teaching right now*, which is exactly the reading
[#14](https://github.com/nopivnick/lineup-prototype-03/issues/14) ruled against — **live
ends when teaching ends**, and the forward path is live from `Slated` onward. The revoke
refusal reads `LIVE_STATES`, so the two spring sections count.

**Transition totals**, for the same reason: 164 offering, 26 course, 28 review. #49's *about
210* rounds to 212. The offering figure landing on **exactly 164** is a check rather than a
coincidence — it only comes out if every history in the artifact walks the edges #17, #19
and #21 left in the machine, which is the strongest evidence available that the histories
are legal.

## Four things this transcription had to derive

None is a decision, and all four are recorded here so that if any reads as one, it is a
ticket rather than a paragraph — per
[#50](https://github.com/nopivnick/lineup-prototype-03/issues/50)'s rule and #65's
precedent. The map asked #58–#60 to watch for #65's shape — *a later ticket that cites an
earlier one and states its rule in its own words is where a package silently forks*. One of
the four is that shape and turned out derivable; the fifth thing found was not, and is the
next section.

**1. C3 has no offerings.** #49's prose says the retired course *has two concluded classes
in its past, so `retire` was legal under #14's `noLiveOfferings`* — and its own three term
tables enumerate twenty-eight offerings with none of C3 among them, matching its own
headline count. Resolved for the table: `noLiveOfferings` holds vacuously over an empty
list, so `retire` was legal for a simpler reason than the prose gives. This is #65's shape —
a sentence restating a table's content in its own words — and it is derivable rather than
contested, because the table is exhaustive and the prose's conclusion survives either way.

**2. The fifteen quiet proposals are concretised, not decided.** #49 specifies P9–P23 at
aggregate resolution: one per remaining course, single-programme except *Machine Vision*,
dated 2018 to 2025, authored by instructors of the period, approved by the programme's
**current** director or by the review's own area head, with roughly a third running through
`develop` first. Nothing in the map turns on which Tuesday in 2021 P16 was approved. Every
constraint in that envelope is checked in the artifact rather than approximated — five of
sixteen reviews run `develop`, three approvals go by #32's area-head route, and no approver
is anyone but a sitting director or the review's own head.

**3. Reference data is authored by the chair.** #49's step 1 calls `program`, `term`, `area`
and `requirement_category` *reference data, no actor*, and three of those four tables carry
`created_by NOT NULL`. The seed writes `tv1067`: the map's own bootstrap author, already
spending an unchecked write on the genesis `chair` row, needing no new concept. `term` has
no provenance columns at all and needs nothing.

**4. The `area` rename is seed-only.** #49 lists ITP's *Networks* renamed by `pr3390` as one
of #40's seven field edits. `area.name` sits in **no field class**, and #28's rule is that a
column with no class is unwritable — so no control in the skeleton performs this edit. It is
seeded anyway on #49's own **rendered, never minted** precedent — which that ticket set for
`xq7742` and applied to Vera's directorless director role, and which #69 has since left
resting on Vera alone. The missing piece is a reference-data screen, which is a screen the
skeleton does not contain, not a rule nobody wrote. Listed in `SEED_ONLY` beside the other
two.

## What this transcription could not settle, and how #69 settled it

**`OPEN_AGAINST_THIS_PACKAGE` is empty, and it closed rather than emptied.** The one entry
#58 raised was graduated as
[May the seed write a roster row for a netid `people` does not know?](https://github.com/nopivnick/lineup-prototype-03/issues/69),
and the ruling is above under **Amendments**. What is worth keeping here is why the answer
went the way it did, because three of the arguments were not available to either #49 or #58.

**The invariant wins, and it is the only rule in the map that consults `people`.** #9's
refusal names the case outright — *in practice the netid arrives from a picker populated out
of `people`, so this is a backstop against **seed scripts** and direct writes* — and a seed
script is precisely what writes these rows. Narrowing it to a non-seed path would remove it
from the one caller it was written for.

**Why the `user_role` writer is right not to check, and the roster writer right to.** The
same netid's `instructor` grant is `checked: true` and passes, because nothing makes the
authorization writer consult `people` — [#38](https://github.com/nopivnick/lineup-prototype-03/issues/38)'s
roles-page fixture *depends* on that. The asymmetry is real: a role grant is a capability
with no external counterparty, where a position-0 roster row means the department is about
to ask a named person to teach a paid class, which is the ground #61 already narrowed
co-instructor writes on. A typo'd netid in `user_role` is a dead role nobody holds; a
typo'd netid at position 0 is a class nobody is teaching that the system reports as staffed.

**The escape hatch was weighed and refused on a fact about the domain.** `people` is not a
table this system owns — [`docs/schema/people.sql`](../schema/people.sql) says *nothing in
the skeleton writes a person: rows arrive from the seed, and in a real deployment from an
NYU feed*. So the seed could have written the `person` row, driven every checked write, and
deleted the row last, since nothing in the map governs a write to `people` at all. It was
put to the requester and **declined**: the real ITP/IMA case is an adjunct arriving *late*
to their netid, so a delete would tell the story backwards, which is the mislabelling move
[#19](https://github.com/nopivnick/lineup-prototype-03/issues/19) refused by name and #38
refused to let a typo imitate.

**The cost, accepted rather than traded for.** #37 asked for *a roster netid absent from
`people`* and a checked seed cannot produce one, so the Lineup's instructor column never
falls back to a netid in the fixtures. That is a **finding about #37**, which asked for
something the rules forbid — the two tickets had never cited each other. The rendering stays
and is still correct: nothing cascades when the NYU feed drops someone already staffed, so
the state is reachable in production and unreachable *by the seed*, which is not the same
thing. What the fixtures render instead is the invariant **biting** — a person holding
`instructor` who appears on no roster anywhere, because nothing may put them on one.

**What the requester ruled out of scope**, recorded on the map: adjuncts who need to propose
a class and be staffed **with no netid at all**. That is a larger shape than this ticket and
one the data cannot hold — `netid` is `person`'s primary key and the only join between the
two projects, so there is nothing to write in the roster row. The roster refusal is what
blocks it, and the block is deliberate, so a later effort inherits a new way to name a
person rather than a check to delete.

This is the second time a transcription has caught a fork before a build effort did, after
#61 — and the third package to find that
[#50](https://github.com/nopivnick/lineup-prototype-03/issues/50)'s *a convention names
shelves and leaves the books on the floor* has teeth.

## What this package does not hold

- **The rules.** Who may fire what, the read tiers, the field-class map and the invariant
  list are [`docs/permissions/permissions.ts`](../permissions/permissions.ts). The fixtures
  name the class each write goes through and do not restate it.
- **The columns' definitions.** [`docs/schema/`](../schema/README.md) is authoritative for
  every type and constraint. Nothing here restates a CHECK.
- **The lifecycles.** [`docs/machines/`](../machines/README.md), including the full
  statement of `applyTransition` and the standing principles this package reasons by.
- **The rendering.** What a screen does with any of this is `docs/prototypes/`.

  **Four prototypes still show `xq7742` on a roster** — `catalog-lineup-views.html`,
  `course-offering-detail.html`, `field-edits.html` and `roles-page.html` — and #69 did not
  rewrite them. They are demonstrations of a **rendering**, and the rendering they
  demonstrate is still required: `displayName` stays nullable and a roster entry is still
  never dropped for want of a name, because the NYU feed can drop someone already staffed.
  What changed is which fixture reaches it, and this package is authoritative for that. A
  build effort seeds from `fixtures.ts` and reads the prototypes for layout only.

## Accepted costs and exclusions

- **The roles page's *programme with no director* empty state is not seeded and is not
  reachable at runtime.** Ruled, not overlooked. A later effort wanting it needs an
  un-appoint control, which is a screen decision this map has closed.
- **Vera's director role with no programme is authored by the seed alone.** Same remark.
  #49 set the *rendered, never minted* precedent on `xq7742` and applied it here; #69
  removed that instance and left the precedent standing, so Vera's row is now what it rests
  on. The line it turns on is #58's: an entry there lacks a **control**, and a row that
  violates an **invariant** is not a missing screen.
- **The Lineup's instructor column never falls back to a netid.** #37 asked for a roster
  netid absent from `people`; #69 found a checked seed cannot write one. The rendering is
  kept and is still correct — the state is reachable in production and not by the seed.
  Nothing here is a signal to delete the null branch of `StitchedName`.
- **The chair's bypass is exercised once, on a review** (P4), not on a class — the cost of
  ruling the LowRes conflict the other way.
- **No person holds zero roles.** The row would render nothing a `student` does not, and
  would buy a fourteenth switcher entry for it.
- **No fixture depends on term dates**, which #3 deferred: the terms are labelled and
  ordered by code, and *under way* is a property of the states in them.
- **Nothing counts shared seats, evaluates anyone, registers anyone or advises anyone.** The
  seed does not reach past the destination into excluded features, and `ok3356` the advisor
  advises nobody by design, having no advisee table to be scoped by.
- **No machine is amended.** Checked explicitly against all three: every state and event the
  seed uses already exists. #49 chose rows, not lifecycles, and so does this.
