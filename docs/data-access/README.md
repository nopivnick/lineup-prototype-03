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
