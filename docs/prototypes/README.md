# Prototypes — what each screen displays

Six HTML files, one per screen ticket. They are **reference, not application code** — no
data layer, no framework, no persistence, in the same sense that `docs/machines/*.ts` and
`docs/permissions/permissions.ts` are reference artifacts (imported only by other `docs/**/*.ts`
files for typechecking, not by runtime code). Each is a static approximation of Next.js + Mantine
+ mantine-datatable, built to be reacted to. The build effort converts them; it does not lift them.

Each file holds **several variants and one settled shape**. The settled variant is the
answer; the others are kept beside it as the primary source it was chosen from or against,
because the argument for the winner is only legible next to what it beat.

This ledger was written by
[Give `docs/prototypes/` its missing ledger](https://github.com/nopivnick/lineup-prototype-03/issues/59),
and it exists because the package had an artifact and no ledger: five screens had settled and
**which variant won was recorded in a git commit message and an issue comment, nowhere in
this directory**. That is the concrete defect
[`docs/agents/spec-packages.md`](../agents/spec-packages.md) was written to fix, and this was
the package it was written about. Every claim below names the ticket that settled it, per
rule 2.

## The six files

| file | settles | ticket | variants | settled |
|---|---|---|---|---|
| `catalog-lineup-views.html` | the Catalog and the term Lineup | [#37](https://github.com/nopivnick/lineup-prototype-03/issues/37) | A B C **D** | **D** — assembled from all three |
| `roles-page.html` | the chair-only roles page | [#38](https://github.com/nopivnick/lineup-prototype-03/issues/38) | A B C **D** | **D** — assembled from all three |
| `course-offering-detail.html` | the Course and Offering detail pages | [#41](https://github.com/nopivnick/lineup-prototype-03/issues/41) | A B C **D** | **D** — assembled from three |
| `proposals-review.html` | the proposals list and the review page | [#42](https://github.com/nopivnick/lineup-prototype-03/issues/42) | A B C **D** | **D** — B's grouping, C's verdict chips |
| `create-forms.html` | propose a course, slate a class | [#43](https://github.com/nopivnick/lineup-prototype-03/issues/43) | **A** B C | **A** — won outright, one amendment |
| `field-edits.html` | the three edit pages | [#62](https://github.com/nopivnick/lineup-prototype-03/issues/62) | **B** A C D | **B** — won outright |

**Two of six won outright.** #37, #38, #41 and #42 each produced a hybrid the grilling
assembled and no variant showed, which is why those four files carry a **D** that was written
after the discussion rather than before it. #43 and #62 took one variant whole — #43 with a
single change, that a proposal lands on the proposals list rather than on a record.

## How to read one

- **Open it and it starts on the settled variant.** The floating bar and the ← → keys cycle;
  `catalog-lineup-views.html` also takes `?variant=`.
- **The *Viewing as* switcher is a prototype device, not part of any page.** It is real in the
  one way that matters: it re-filters the row set the way
  [#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)'s read tiers do and swaps
  the per-row permitted-action sets, so the same record offers different moves and different
  refusals to different people.
- **Each file's own header comment states what it inherits and does not re-decide.** Where a
  file carries an `AMENDED by` block, that is the same amendment recorded below.
- **The casts are hand-written and are not the seed.** They are continuous with each other,
  and they are not authoritative: [`docs/fixtures/`](../fixtures/README.md) is. Read layout
  here and cast there. See the #69 entry under *Amendments*.

## The Catalog and the Lineup — [#37](https://github.com/nopivnick/lineup-prototype-03/issues/37)

**Both views group, neither pages.**

**The Catalog** is one row per Course, term-less, grouped by program: number, title, credits,
areas, requirement categories, status, actions. It **displays no person** — decided at the
requester's direction against the recommendation, on the ground that the area head belongs on
a course's detail — which makes `getCatalogPage` the one view in the skeleton that never
touches `people`. The gap that opens (*which of my courses cannot be offered yet?*) closes
without a person, as a derived **`not offerable yet`** marker fired by an empty `course_area`
or a null `course.area_head`, its tooltip naming which is missing. `Retired` is hidden by the
filter's default and not by the query.

**The Lineup** is one row per Offering, term-scoped, grouped on `(course_id, term_code)`.
Course-level facts sit on the group header and are stated once; section rows carry only what
differs between siblings — section number, status, roster in `position` order, meetings, cap,
foreign tags, actions. `offering_meeting.kind` drives the meeting cell and the three kinds
read differently on purpose, which is the first thing in the skeleton that makes LowRes
visibly different from ITP and IMA.

**The two tag sets.** Own-program chips on the group header, foreign chips in the section
row's tag column directly beneath, under the header **"Also counts toward"**, each carrying
the other program's hue, a dashed edge, a `↳` and the program's name. Four signals for one
fact, so it does not rest on colour. Per
[#30](https://github.com/nopivnick/lineup-prototype-03/issues/30), foreign tags are the only
place a program other than the course's own appears, so every program name the Lineup renders
is a seat-sharing grant.

**Refusals: the `⋯ n` menu.** One control per row, `n` being how many moves the actor can
actually make; opening it lists every move the machine offers from that state, the permitted
ones clickable and the refused ones greyed with their reason beneath. `⋯ 0` says *nothing to
do here* without opening anything, which is the density the menu was chosen for.

**Roles change the row set and exactly one column.** Invisible rows are absent, never
flagged. The **Actions** column is absent — not empty — for anyone who can never act.

**Two empty states, not three.** A term with no offerings, and a view filtered to nothing.
The third the ticket asked for **must not exist**: a course whose every section is invisible
to the actor does not render as an empty group, because an empty group announces that the
department is staffing something the actor may not see.

**mantine-datatable, checked against its own docs.** `groups` groups *columns*, not rows —
there is no row-grouping feature — so the grouped Lineup is `rowExpansion` with
`trigger: 'always'`, records being courses. And **sorting is not done by the table**:
`sortStatus` / `onSortStatusChange` hand the app a column and a direction, so every sort in
this spec is the app's to implement.

## The roles page — [#38](https://github.com/nopivnick/lineup-prototype-03/issues/38)

**Person-centric, with every refusal stated in the open.** A read-only **program strip** of
three cards above a **person list** of role-holders, with the directory reachable through the
search box; selecting a person opens a **record** showing all seven roles held or not, what
each lets you do, its refusal where it has one, and `granted_by` / `granted_at`.

**It does not inherit #37's `⋯ n` menu**, and a build agent reading #37 alone would build it
here. #37 rejected reasons-in-the-open **for row height in a grouped table** and named it the
strongest option in its two-line variant; this page is one record at a time, so the premise of
the rejection is absent and the rejected option wins. What *is* inherited is
[#14](https://github.com/nopivnick/lineup-prototype-03/issues/14)'s one-object rule — the
refused thing and its explanation are one value, shipped together — which holds exactly.

**A refusal names its dependency and lists it.** This is the third clause of the map's
refusal wording, after #14's one-object rule and #37's *name the person or the role, never the
rule*. Three of the four refusals here are conditional on data the chair cannot see from this
page, so naming the person is not enough:

> Nora Applebaum heads the area of 3 courses that have not been retired. Hand those courses to
> another area head first.
> · ITPG-GT 2233 — Physical Computing (Approved) · ITPG-GT 2048 — Live Web (Approved) ·
> ITPG-GT 3080 — Sensors & Signals (Revising)

**Appointing a director is one control on the person**, two writes behind it, and the role row
rides along with the program — inserted only if absent — so the chair is never asked to think
about the difference between a newcomer and an existing director gaining a second program. The
program strip exists because nothing on a person-centric page is shaped like a program, and
half of every director permission in the matrix is a row nobody has written.

**All seven roles appear on every record**, with `advisor` and `student` marked as *gating no
action* rather than left off. **The chair's own record is listed, pinned and marked *you***,
and the last-`chair` lock renders before it is triggered rather than on the attempt.

**A netid with no `people` row renders and is never minted.** #37's *no name on file*
treatment exactly; granting goes through a search over `people` and there is no free-text netid
field, because a typo there grants a role to nobody and is indistinguishable from a legitimate
grant ahead of the directory feed.

**A non-chair sees the same page with controls *and* refusals absent** — not greyed. A refusal
explains why a control will not fire, and a refusal with no control is dead text. That is also
what makes the page's three dependency queries conditional: a non-chair issues none of them.

## The Course and Offering detail pages — [#41](https://github.com/nopivnick/lineup-prototype-03/issues/41)

**The page conventions are set here** and [#42](https://github.com/nopivnick/lineup-prototype-03/issues/42)
and [#62](https://github.com/nopivnick/lineup-prototype-03/issues/62) inherit them wholesale.

**A record on the left, what you may do about it on the right, its history in sentences at the
bottom.** Two columns: the main column is what the record *is*; a sticky rail holds status,
the permitted actions with their refusals stated beneath, and *last changed*. The rail is the
only shape in which refusals-in-the-open stay in view while the record is read, which is
[#40](https://github.com/nopivnick/lineup-prototype-03/issues/40)'s reason for buying a page
taken literally.

**Reached by a dedicated `↗` control at the row's right edge**, outside the expand target. The
linked identifier was free and lost on the mis-click — a small target inside a big one whose
click already means *expand*.

**History is a sentence per row**, full width, at the foot of the main column. Sentences invent
wording the machine never said and that is accepted; inventing a *fact* is not, which is what
forced the one amendment below. The history **opens with a derived creation line**, marked by a
hollow dot and nothing else, so the rail drops to *last changed* alone — and since
[#17](https://github.com/nopivnick/lineup-prototype-03/issues/17) deleted the transition a field
write used to fire, that timestamp is the only trace of the edits the log is forbidden to
record.

**The course's sections are grouped by term, newest first**, reusing the Lineup's grouping
device. *Current and next term only* was rejected because
[#3](https://github.com/nopivnick/lineup-prototype-03/issues/3) deferred term dates, so
**"current" is not computable**. The course page stays term-less and its sections are
term-grouped: the grouping displays the offerings' own key, it is not a term selector.

**One amendment to a closed ticket: `offer` and `accept` gained `subject_netid`.** The roster is
present-tense and the log is not, so a lead who was swapped leaves an `offer` row attributable
to nobody and an `accept` row attributable to whoever holds position 0 *now*. **That amendment
is recorded in [`docs/machines/README.md`](../machines/README.md)** — the lifecycle package owns
it, this package is only where the need surfaced.

**Three things vary by role, all absent rather than empty**: no history section for `student`
and `advisor` (Tier 2), no actions and no refusals, and **the record itself may be refused** —
new here, because a list row outside its tier is simply absent but a page has a URL and has to
answer. See *Two rules whose only statement is a rendering* below.

**Seven empty and failure states**, all deliberately distinct: a course never offered; a
section with nothing on its roster; **a section with rows below a vacant position 0**; a record
with no history; a netid with no `people` row, which lands here on a *history line*; an
unassignable course; and never changed. The third is #61's — see *Amendments*, which also
records why the count reads seven here and six in #61's own note.

## The proposals list and the review page — [#42](https://github.com/nopivnick/lineup-prototype-03/issues/42)

**The proposal is the group, its reviews are the rows, and every program's verdict sits on the
header whether or not the read rule reaches you.**

The shared body — title, credits, proposer, date — sits on the group header and is stated once;
the reviews nest beneath carrying only what differs by program: state, area and head, the
minted course number, the `⋯ n` menu, the `↗`. #37's grouping device reused, so the skeleton
has one grouping idea rather than two.

**Verdict chips on the group header** — `ITP ✓ · IMA ◐ · LOW ✗`, in #37's glyphs and hues.
This is the load-bearing part: it makes a grouped list a status board, and it **dissolves**
rather than solves the problem that a proposal has no state of its own and any derived one is
viewer-dependent. Per-program chips derive nothing, so the question stops existing. A later
effort that ungroups this list gets the problem back.

**Four filters** — `In play` (default), `Needs me`, `Rejected`, `Any state`. Finished reviews
stay in the query and out of the default, on #37's `Retired` precedent. `Rejected` gets its own
filter rather than folding into the catch-all, because unlike a retired course a rejected review
leads nowhere at all.

**Proposing starts here**, as a control beside the heading, and **the empty state carries it** —
an instructor who has never proposed sees a screen whose entire content is an explanation and a
button. The Catalog was rejected as a second door: it is the one person-free, single-database
read in the skeleton, and hanging a create action off it starts the drift toward it needing to
know who you are.

**The review page** takes #41's conventions unchanged and adds: the group header restated above
the record with your review highlighted; the shared body with a line saying how many programs
are reading it and which have sent it back; this program's area and area head; the minted
course, linked, in the rail; and the body-drift line. The creation line reads *"Rui Chen
proposed this and asked ITP to review it"*, which is the absence of a requested-programs table
made legible on the one screen where it matters.

**A review outside your arms, on a proposal you can reach, opens read-only.** Refusing it after
the chip has already shown the verdict would be incoherent. See below.

## The two create forms — [#43](https://github.com/nopivnick/lineup-prototype-03/issues/43)

**Both are full pages, everything asked at once, and both refusals are stated in the open.**
Variant **A** for both forms — the first outright win in four prototyped tickets.

**Propose a course** asks title, description and credits, plus a labelled program section that
**says what checking a box does**: there is no requested-programs table, so *which programs* is
not a field beside the form, it is the rows the form mints. A says so in the section header, on
each option, and in a live count (*submitting writes 2 reviews*). The form **states its own
absences** — no course number, no area or head, nothing approved by submitting. **The program
set may not be empty**, ruled rather than assumed: a proposal with no reviews is a record
nothing in the skeleton can reach again.

**Slate a class** asks course, term, section, **meeting rows**, then the operational fields.
`program_code` never appears and is stated on the form as derived. `section_number` is asked,
pre-filled with the next free number, and editable — the form loads what is taken and defaults
past it. **Meetings are part of slating**, because a form that defers them makes the LowRes
intensive and the asynchronous course indistinguishable from the unscheduled one at the moment
of creation.

**The gate both pre-empts and states.** The course picker sorts into *Can be offered* and *Not
yet — assignments missing*, the refused ones unselectable and carrying their reason on the line.
Hiding them was rejected structurally rather than by preference: **a course reached from its own
page has no list to be omitted from**, so the refusal must exist on the page regardless. Half-
missing is a real state with its own sentence, because area and head are separate assignments.

**After submit:** slating lands on the new class page, complete. **Proposing lands on the
proposals list, on the new group** — the one place A was amended, because a proposal has no page
of its own and landing on a record means picking one review of three by sort order.

**Nothing else is created**, and that is stated rather than left as an absence: no course
directly (only minted by `approve`), no person, no role, no term, no program, no area, no
requirement category.

## The three edit pages — [#62](https://github.com/nopivnick/lineup-prototype-03/issues/62)

**A field edit happens on an edit page of its own, one per record, reached from the rail, asking
everything you may change at once and committing it in one Save.** Variant **B**, outright.
Three routes — `/courses/:id/edit`, `/classes/:id/edit`, `/reviews/:id/edit` — which is the
map's **fourth amendment to the destination** and the first whose cost was on screen before it
was taken: the skeleton's nine views became twelve.

**An edit is one of the things you may do about a record**, so its entry point is the rail. The
body of the page stays exactly what #41 settled it as — a record, read — and gains no controls.

**The edit page renders only the classes open to you, and states the rest in the rail.** A
record's field classes disagree about their writer and their state rule, so *everything you may
change* is actor-shaped and the same URL is a different page for a coordinator and a director.
The edit page's rail carries a **Not yours to change here** section holding the refusals for
every class left out; the *record* page's rail carries the `Edit` control with a count beneath
it — *2 of 3 sections are yours*. The control's label does not vary with the actor, because a
control whose name changes per reader stops being one act; the count carries the truth.

**A state gate refuses inside the form** — the page does not ask for what the state has shut, and
the rail says why, with `revise` one control above it.

**Rows are sub-tables inside the one form**, added and removed inline and committed by the page's
Save. **Position 0 of a roster appears in the sub-table and is the one row with no `×`**, marked
*not a field*: renumbering into 0 is `staff` and goes through the machine or not at all.

**`Concluded` is stated** — *this class has concluded; changes here correct the record of a term
that is over, and nothing about its progress moves*. It refuses nothing; it is simply the one
edit the page comments on, being the one most likely to be mistaken for a bug.

**A field refusal is sometimes two sentences, where a transition refusal is always one.** #28
ANDs the state and role predicates and checks them **separately**, so both can fail at once, and
both are stated — labelled ***Not yours*** and ***Not now***. The refusal block is visibly
bulkier than any in #41 and that is not a rendering accident: a transition has one gate and a
field class has two. The chair sits ahead of the first and never the second, which the page shows
directly — the chair gets the `Edit` control on an `Approved` course and the body section is
still absent from the form.

**Seat-sharing points its refusal away from the record, and it is the only class that does.** The
writer of a foreign tag is the director of the **category's** program, so ITP's own director may
not touch the IMA tag on an ITP class while IMA's director, who has no other business there, may.
The refusal says so explicitly rather than reading as a bug.

## Two rules whose only statement is a rendering

[`docs/permissions/permissions.ts`](../permissions/permissions.ts) holds the predicate half of
each and points here for the other half, in `RENDERED_ELSEWHERE`. Stated here, not duplicated
there — a decision lives in exactly one place.

**1. A record-level refusal on a detail page names no state**
([#41](https://github.com/nopivnick/lineup-prototype-03/issues/41),
[#28](https://github.com/nopivnick/lineup-prototype-03/issues/28)). A list row outside its tier
is simply absent; a page has a URL and has to answer. The wording is:

> There is no section here — ITPG-GT 2233 has no section 3 in Fall 2025 that you can see.

Saying `Declined` leaks exactly what hiding it is for. *"Not visible to you"* was rejected for
confirming that a section exists at that number, which is half the leak; a silent redirect was
rejected because a cosmetic fault must not masquerade as a broken link. The same predicate thins
the sibling list on the page it refuses from, so the two are consistent.
`course-offering-detail.html`, variant D.

**2. `getReviewPage` returns the same record at two fidelities**
([#42](https://github.com/nopivnick/lineup-prototype-03/issues/42)) — the first read in the map
that does. The predicate is Tier 3's may-read against its may-act; the rendering is that a review
outside your arms, on a proposal you can reach, opens **read-only**: body, assignment, siblings,
and the history **with its reasons**, which was the whole justification — the reason another
program gave is the most useful thing on that page to a director still deciding. No actions and
no refusals, which is not new machinery: it is what `student` and `advisor` already get
elsewhere. `proposals-review.html`, variant D.

**And one display decision that is the visible half of something ruled out of scope.** #42 ruled
*forbidding a proposer from approving their own proposal* out of scope — the obvious fix has an
unchecked failure mode, since a small program may have exactly one area head and the rule could
leave certain proposals with no legal approver. **In scope and taken: the page states the
coincidence** where a proposal's author is also the approving area head. It costs nothing and it
makes the situation visible to anyone reading the record. `authorIsAreaHead` carries it in
[`docs/data-access/data-access.ts`](../data-access/data-access.ts).

## Amendments

Recorded so the artifact is never the only place a change is visible. An amendment **replaces**
what it overturns; it never stands beside it.

- **The roles page does not inherit #37's `⋯ n` menu** — by
  [#38](https://github.com/nopivnick/lineup-prototype-03/issues/38), correcting #37's own stated
  inheritance. #37 resolved that #38 would take the menu; #38 found #37's reason for rejecting
  reasons-in-the-open was **row height in a grouped table**, which a one-record-at-a-time page
  does not have. #14's one-object rule is what is inherited; only the rendering differs, and it
  differs because the layout does.

- **The course detail page gained a body-drift line and a link to its originating review** — by
  [#42](https://github.com/nopivnick/lineup-prototype-03/issues/42), amending
  [#41](https://github.com/nopivnick/lineup-prototype-03/issues/41). The mint *copies* the body,
  so a proposal edited after one program has approved leaves the course and the proposal
  disagreeing with nothing recording it. Stated on both pages; the course side is the one that
  matters, because whoever is about to schedule or teach it is never on the proposal screen. It
  is reachable only because #42 added `course.minted_from_review_id`.

- **The roster is rows carrying their own `position`, and the empty-state set grew** — by
  [Who writes co-instructor roster rows?](https://github.com/nopivnick/lineup-prototype-03/issues/61),
  amending [#41](https://github.com/nopivnick/lineup-prototype-03/issues/41). #41 shipped
  `roster[0]` as *the lead* — **a shape that cannot express a gap** — and #61 established that
  gaps below an empty position 0 are what `decline` and `withdraw` **produce**, each `DELETE`ing
  position 0 and leaving everything under it. Under the old shape, a section with two
  co-instructors and no lead rendered as an ordinary staffed roster. `leadOf()` replaced every
  `roster[0]` in `course-offering-detail.html`, PComp §3 seats a co-instructor under its declined
  lead, and ***rows below a vacant position 0*** joined *no roster at all* as a distinct state,
  rendering the table with *"Position 0 is empty, so this section cannot be offered to anyone"*
  above it — because the fact is still true and is now **less** obvious rather than more.

  **On the count.** #61's note in the file and in its resolution reads *five to six*; #41's
  resolution enumerates **six** empty and failure states and #61 adds one, so this ledger carries
  **seven**. The discrepancy is a tally, not a disagreement: no state is named by one and denied
  by the other. Recorded rather than silently reconciled, on
  [`docs/fixtures/README.md`](../fixtures/README.md)'s precedent for a resolution whose count
  disagrees with its own list.

- **Proposing is not flat `instructor` alone, and the proposal body has three writers** — by
  [#65](https://github.com/nopivnick/lineup-prototype-03/issues/65), which restored #8's wide rows
  against the narrow reading #43 and #62 were both built on. Two files are touched and **neither
  page is redrawn**:

  - `create-forms.html` shows an IMA director holding no `instructor` role refused the create
    control. Under the restored row that person may propose. The page is unchanged and still
    correct — it renders whatever the permitted-action set says — and **the fault is this file's
    hand-written cast**, since the requester states every real director teaches. The seed cast
    that replaced it is [`docs/fixtures/`](../fixtures/README.md).
  - `field-edits.html` gains a Proposal body section on a review edit page opened by a director
    whose own review is `Developing`. No hand redraw is needed: #62 settled that an edit page
    renders only the classes open to you, so the page is a function of `FIELD_CLASSES` and
    follows by its own rule. **#62's decision survives; one of its reasons narrows** — it held
    the one-page shape "earns nothing on the review page" because the two writers coincide only
    when a director proposes, and they now coincide whenever that review is `Developing`. The
    shape is kept for consistency with the other two pages, on a weaker argument than #62 wrote.

  These two entries were parked in [`docs/permissions/README.md`](../permissions/README.md)
  because this package had no ledger when #65 landed. They live here now.

- **Which fixture reaches *no name on file* changed; the rendering did not** — by
  [May the seed write a roster row for a netid `people` does not know?](https://github.com/nopivnick/lineup-prototype-03/issues/69).
  Four files still show `xq7742` on a roster — `catalog-lineup-views.html`,
  `course-offering-detail.html`, `field-edits.html`, `roles-page.html` — and #69 **deliberately
  did not rewrite them**. They demonstrate a rendering that is still required: `displayName`
  stays nullable and a roster entry is never dropped for want of a name, because the NYU feed can
  drop someone already staffed. The state is reachable in production and unreachable **by the
  seed**, which is not the same thing. #37 asked for *a roster netid absent from `people`* and a
  checked seed cannot write one; that is a finding about #37, and
  [`docs/fixtures/README.md`](../fixtures/README.md) is authoritative for the cast.

- **The course edit page gains an eighth section, and the page is not redrawn** — by
  [`course_requirement_category` is in no field class, so nothing may write it](https://github.com/nopivnick/lineup-prototype-03/issues/106),
  which classified the table as a **fourteenth field class** of its own. `field-edits.html`
  enumerates *the seven classes, and where they surface*; there are now eight, and the new
  one surfaces on the course page beside Assignment, open to the same person — the course's
  own program director — under a different rule, since a course's categories may be emptied
  where its areas may not.

  **No hand redraw is needed, for #65's reason exactly**:
  [#62](https://github.com/nopivnick/lineup-prototype-03/issues/62) settled that an edit page
  renders only the classes open to you, so the page is a function of `FIELD_CLASSES` and
  follows by its own rule. What the file states in prose — the inventory, and which parts are rows rather than columns —
  is the count that has moved, and this ledger is where it moves. The **mixed** classes are still three (Course assignment,
  Offering operational, Review assignment); the new one is rows and nothing else.

- **Titles and a header comment, fixed by this transcription** —
  [#59](https://github.com/nopivnick/lineup-prototype-03/issues/59). Four `<title>`s read *three
  variants* over files holding four, and no title named the settled variant; every title now
  states the count and the answer. `catalog-lineup-views.html`'s header comment listed A, B and C
  and never mentioned the D it opens on — the package's own defect one level down — and now lists
  it. No page logic was touched.

## What this package does not hold

- **The rules.** Who may fire what, the read tiers, the field-class map and the invariant list are
  [`docs/permissions/permissions.ts`](../permissions/permissions.ts). These files render a
  permitted-action set; they never compute one, and neither does the build effort's client — #28
  ships the set already intersected across machine legality, invariants and permissions.
- **The reads.** Which module a screen calls, what a row type carries and where the cross-project
  stitch happens are [`docs/data-access/`](../data-access/README.md). The seven view-shaped read
  modules are named there, not here.
- **The cast.** [`docs/fixtures/`](../fixtures/README.md) is the seed. Every cast in this
  directory is hand-written illustration, and where the two disagree the fixtures package wins.
- **The lifecycles.** [`docs/machines/`](../machines/README.md), including `subject_netid` on
  `offer` and `accept`, which surfaced here and is recorded there.
- **The columns.** [`docs/schema/`](../schema/README.md) is authoritative for every type and
  constraint.

## Notes for the build effort

- **These are HTML, and they are not the components.** They approximate Mantine and
  mantine-datatable in hand-written CSS. Two library facts checked during #37 are load-bearing and
  are stated in the *Catalog and Lineup* section above: **mantine-datatable has no row-grouping
  feature**, so grouping is `rowExpansion` with `trigger: 'always'`; and **the table does not
  sort**, so every sort in this spec is yours to implement.
- **Neither list view pages, and that is a decision with a threshold rather than a law.** It stops
  being true if the row count reaches the low thousands, and the recovery is *page by course,
  never by section*, so a group is never split. Two consequences move with it: paging costs
  in-memory sorting by instructor name, and it is what made that sort impossible in the first
  place.
- **Absent, never empty.** The same rule scales through the whole package — a column (#37), a page
  (#38), a section (#41), and controls-with-their-refusals for a read-only actor (#38). Greying
  something out is not the fallback.
- **Refusal wording has three clauses**, and every screen here follows all three: the refused thing
  and its explanation are one object (#14); name the person or the role, never the rule (#37); and
  where the refusal's content is data elsewhere in the system, name the dependency and list it
  (#38).
