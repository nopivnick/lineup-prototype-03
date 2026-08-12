# Data access

`data-access.ts` is **reference, not application code** — nothing runs it, in the same
sense that `docs/machines/*.ts` and `docs/permissions/permissions.ts` are reference and
nothing imports them. The build effort converts it.

It holds **signatures and row types, not bodies**: the identity reader, the seven
view-shaped read modules and the four write paths. It is the synthesis of eleven closed map
tickets, transcribed by
[Transcribe the data-access seam and identity into `docs/data-access/`](https://github.com/nopivnick/lineup-prototype-03/issues/57).
Every claim in the artifact names the ticket that settled it, per rule 2 of
[`docs/agents/spec-packages.md`](../agents/spec-packages.md). This file records what the
artifact says, what was considered and dropped on the way, and what has been amended since.

## The rule the whole package exists for

**No page holds a database handle.**
[Data-access layer and cross-project read strategy](https://github.com/nopivnick/lineup-prototype-03/issues/9)
made that structural rather than disciplinary: both `drizzle()` instances live in one
`server-only` module imported by the read modules and the writers and by nothing else, with
an ESLint `no-restricted-imports` rule so **a page importing one fails the build**.

That pays a debt [#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)
knowingly left. Weighing RLS, it conceded RLS's strongest argument — *over-grants are
silent, and a forgotten `WHERE` is the silent-est of all, since nobody has to click
anything to leak rows* — then ruled RLS out and handed #9 the question of where the read
predicates are *applied*. So the forgotten-`WHERE` risk landed here, with the database
unable to help. The only answer that is not discipline is that **pages never write a
`WHERE` clause at all**, because they never hold a handle.

**The same rule now fences a second door.**
[#107](https://github.com/nopivnick/lineup-prototype-03/issues/107) put the moment a write
happened on the transaction rather than on each writer, and restricted the *dated* opener to
`db/seed.ts` — so a Server Action cannot hand a writer a date at all, and the one way to
write a plausible lie into the transition log is a build error rather than a convention. Two
doors, one mechanism.

It is the map's habitual move: [#15](https://github.com/nopivnick/lineup-prototype-03/issues/15)
narrowed an event union so *divergence has no code path*,
[#28](https://github.com/nopivnick/lineup-prototype-03/issues/28) made an unclassified
column unwritable, [#30](https://github.com/nopivnick/lineup-prototype-03/issues/30) bought
a composite foreign key so a rule could not be got wrong. Take the mistake off the table
rather than warn about it.

## Why view-shaped and not table-shaped

A repository per table — `offeringRepo`, `personRepo`, generic find/list methods — is
**shallow**: the interface is nearly as large as the implementation, and it hands the
interesting part back, since combining offerings with people is exactly what the caller
would still be doing.

On the deletion test: delete a view-shaped module and the stitch plus three tier predicates
reappear in every reading page, re-derived slightly differently each time; delete a
table-shaped one and a thin wrapper over one query is lost.

Returning the parts — table rows plus a `Map<netid, name>` for each view to assemble — was
rejected as the shallow shape the seam exists to prevent, and two views disagreeing about
what a row *is* would each have invented their own assembly.

**Recorded explicitly for the build effort: these are modules, not abstractions with
swappable implementations.** There is one adapter, Postgres. No interface-plus-in-memory-fake
ceremony — an agent handed the word *repository* tends to produce that unbidden, and here it
is pure cost.

## Identity rides here, not in permissions

`getActor(): Promise<{ netid } | null>` is **the app's only identity import**
([#11](https://github.com/nopivnick/lineup-prototype-03/issues/11)) — exactly one
implementation at a time, no `if (dev)` anywhere, gated on `ALLOW_DEV_ACTOR`.

**Filing it under permissions would undo #11 by placement.** #11 deliberately kept roles
*outside* `getActor()` so it would not pre-answer
[#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)'s RLS question on its
behalf — *a blocking ticket should hand its dependent a fact, not a constraint it never
asked for*. #28 then found the choice had been **forced** rather than merely polite: the
permission check reads `user_role`, `program_director`, `course.area_head` and roster
position 0 *inside* the locking transaction, and `getActor()` runs at request scope, so a
role set resolved there would be stale by the time it was used. The two stay separate here
for the same reason, and this paragraph exists so a later reader does not fold them back
together.

The structural fact is the **single implementation, not the throw**: wiring SSO means
replacing the body, and *the dev path is still in* and *SSO is wired* cannot both be true.
The gate keys on `ALLOW_DEV_ACTOR` and not on `NODE_ENV`, because Vercel sets
`NODE_ENV=production` on previews too and a `NODE_ENV` gate would brick the exact
deployment the skeleton exists to be shown on.

**The inherited risk sits beside the seam:** that gate is chosen *so preview deploys carry
it*, which means a preview URL lets anyone with the link be any user. Recorded in
[`docs/README.md`](../README.md#what-the-build-effort-inherits) as the one inherited
constraint that is a live risk rather than a design note — linked here rather than
restated.

## What the artifact holds

| Export | What it settles |
|---|---|
| `Actor`, `getActor`, `DEV_ACTOR`, `getActorRoles` | the identity seam, and why roles sit outside it |
| `CLIENT`, `CONNECTIONS`, `MODULE_BOUNDARY`, `MIGRATIONS` | Drizzle over postgres.js, four connection strings, the lint rule, `db:reset` |
| `STITCH`, `StitchedName`, `StitchedPerson` | two round trips, `classes` driving, and a nullable `displayName` |
| `Refusal`, `PermittedAction`, `EditAffordance`, `Visible` | what every read ships beside the record |
| `READ_MODULES`, and the seven `get*Page` signatures | the layer itself |
| `CatalogRow`, `LineupRow`, `LineupGroup`, `CoursePage`, `OfferingPage`, `ProposalGroup`, `ReviewPage`, … | the composed rows, none of which is a table row |
| `leadOf` | the lead is whoever holds position 0, never `roster[0]` |
| `WRITE_PATHS`, `applyTransition`, `createOffering`, `createProposal`, `writeFields` | the four chokepoints and what they take |
| `At`, `OpenTransaction`, `WRITE_TRANSACTIONS` | the moment a write happened, why it rides on the transaction, and why only the seed can set one |
| `FIELD_WRITER_REFUSALS` | the actorless refusals the field writer carries |

**Row types reference the schema and the machines rather than restating them.** The event
unions come off the machines through `EventFromLogic`, the Course and review state unions
through `StateValueFrom` (only `offering.machine.ts` exports its own), and the fourteen
field-class names off `FIELD_CLASSES` in
[`docs/permissions/permissions.ts`](../permissions/permissions.ts). A state renamed in a
machine is a compiler error here rather than something discovered while building.

The one place this package states a schema rule a second time is `Meeting`, which is
`offering_meeting`'s shape CHECK as a discriminated union. The alternative is a row type
with five nullable columns whose renderer has to re-derive the kind — the exact legacy
failure [#10](https://github.com/nopivnick/lineup-prototype-03/issues/10) declared a `kind`
column to fix. The schema is authoritative; this is the read model's shape.

## The findings that shaped it

**The client was decided by writes, not reads.** The ticket framed the problem as *show me
offerings with their instructors' names*, which has three viable answers. The write has
one. supabase-js speaks HTTP to PostgREST — no `SELECT … FOR UPDATE`, no multi-statement
transaction — so every transition would become a plpgsql RPC, moving `applyTransition`'s
body into the database against #28's *one TypeScript module*. Prisma's schema language
expresses neither generated columns nor check constraints, so `status` — the column the
whole persistence design projects state through — would survive only as hand-edited
migration SQL the generated client's types would lie about.

**The version skew is answered by making the divergent API unreachable.** The docs describe
Drizzle 1.0 and `npm install` gives 0.45. The material difference between the lines is the
relational query builder, so handing `drizzle()` no schema means `db.query.<table>` does not
exist on the object and the one API the docs are wrong about cannot be reached by accident.
A bounded lie about one unreachable API beats an unbounded one about the library.

**The stitch costs two round trips, not N+1**, and the cost is narrower than
[#5](https://github.com/nopivnick/lineup-prototype-03/issues/5) implied, because netid
lives in `classes`: filtering by netid is an ordinary single-database query, and filtering
by **name** works by running the two queries in the other order. A denormalised copy of
names in `classes` was rejected on standing principle 1 — which bites hardest here, since
no transaction *can* span two databases. Legacy corroborates: `lineup_official`
denormalised instructor **netids** and never names.

**Integrity across the gap: the writer checks, the read tolerates and never hides.**
`offering_instructor.netid` cannot be a foreign key. On the way in, the single writer
refuses a netid `people` does not know — **a check, not a constraint**, since it cannot
join a transaction on the other database. On the way out, `displayName` is nullable and a
roster entry is never dropped: skipping unresolvable people would leave an offering sitting
in `Staffed` rendering an empty roster, a cosmetic problem masquerading as the lifecycle
being broken.

**The Catalog and the Lineup are two views, not one.** #9's motivating example silently
assumed the skeleton's list has an Offering per row. The Catalog lists Courses eligible to
be offered and is term-less; the Lineup lists Offerings in a selected term. Legacy drew the
same line under the same word, and it is the name of this repository.

## Amendments

Recorded so the artifact is never the only place a change is visible. An amendment
**replaces** what it overturns; it never stands beside it.

- **`LineupRow` lost its course-level facts** — by
  [What do the Catalog and Lineup views display?](https://github.com/nopivnick/lineup-prototype-03/issues/37).
  #9 sketched the row as carrying course title, number, term, program and state alongside
  the offering's own facts. Grouping on `(course_id, term_code)` moved every course-level
  fact onto the group header, stated once, and left the section row carrying only what
  differs between siblings. The same ticket found that **a group empty for the actor must
  not render at all** — an empty group announces that the department is staffing something
  the student may not see, which is #9's *invisible rows are absent, never flagged* applied
  to the container rather than the row.

- **The Catalog is a single-database read** — by
  [#37](https://github.com/nopivnick/lineup-prototype-03/issues/37), at the requester's
  direction and against the recommendation. #9 had priced the batch fetch as free (*no page
  changes either way*); not paying it makes the Catalog the one view immune to the
  cross-project failure mode, and the Lineup the only list that consumes the stitch. The
  gap that opened — *which of my courses cannot be offered yet?* — closes without a person,
  as a derived `not offerable yet` marker over two `classes`-side inputs.

- **Sorting by instructor name: ruled impossible, then merely not built** — #9 ruled it
  lost, on the ground that sorting precedes paging and the names are not in the database
  doing the sorting. #37 then removed the premise by not paging, and still did not build
  it, because grouping leaves nowhere to put it: a course group has several sections and
  several instructors. **The two decisions are independent** — an effort that ungroups the
  Lineup gets name sorting back at no cost, and one that adds a pager loses it again.

- **The roster is rows carrying their own `position`, and the lead is whoever holds 0** —
  by [Who writes co-instructor roster rows?](https://github.com/nopivnick/lineup-prototype-03/issues/61),
  amending #9's *ordered array, index 0 the lead* and
  [#41](https://github.com/nopivnick/lineup-prototype-03/issues/41)'s `roster[0]`. `decline`
  and `withdraw` each `DELETE` position 0 and leave everything below it, so a gap at 0 is
  what the machine's own edges **produce** — an array indexed by convention cannot express
  it, and `roster[0]` silently reports a co-instructor as the lead. `leadOf` is the shape
  that replaced it, in the prototypes package first and in the row type here.

- **`getReviewPage` returns the same record at two fidelities** — by
  [What do the proposals list and the review detail page show?](https://github.com/nopivnick/lineup-prototype-03/issues/42),
  which split #28's one predicate per tier into a **may-read** and a **may-act** and gave
  the split content on Tier 3 alone. A review outside your arms, on a proposal you can
  reach, opens read-only. Refusing the page after the list has already shown the verdict
  chip would be incoherent.

- **The four write paths take a transaction that knows when it is** — by
  [Do the four write paths take the moment a write happened?](https://github.com/nopivnick/lineup-prototype-03/issues/107),
  amending the four signatures this package had declared with four parameters and the fifth
  parameter [#78](https://github.com/nopivnick/lineup-prototype-03/issues/78) had added to
  each of them while building the seed. The first parameter is now an `OpenTransaction` — the
  handle **and** the moment it is open at — and no write path takes a moment of its own.

  The collision that forced it: the seed is checked like any other caller
  ([#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)), and the seed's dates
  are literal ([#49](https://github.com/nopivnick/lineup-prototype-03/issues/49)). Every
  timestamp column defaults to `now()`, so a world driven through the writers would carry the
  instant of `db:reset` on all 218 transition-log rows — a log saying the department did
  everything at once, in the one artifact the skeleton ships that a snapshot fixture could not
  have produced.

  **One moment per transaction is what actually happened**, which is why the moment sits
  there rather than on each call: one transaction is one act, and there is no second argument
  for a caller to pass differently the second time. The evidence that this costs nothing was
  in the tree already — no caller anywhere touches the transaction handle for anything except
  passing it to exactly one writer, so the change reached no call site's body.

  **The dated opener is fenced to the seed**, which is the third candidate #107 weighed folded
  in rather than dropped: `writeToClassesAt` lives in its own module behind the same
  `no-restricted-imports` rule that keeps handles out of pages, because a caller-supplied date
  is the one way to write a *plausible* lie into the transition log. The candidate that lost
  outright was moving the clock into Postgres — rewriting every `*_at` default to read a
  per-transaction setting, which works and which #13, #28 and #30 have each already refused
  in a trigger's shape, on *where would a reader find it*.

- **`db/read/` holds the seven view-shaped modules and two dev ones** — by
  [Be somebody: the dev identity reader and the thirteen-person switcher](https://github.com/nopivnick/lineup-prototype-03/issues/79),
  amending this package's *the seven view-shaped read modules* where it describes the layer's
  contents. The switcher needs a list of people and each person's roles, and **no view lists
  people** — the Catalog is person-free by [#37](https://github.com/nopivnick/lineup-prototype-03/issues/37)
  and the Lineup lists offerings. So `db/read/directory.ts` is a real read module by the
  boundary rule that matters (it is where the handle may be held, and a page still writes no
  `WHERE` clause) and is not one of the seven by the rule that names them.

  Both of its reads are **anonymous, subject to no tier**, which is not a new licence:
  `READ_TIERS` tier 1 already named them — *two anonymous reads survive, both dev-only
  machinery the SSO swap deletes: the dev bar's user list and its role labels*. What #79
  adds is where they live. The alternative, reading the list out of `db/fixtures.ts`, was
  rejected for coupling identity to fixture ordering — the same ground #11 rejected an index
  into a fixture array on.

  **`getActorRoles` moved with them**, to `db/read/actor-roles.ts`, and is unchanged: still
  keyed by netid, still `cache()`d, still emphatically the read side. The write side re-reads
  inside the locking transaction and does not call it. The **module boundary was widened by
  nothing** — `db/read/**` was already inside it in `eslint.config.mjs`, and #79 shut a second
  door rather than opening one: `cookies` is now a restricted import everywhere but
  `lib/auth/`, so *`getActor()` is the app's only identity import* fails the build rather than
  being a claim in a doc comment.

- **`db/read/` now holds two shared modules beside the views, and neither is one of them** —
  by [The Catalog](https://github.com/nopivnick/lineup-prototype-03/issues/81), extending the
  amendment above by the same rule it settled: what makes something one of the seven is that it
  is a *view*, not that it lives in `db/read/`.

  `db/read/shape.ts` holds what every read module ships **beside** the record — `Refusal`,
  `PermittedAction`, `OwnTag`, and the Tier 2 predicate that decides whether a list renders an
  Actions column at all. It is this package's own *what every read ships beside the record*
  section as code, and it exists because six views inherit it from the first one. `Refusal` is
  **re-exported from the writer's module rather than declared a second time**: [#14](https://github.com/nopivnick/lineup-prototype-03/issues/14)'s
  rule is that the refused thing and its explanation are one value, and two types shaped alike
  is the drift that rule exists to forbid.

  **`db/read/stitch.ts` joined them by
  [#82](https://github.com/nopivnick/lineup-prototype-03/issues/82)** — see that amendment
  below. It is what six of the seven views do to a set of netids, and it is not one of them.

  `db/read/actor-facts.ts` is the **read side's** copy of the writer's `ActorFacts`, so a row can
  say ahead of the click what an actor may do. It resolves at request scope and is therefore an
  **affordance**, never a decision: the write-side read stays inside the locking transaction, and
  a grant revoked between the render and the click makes the menu stale and the writer refuse.
  That is [#11](https://github.com/nopivnick/lineup-prototype-03/issues/11)'s separation used as
  intended rather than a second identity seam, and no write path may call it.

  **Two smaller things #81 had to settle and neither is a decision.** `getCatalogPage`'s module
  also exports `listCatalogPrograms`, because the program filter's options are *every* program
  and a filter whose options are the result of the filter can only be escaped by clearing it —
  the alternative was a page holding a handle. And the event-name union this package calls
  `CourseEvent` is named `CourseEventName` in the application, because `db/write/apply-transition.ts`
  already owns `CourseEvent` for the richer thing a transition carries: the event **and** its
  payload. A list row offers a move; the writer takes the move and what came with it.

- **The stitch is one `classes` statement and one `people` statement, and the search
  predicate is applied after both** — by
  [The Lineup, and the cross-project stitch](https://github.com/nopivnick/lineup-prototype-03/issues/82),
  which built `STITCH`'s *two round trips per page* as a property a test counts rather
  than a claim a comment makes.

  **What changed is where the `classes` side's statements went.** `db/read/catalog.ts`
  issues four queries and says so; `db/read/lineup.ts` issues **one**, with the roster,
  the meetings, the two seat-sharing tables and the course's own two tag sets aggregated
  as JSON beside their parent row. Nothing about the decision moved — `classes` still
  drives, the netids are still batched, the match is still in memory — but *two round
  trips* is now literally what `db/read/lineup.test.ts` counts, by wrapping both handles
  and subtracting the actor's facts, which are `cache()`d and shared with every other
  read on the page and are therefore **measured** rather than assumed away. A test that
  counted one thing while the code did five would have been worth less than the sentence
  it was written in.

  **The search box is the part that needed a decision.** #37 wants one box over *title,
  number, instructor name and instructor netid*: three of the four live in `classes`,
  the fourth lives in `people`, and they are OR'd — so no single database can answer,
  and a `WHERE` on either side alone drops the rows the other side matches. #9's answer
  was to run the two queries **in the other order**, resolving names to netids first,
  and it bought that third round trip to keep **paging and counts accurate** — a premise
  #37 removed by not paging. This package's own `STITCH` note already spends that removal
  once, on an in-memory *sort* by name being free; #82 spends it again on the filter, so
  the driving query narrows by term, program and state and the OR is computed after the
  stitch. **It stops being the right shape at exactly the threshold a pager becomes
  necessary**, and the recovery is the one already recorded: page by course, never by
  section.

  **`leadOf` is `lib/roster.ts` and is re-exported from the read module.** The row type
  is where it was to be prevented from coming back, and the place it actually came back
  was the *renderer* — #41 shipped an empty state that fired on `roster.length`, so a
  section with two co-instructors and no lead read as an ordinary staffed roster. So the
  function ships to the browser, along with `rosterShape`, which makes *rows below a
  vacant position 0* an **arm of a union** rather than a conditional somebody has to
  remember: a renderer that ignores it does not compile. Nothing there is a rule — no
  role, no state, no matrix — so it holds no `server-only`, and `db/read/lineup.ts`
  re-exports `leadOf` so a reader following this package finds it beside the row type it
  governs.

  **Two smaller things, and neither is a decision.** `ForeignTag`, `Meeting` and
  `StitchedName` are the shared shapes this package declares beside the record, so they
  live in `db/read/shape.ts` and `db/read/stitch.ts` rather than in the Lineup's module —
  `db/read/` now holds **three** shared modules beside the views, by the same rule #81
  settled. And `Meeting` is **re-exported from the writer's module rather than declared a
  second time**, exactly as `Refusal` is: the create path already owns the discriminated
  union that `offering_meeting`'s shape CHECK enforces, and two types shaped alike is the
  drift #14's rule forbids.

- **`getRolesPage` takes the search box, and its third conditional query is the program
  strip's own read** — by
  [The roles page](https://github.com/nopivnick/lineup-prototype-03/issues/87), which built
  this package's third read module.

  **The signature gains a filter.** `getRolesPage(actor)` is written here with none, and the
  screen it serves has one control above the person list — a box that does two things,
  because [#38](https://github.com/nopivnick/lineup-prototype-03/issues/38) settled both:
  it narrows the holders, and for a chair it **reaches past them into `people`**, which is
  what makes granting possible with no free-text netid field. So the module takes
  `RolesFilters` for the same reason `getCatalogPage` and `getLineupPage` take theirs — the
  page writes the query string and the module is the only thing that may write a `WHERE`
  clause. Nothing about the decision moved; the reach costs a **second `people` statement**,
  issued only when a chair has typed something.

  **The dependency reads are two, not three.** #38 priced *three further `classes`-side
  queries — live roster rows, non-retired headed courses, director rows — all set-based over
  the holder set, and all skipped entirely for a non-chair*. The third is a read the page
  already makes: the **program strip** is `program_director` in full, and it is read for every
  reader, the strip being read-only rather than the chair's. Asking again, scoped to the
  holder set, would be a second copy of the same rows bought to make a count come out even.
  So the strip's rows answer `program_director`'s revocation refusal, exactly as the rows the
  page already holds answer the last-chair lock — which #38 itself describes as *a count over
  rows the page already has*. **What is conditional stays conditional**: a non-chair issues
  neither of the two, and `db/read/roles.test.ts` counts round trips rather than trusting this
  paragraph.

  **`RolesPage` gains a list and `RoleGrant` gains two fields**, none of them a decision:
  `directory` is the search's reach — the matched people who hold **nothing**, which the
  artifact's `holders` cannot hold and which granting has to come from; and `kind` and
  `gatesNoAction` are `ROLE_KIND` and `HOLD_NOTHING_IN_THE_MATRIX` read by the server, so that
  *`advisor` and `student` are marked as gating no action* is a fact off the map rather than a
  string in a component. The blurb beside each role stays copy and lives with the screen.

  **`Visible<T>` and `StitchedPerson` are now code**, in `db/read/shape.ts` and
  `db/read/stitch.ts` respectively, by the rule #81 settled: what makes something one of the
  seven is that it is a view. `stitchNames` is `stitchPeople` with `pronouns` dropped rather
  than a second query one column narrower — the two differ in what a view may *display*, which
  is not a reason to visit `people` twice.

  **The four write paths are still four.** `db/write/authorization.ts` is *appointing a
  director* — the two rows of one act, the role row inserted only if absent — and it performs
  no check, writes no row and refuses nothing: it hands both rows to `writeFields`, where the
  chair's clause and standing principle 6 still live. It exists because the alternative was a
  Server Action deciding which rows an act needs, and an action is an **actor-resolution
  wrapper and nothing more** (#28, #81). Principle 6 is now evaluated against the state a
  write **leaves** rather than the one it found — `monotoneAssignment`'s device, in the same
  function — which is what lets the two writes be one call at all.

  **The evidence behind a refusal is shared, not only its sentence.** `liveSeatsOf` and
  `headedCoursesOf` live in `db/write/rules.ts` beside the four refusal builders, and both
  sides call them: the field writer for the one netid being revoked, inside its locking
  transaction, and this read module for the whole holder set at request scope. The first
  version of this pair had two copies of the projection and they differed by an `ORDER BY`,
  which is precisely the drift #14's one-object rule exists to prevent, one level down from
  the sentence.

- **Two write paths became three, and this transcription counts a fourth** —
  [#61](https://github.com/nopivnick/lineup-prototype-03/issues/61) added
  [#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)'s single **field
  writer**, which had been settled since #28 and simply not counted, and named that
  omission as what let #61 happen. The same recount reaches `applyTransition`: it is the
  map's most-cited writer, settled by
  [#13](https://github.com/nopivnick/lineup-prototype-03/issues/13) and amended by #28, and
  it was uncounted here for the same reason. **No decision changed** — the signature is
  #13's verbatim and its full statement stays in
  [`docs/machines/README.md`](../machines/README.md), which is where a reader looks for
  transition rules. It is named in this package because a build effort reading *the write
  paths* should not have to discover the largest one elsewhere.

## Two things this transcription had to derive

Neither is a decision, and both are recorded here so that if either reads as one, it is a
ticket rather than a paragraph — per
[#50](https://github.com/nopivnick/lineup-prototype-03/issues/50)'s rule and
[#65](https://github.com/nopivnick/lineup-prototype-03/issues/65)'s precedent.

**1. The three edit routes add no read module.**
[#62](https://github.com/nopivnick/lineup-prototype-03/issues/62) added
`/courses/:id/edit`, `/classes/:id/edit` and `/reviews/:id/edit` and announced no read
module, where #38, #41 and #42 each announced theirs in their consequences. The derivation
is that it cannot need one: the **record** page already computes `EditAffordance`, because
#62 put the `Edit` control and its count in the record page's rail and every class's
refusal there when nothing is yours. An edit module would return a subset of what the
record module already returns.

**2. The Catalog's search box covers title and number only.** #37's filter sentence reads
*"a search box over title, number, instructor name and instructor netid"* across both
views. A Course has no instructor — the only netid it carries is `area_head`, which the
same ticket dropped from the row — and that resolution made `getCatalogPage` person-free in
terms strong enough to warn a build agent off the batch fetch. The intersection of the two
statements is title and number. Recorded rather than silently narrowed, because a later
ticket restating an earlier one's rule in its own words is where a package silently forks.

## What this package does not hold

- **The rules.** Who may fire what, the read tiers, the field-class map and the invariant
  list are [`docs/permissions/permissions.ts`](../permissions/permissions.ts). This package
  says where they are enforced and what shape the answers travel in.
- **The wording.** Refusal sentences, the two-fidelity rendering and the record-level
  refusal that names no state live in `docs/prototypes/`, and are pointed at from
  `RENDERED_ELSEWHERE` in the permissions artifact.
- **The columns' definitions.** [`docs/schema/`](../schema/README.md) is authoritative for
  every type and constraint; the row types here name columns and do not restate them.
- **The lifecycles.** [`docs/machines/`](../machines/README.md), including the full
  statement of `applyTransition` and the standing principles this package reasons by.
