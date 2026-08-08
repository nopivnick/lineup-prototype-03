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
| `FIELD_WRITER_REFUSALS` | the actorless refusals the field writer carries |

**Row types reference the schema and the machines rather than restating them.** The event
unions come off the machines through `EventFromLogic`, the Course and review state unions
through `StateValueFrom` (only `offering.machine.ts` exports its own), and the thirteen
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
