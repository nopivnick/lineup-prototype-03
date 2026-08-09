# CONTEXT.md — the glossary

The vocabulary this repo uses, and nothing else. Every entry names the ticket that minted
it; where a term has a package, the package is authoritative for how it works and this file
is authoritative only for what it *means*.

**There is no spec here.** No columns, no rules, no rendering. Those live in the six
packages indexed by [`docs/README.md`](./docs/README.md), and a definition that started
restating one would be the second copy that
[`docs/agents/spec-packages.md`](./docs/agents/spec-packages.md) forbids.

**Several of these words are narrower than their ordinary meaning**, and a few are words
this map has ruled *out* of its world. Both kinds are defined, the excluded ones at the
bottom under [Excluded and near-miss words](#excluded-and-near-miss-words) — a glossary that
defines only what is in scope leaves the near-miss words undefended, which is what they were
written down to prevent. See [`docs/agents/domain.md`](./docs/agents/domain.md) for the
contract that sends you here.

---

## The department

**ITP / IMA / LowRes** — the three programs sharing NYU's ITP/IMA department. ITP is
Interactive Telecommunications, a two-year graduate program; IMA is Interactive Media Arts,
a four-year undergraduate program; LowRes is IMA Low Residency, a one-year low-residency
graduate program. LowRes differs from the other two in **how it meets**, not when
([#3](https://github.com/nopivnick/lineup-prototype-03/issues/3)).

**Program** — a first-class thing, not a string on a row: the department's three programs,
each with its own catalog, its own areas and its own requirement categories
([#7](https://github.com/nopivnick/lineup-prototype-03/issues/7)). Every Course sits in
exactly one program's catalog, and the three catalogs are distinct lists rather than one
shared list partitioned by a view.

**Term** — one Fall, Spring or Summer of one year, identified by a five-character code:
four-digit year plus a semester ordinal, so `20253` is Fall 2025
([#3](https://github.com/nopivnick/lineup-prototype-03/issues/3)). All three programs run
the same three terms. A term has no dates in this map, which is why **"the current term" is
not computable** anywhere in the skeleton. On *semester*, which is not a synonym, see
[below](#excluded-and-near-miss-words).

---

## Course and Offering

**Course** — a catalog entry: a thing that may be offered, sitting in exactly one program's
catalog ([#7](https://github.com/nopivnick/lineup-prototype-03/issues/7)). Every Course in
this world is **minted** by an approving review; nothing creates one directly
([#7](https://github.com/nopivnick/lineup-prototype-03/issues/7),
[#49](https://github.com/nopivnick/lineup-prototype-03/issues/49)).

**Offering** — **one taught class in one term**
([#2](https://github.com/nopivnick/lineup-prototype-03/issues/2)). It is the entity the
skeleton schedules, staffs, publishes and concludes, and it is 1:1 with the legacy
`section` — the whole cost of that rename is this glossary line: **`offering` ≡ legacy
`section`.** *Section* was retired as an entity name because in US higher-ed vocabulary it
presupposes a course×term container, which is exactly what
[#2](https://github.com/nopivnick/lineup-prototype-03/issues/2) rejected.

**Class** — what the screens call an Offering in user-facing copy: *slate a class*,
`/classes/:id` ([#43](https://github.com/nopivnick/lineup-prototype-03/issues/43),
[#62](https://github.com/nopivnick/lineup-prototype-03/issues/62)). The same entity, the
everyday word for it. `offering` remains the name of the table, the machine, the row types
and this spec ([#2](https://github.com/nopivnick/lineup-prototype-03/issues/2)); *class* is
a label, not a second thing.

**Course × term** — deliberately **not** an entity. What a student calls *"Physical
Computing, Fall 2025"* is a query and a grouping key, with no table, no lifecycle and no
name ([#2](https://github.com/nopivnick/lineup-prototype-03/issues/2)) — naming it would
tempt someone to build it.

**Section number** — the human-facing label printed in a catalog and used by SIS, surviving
as an ordinary field on an Offering
([#2](https://github.com/nopivnick/lineup-prototype-03/issues/2)). Banishing *section* as an
entity name did not banish it as a label.

**Edition** — a Course's revision count, bumped when a course is re-approved
([#10](https://github.com/nopivnick/lineup-prototype-03/issues/10)). An edition is a thing
that was published and stood, which is why it advances on approval rather than on the edit.

**Roster** — the instructors attached to an Offering, each carrying a **position**
([#2](https://github.com/nopivnick/lineup-prototype-03/issues/2),
[#61](https://github.com/nopivnick/lineup-prototype-03/issues/61)).

**Lead** — whoever holds **position 0** of a roster. The lead is who an offer is made to and
who answers it; everyone else on the roster is a **co-instructor**, attached and non-gating
([#2](https://github.com/nopivnick/lineup-prototype-03/issues/2)). Position 0 can be
*vacant* with rows beneath it, so *the lead* is never "the first roster row"
([#61](https://github.com/nopivnick/lineup-prototype-03/issues/61)).

---

## Proposal and review

The two words are not interchangeable, and the difference is where state lives.

**Course proposal** — the thing someone writes: a shared body, proposed once, requesting one
or more programs ([#7](https://github.com/nopivnick/lineup-prototype-03/issues/7)). **A
proposal carries no state of its own** — *fully rejected* and *still pending somewhere* are
questions you ask of its reviews.

**Course proposal review** — one program reading one proposal. There is a review per
`(proposal, program)` pair, each reaching its own verdict, **independently and at different
times**, and the reviews are allowed to disagree — ITP may reject what IMA approves
([#7](https://github.com/nopivnick/lineup-prototype-03/issues/7)). All the state of the
proposal stage lives here.

**Mint** — what an approving review does: it creates a Course in that program's catalog,
**copying** the proposal's body rather than referencing it, because variants in different
programs are meant to diverge
([#7](https://github.com/nopivnick/lineup-prototype-03/issues/7)). Three approving programs
mint three Courses from one proposal.

---

## Areas, categories and shared seats

**Area** — a program's own subject grouping for its courses, named and program-scoped
([#7](https://github.com/nopivnick/lineup-prototype-03/issues/7)). Program-scoped rather
than department-wide at the requester's direction, on the ground that the programs maintain
their own lists.

**Area head** — the person assigned to review a specific course, scoping the `area_head`
role ([#4](https://github.com/nopivnick/lineup-prototype-03/issues/4)). The assignment is
**per course**, not per area — *"area" in that name is vestigial*
([#7](https://github.com/nopivnick/lineup-prototype-03/issues/7)) — and a course must have
both an area and a head before it can be offered
([#32](https://github.com/nopivnick/lineup-prototype-03/issues/32)).

**Requirement category** — a named bucket a program declares its degree to require, carrying
credits and a group ([#7](https://github.com/nopivnick/lineup-prototype-03/issues/7)).
Structurally a twin of an area and deliberately a different axis: an area says what a course
*is about*, a category says what it *counts toward*.

**Seat sharing** — **one program's offering opening seats to another program within the
department**, recorded as that other program's category and area tags on the offering, and
nothing else ([#25](https://github.com/nopivnick/lineup-prototype-03/issues/25)). The tags
are the entire record that the other program's students may enrol; **no count of shared
seats exists anywhere**. It is not cross-listing — see
[below](#excluded-and-near-miss-words).

---

## People and authority

**netid** — NYU's per-person identifier, and the **only** value joining the two databases
([#3](https://github.com/nopivnick/lineup-prototype-03/issues/3),
[#9](https://github.com/nopivnick/lineup-prototype-03/issues/9)). It is a person's identity
throughout this system.

**Person** — a directory row in the `people` project. Nothing in the skeleton writes one:
rows arrive from the seed, and in a real deployment from an NYU feed
([#10](https://github.com/nopivnick/lineup-prototype-03/issues/10)). A netid can therefore
name someone the directory does not know.

**Actor** — whoever is acting, carried as a bare netid and nothing more
([#11](https://github.com/nopivnick/lineup-prototype-03/issues/11)). Roles are resolved
where they are used, never bundled into identity.

**Role** — one of **seven**: `student`, `instructor`, `advisor`, `coordinator`,
`program_director`, `area_head`, `chair`. A person may hold several
([#4](https://github.com/nopivnick/lineup-prototype-03/issues/4),
[#8](https://github.com/nopivnick/lineup-prototype-03/issues/8),
[#34](https://github.com/nopivnick/lineup-prototype-03/issues/34)). A role is flat; **scope
always comes from a relationship** — *instructor* and *instructor of this class* are
different claims, and every permission in the map is the conjunction of the two
([#4](https://github.com/nopivnick/lineup-prototype-03/issues/4)).

**Capability** — a role that is **actor-side and flat**: holding it lets you act, anywhere it
applies. `coordinator` is the only one, and the chair subsumes it entirely
([#34](https://github.com/nopivnick/lineup-prototype-03/issues/34)).

**Qualification** — a role that is **subject-side**: holding it is what makes you eligible to
be *named* in a relationship — staffed onto a class, assigned to head a course, appointed to
direct a program ([#34](https://github.com/nopivnick/lineup-prototype-03/issues/34)).
`instructor`, `area_head`, `program_director` and `advisor` are qualifications. Two
consequences the map leans on: **nobody bypasses a qualification**, since it constrains what
may be done *to* a person rather than what they may do; and **a qualification survives the
loss of its scope**, so un-appointing a director leaves the role standing exactly as
finishing a term leaves `instructor` standing
([#51](https://github.com/nopivnick/lineup-prototype-03/issues/51)). A capability is not a
qualification, and the map's roles are not all one kind.

**Coordinator** — the department's operational seat: the person who does the Offering's
bookkeeping across all three programs. The line between coordinator and program director is
**execution versus decision**
([#8](https://github.com/nopivnick/lineup-prototype-03/issues/8)).

**Program director** — the person who directs one program, appointed by the chair
([#4](https://github.com/nopivnick/lineup-prototype-03/issues/4),
[#34](https://github.com/nopivnick/lineup-prototype-03/issues/34)). Their authority is
scoped to their own program's records, with exactly one exception: a foreign seat-sharing
tag is written by the director of the *tag's* program
([#25](https://github.com/nopivnick/lineup-prototype-03/issues/25)).

**Chair** — the department's authority over the role tables themselves, and the sole writer
of role grants and director appointments
([#34](https://github.com/nopivnick/lineup-prototype-03/issues/34)).

**Chair bypass** — the chair's standing permission to do anything any role may do. It
reaches **permissions only**: never machine legality, never an invariant
([#34](https://github.com/nopivnick/lineup-prototype-03/issues/34)). A chair who does not
hold `instructor` still cannot be staffed on a class.

---

## Lifecycles

**Machine** — one of the three lifecycles the map models: the Course, the Offering, and the
Course proposal review ([#7](https://github.com/nopivnick/lineup-prototype-03/issues/7)).
[`docs/machines/`](./docs/machines/README.md) is authoritative.

**Transition** — a lifecycle event moving a record from one state to another. **Creating a
record is an act, not a transition** ([#13](https://github.com/nopivnick/lineup-prototype-03/issues/13)),
and so is granting a role ([#34](https://github.com/nopivnick/lineup-prototype-03/issues/34))
— neither has a transition to speak of, which is why they are recorded differently.

**The transition log** — the record of every transition each machine makes: what happened,
who fired it, and where it was and went. There is one per machine, three in all
([#6](https://github.com/nopivnick/lineup-prototype-03/issues/6),
[#10](https://github.com/nopivnick/lineup-prototype-03/issues/10)). Its vocabulary is
**exactly the machine's own** — that is what makes it load-bearing, and it is why the log is
**not an audit log**; see [below](#excluded-and-near-miss-words).

**Actor and subject** — a log row names who *fired* an event and, where the two differ, who
it was *about* ([#15](https://github.com/nopivnick/lineup-prototype-03/issues/15)). An admin
routinely records a refusal that arrived by email, so *who clicked* and *who said no* are
separate facts.

**Live states** — the Offering states in which the department is preparing or running the
class ([#14](https://github.com/nopivnick/lineup-prototype-03/issues/14)). The rule is **live
ends when teaching ends**, not *teaching right now*: an offering is live from the moment the
department decides to run it. A Course cannot be retired while it has live offerings.

**Committed states** — the Offering states in which *an instructor agreed to teach this, or
did once* ([#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)). The boundary
students and advisors see. The obvious alternative — *what has been published* — is not
expressible, because a canceled offering cannot say whether it was ever published.

**Staffed** — an Offering state meaning exactly **position 0 is occupied**, and nothing more
([#15](https://github.com/nopivnick/lineup-prototype-03/issues/15)). It sits between the
department deciding to run a class and asking anyone to teach it; swapping one lead for
another inside it changes nothing, because the state stays true.

**Deferred** — an Offering whose lead has been **asked and has not answered**: *"ask me
later"*, the lead's third answer alongside accepting and declining
([#21](https://github.com/nopivnick/lineup-prototype-03/issues/21)). It is not the
department putting a class on hold, and it is not a limbo after acceptance — after
acceptance the domain recognises only the university cancelling and the adjunct declining,
and those carry contractual consequences a vague state would obscure.

**Staff / unstaff** — the bookkeeping that seats or clears position 0. **Never user-facing**:
no human ever chooses them, and no code path writes the roster row without them
([#15](https://github.com/nopivnick/lineup-prototype-03/issues/15)).

**Withdraw** — the department **pulling an offer the lead has not answered**
([#19](https://github.com/nopivnick/lineup-prototype-03/issues/19)). Deliberately a distinct
act from `unstaff`, which nobody chooses and nobody was told about: one is tidying a
staffing plan no one had seen, the other is retracting an offer from someone waiting on an
answer, and only the second needs a paper trail. Withdrawing is also not declining —
recording a refusal that never happened moves a real person toward losing a contractual
right ([#21](https://github.com/nopivnick/lineup-prototype-03/issues/21)).

**Revise** — a lifecycle act on a **Course**: it re-opens the approval that being approved
asserts, and needs a fresh approval to close
([#17](https://github.com/nopivnick/lineup-prototype-03/issues/17)). Editing an **Offering**
is not a revision and is not a transition at all — it asserts nothing that needs
re-approving. An Offering has no `revise`, and correcting a finished class is an ordinary
edit rather than a lifecycle move.

---

## Rules vocabulary

**Permission** — a rule about **who may act**: the conjunction of a role and a relationship
([#4](https://github.com/nopivnick/lineup-prototype-03/issues/4)).

**Invariant** — a rule that **names no actor** and therefore holds regardless of who is
acting — a director cannot do it either, the chair cannot, and the seed script cannot
([#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)). Whether a rule names an
actor is the map's test for which of the two it is, and that filing is load-bearing rather
than tidy: it is what makes a superuser safe to have.

**Field class** — the grouping a writable column belongs to, each carrying a state rule and a
writer ([#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)). **A column with
no class is unwritable**, so this is a vocabulary of default-deny rather than of convenience.

**Read tier** — one of the three bands governing who may read which records
([#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)). A **product rule, not a
security boundary** — this skeleton has no confidentiality property to defend.

**Refusal** — a *stated* reason a control will not fire, shipped as one object with the thing
it refuses ([#14](https://github.com/nopivnick/lineup-prototype-03/issues/14)). Refusals in
this map name the person or the role and never quote the rule
([#37](https://github.com/nopivnick/lineup-prototype-03/issues/37)), and where the reason
depends on data elsewhere they name that dependency and list it
([#38](https://github.com/nopivnick/lineup-prototype-03/issues/38)). What a reader cannot
act on is **absent, never greyed**.

---

## The two views

They are two views, not one, and the map spent a ticket discovering it.

**The Catalog** — one row per **Course**, listing what may be offered. **Term-less**, grouped
by program ([#9](https://github.com/nopivnick/lineup-prototype-03/issues/9),
[#37](https://github.com/nopivnick/lineup-prototype-03/issues/37)).

**The Lineup** — one row per **Offering** in a selected **term**
([#9](https://github.com/nopivnick/lineup-prototype-03/issues/9),
[#37](https://github.com/nopivnick/lineup-prototype-03/issues/37)). Legacy drew the same
line under the same word, and it is the name of this repository.

**The stitch** — joining a class's roster to the people who teach it. The two databases
cannot hold foreign keys to each other, so names are fetched separately and assembled in
application code ([#9](https://github.com/nopivnick/lineup-prototype-03/issues/9)). The
Lineup is where it earns its keep; the Catalog never touches `people`.

**Walking skeleton** — what this whole map is a spec for: the thinnest end-to-end version of
the system that really runs — every layer present and connected, almost no breadth
([#1](https://github.com/nopivnick/lineup-prototype-03/issues/1)). It is why *"this is only
the skeleton"* is a scoping statement and not an apology.

---

## Excluded and near-miss words

Words a reader will otherwise import with their ordinary meaning. Each is defined so it can
be *recognised*, and each is out of this map's world.

**Cross-listing** — **seats in one Offering opened to students of a program *outside* the
department.** It is not a course belonging to two programs, and it is not seat sharing.
**Excluded**, see [#7](https://github.com/nopivnick/lineup-prototype-03/issues/7) — not
because it resembles registration, but because its counterparty is a program this system
will never model: there is nothing to point a cross-listing at, and no fixture that could
represent one. What happens *within* the department is
[seat sharing](#areas-categories-and-shared-seats), and that is in scope.

**Semester** — the **kind** of a term: Fall, Spring or Summer. It is not a term and never
stands in for one — a term is a semester *of a year*, identified by its code.
**Excluded as an identifier**, see
[#3](https://github.com/nopivnick/lineup-prototype-03/issues/3): the word survives only as
an attribute inside the `term` table, and legacy's habit of scattering year-and-semester
pairs across other tables is precisely what that ticket killed.

**Audit log** — a record of *what changed* in an ordinary field write. **The transition log
is not one**, and must not be widened into one:
[#10](https://github.com/nopivnick/lineup-prototype-03/issues/10) ruled a general audit trail
out of scope and refused to stretch the log to cover it, because the log's vocabulary is
exactly the machines' and that meaning is load-bearing. What the skeleton records instead is
*that* a row changed and by whom, never *what*. A later effort inherits a table to add, not
a table to reshape.

**`un_area_head`** — a legacy column, presumably *undergraduate area head*. It is a **lay
reviewer whose feedback is not a verdict** — a non-actor
([#4](https://github.com/nopivnick/lineup-prototype-03/issues/4),
[#7](https://github.com/nopivnick/lineup-prototype-03/issues/7)). **Excluded**, and the
column is dropped ([#10](https://github.com/nopivnick/lineup-prototype-03/issues/10)): it
has no meaning until there is somewhere for review feedback to live, and *how course review
feedback is captured* is itself out of scope
([#50](https://github.com/nopivnick/lineup-prototype-03/issues/50)). Do not read it as a
second area head.

---

*The decision log is the issue tracker, not this file and not a `docs/adr/` directory. Where
you would look for an ADR, read the relevant package README — see
[`docs/agents/domain.md`](./docs/agents/domain.md).*
