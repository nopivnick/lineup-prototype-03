# The curated Postgres schema

`people.sql` and `classes.sql` are **reference, not migrations** — nothing runs them, in
the same sense that `docs/machines/*.ts` are reference and nothing imports them. The build
effort turns them into `drizzle-kit` migrations, two configs with distinct `out`
directories ([#9](https://github.com/nopivnick/lineup-prototype-03/issues/9)).

They are the synthesis of eighteen closed map tickets, settled by
[The curated Postgres schema for both projects](https://github.com/nopivnick/lineup-prototype-03/issues/10).
Where a column exists because a ticket said so, the SQL comment names the ticket. This
file records what ticket 10 itself decided, what it dropped, and the two places where it
had to derive rather than apply.

## Amendments since ticket 10

Ticket 10 settled the schema; later tickets may amend it, and each one is recorded here so
the file is never the only place a change is visible. The same discipline
`docs/machines/README.md` keeps for the lifecycles.

- **`course.minted_from_review_id`** — added by
  [What do the proposals list and the review detail page show?](https://github.com/nopivnick/lineup-prototype-03/issues/42),
  the first screen able to reach a review, which found the trail died at approval in both
  directions. A nullable, `UNIQUE` reference to the review whose `approve` minted the
  course. It does **not** disturb
  [#8](https://github.com/nopivnick/lineup-prototype-03/issues/8)'s ruling that a course
  carries no link to its proposal: that ruling is about the *body*, which the mint copies
  so variants may diverge, and this column references the act rather than the text. Left
  nullable against ticket 10's usual preference for the strict option, because `NOT NULL`
  would decide the seed's shape — whether fixtures are minted through a review or written
  already `Approved` — which no closed ticket had settled.

- **`course.minted_from_review_id` is now `NOT NULL`** — tightened by
  [What are the seed fixtures?](https://github.com/nopivnick/lineup-prototype-03/issues/49),
  which is the ticket 42 deferred the choice to by name. Ticket 49 rules that **every seeded
  course is minted through a proposal and an approving review**, so the reason for the
  nullability is gone and ticket 10's DDL asymmetry applies as usual — the strict option is
  the recoverable one. Enforceable everywhere, checked rather than assumed:
  [#43](https://github.com/nopivnick/lineup-prototype-03/issues/43) confirmed the create
  forms make no course directly, and `approve` is the only mint. Legacy migration, which is
  out of scope and would import courses with no review behind them, inherits a constraint it
  can drop in one statement that cannot fail.

## Shape

**21 tables. 20 in `classes`, 1 in `people`.**

That is above the "roughly fourteen" charted, and the overage is entirely tables the map
invented *after* charting: [#7](https://github.com/nopivnick/lineup-prototype-03/issues/7)'s
proposal/review split (3), [#25](https://github.com/nopivnick/lineup-prototype-03/issues/25)'s
four-way tag split (2 more than the one `course_x_attributes` it replaced), ticket 10's
`offering_meeting`, and a third transition log. No table here is legacy carried across —
50 legacy `classes` tables and 25 legacy `itpdir` tables produced these 21.

`people` holding exactly one table is a real result rather than an oversight. Everything
else in legacy `itpdir` is registration, advising, alumni, evaluations or authentication,
all out of scope. The separation earns its keep the moment real people data arrives; until
then it costs two connection pairs and buys the FK-less discipline
[#9](https://github.com/nopivnick/lineup-prototype-03/issues/9) built its read strategy on.

## What ticket 10 decided

**Surrogate keys are `bigint GENERATED ALWAYS AS IDENTITY`.** Counting numbers, not UUIDs:
readable in a URL and in a `psql` session, and the unguessability a UUID buys would be
defending a door [#11](https://github.com/nopivnick/lineup-prototype-03/issues/11) opened
on purpose and [#28](https://github.com/nopivnick/lineup-prototype-03/issues/28) declined
to close. `bigint` rather than `integer` for one reason: it is what Drizzle surfaces as
`string`, which `LiveOffering.id` in `course.machine.ts` already assumes.

**`course` gets a real primary key.** The legacy table declared only a non-unique `KEY
course_id` while `lineup_official` declared a foreign key to it — tolerated by MySQL,
rejected outright by Postgres.

**A course number is unique within its program**, not department-wide and not loose as
legacy left it. NYU's own CourseLeaf feed scopes a catalog number the same way, by
`(subject_code, catalog_num, section_num)`, and
[#7](https://github.com/nopivnick/lineup-prototype-03/issues/7) established the three
programs have distinct catalogs. The reversibility argument decided it and recurs
throughout this schema: **dropping a constraint is catalog-only and always succeeds;
adding one later scans and can fail** — [#13](https://github.com/nopivnick/lineup-prototype-03/issues/13)'s
DDL asymmetry, which also means the strict option is the recoverable one. The same
reasoning put uniqueness on `person.university_id`, on `(program_code, name)` for areas and
categories, on `(offering_id, netid)` for the roster, and on `(course_id, term_code,
section_number)`.

**`edition` is a stored column, bumped on `approve`.** Against the recommendation, at the
requester's direction, because the number is read by people. It is derivable —
one plus the count of `approve` rows in `course_transition` — so the recommendation had
been [#13](https://github.com/nopivnick/lineup-prototype-03/issues/13)'s *prefer the form
that cannot be forgotten*. Storing it is legal under standing principle 1 by the exemption
route: one transaction writes both, the `Staffed` shape from
[#15](https://github.com/nopivnick/lineup-prototype-03/issues/15). It bumps on `approve`
rather than on `revise` because an edition is a thing that was published and stood, and
because the number then never has to go backwards.

*(This is the fourth time a requester override has become load-bearing. The first — #7's
program-scoped areas, recommended against and overruled — is now what makes #25's tag
split possible, what gives #30's foreign key a declarative form, what forces #32's
assignment onto the review, and what makes the composite keys in this file work.)*

**Credits belong to the course, not the offering.** Legacy put them on `section` with a
`DEFAULT 4`; the requester confirms a course does not run for different credit amounts in
different terms. This vindicates the comment already in `course.machine.ts`, which had
described a course revision as covering *"title, description, credits"* — so no machine
amendment was needed.

**`enrollment_limit` stays**, on the offering. Nothing enforces it — registration is out
of scope, so no mechanism could refuse the nineteenth student — but it is a number the
department has been setting and publishing for twenty years, which is the distinction from
the shared-seat count [#25](https://github.com/nopivnick/lineup-prototype-03/issues/25)
excluded as *"decoration that reads as a rule."*

**Meetings are a structured table with a declared kind.** Against the recommendation, at
the requester's direction. Legacy modelled meetings **twice** — the display string
`section.meetings` and the structured `section_x_time_space` — and the structured one is
the cautionary tale: a weekday `day`, a calendar `date_date` and a `special` flag in one
table, with nothing enforcing which columns went with which kind. `offering_meeting` fixes
exactly that by declaring the kind and checking the shape, which is
[#30](https://github.com/nopivnick/lineup-prototype-03/issues/30)'s move of making a
convention *structural rather than disciplinary*. One row per **slot**, never per concrete
session: expanding a weekly pattern into dated rows would need term start and end dates,
and [#3](https://github.com/nopivnick/lineup-prototype-03/issues/3) deferred those. The
display string is gone; the Lineup composes from the rows.

**The room moved to the meeting row.** Legacy stored it in both places. A class genuinely
can meet in different rooms on different days, so one copy, on the row that has a time.
This amends [#8](https://github.com/nopivnick/lineup-prototype-03/issues/8), which listed
"room" as an offering field when there was no meeting table to put it on.

**`mode` stays free text.** The one place the strict-is-reversible logic was refused: the
value set is not known, and a guessed CHECK would refuse real values — a rule that fires
*wrongly* rather than one that never fires.

**Search is plain `ILIKE`, no index, no extension.** Legacy's MyISAM `FULLTEXT` indexes
covered titles and names only, never descriptions — so this was never full-text search, it
was type-to-narrow. Postgres's `tsvector` is the wrong tool for that (it matches whole
words, so "phys" finds nothing) and `pg_trgm` is the right one, but **the index is
invisible to the query**: adding it later changes no application code. That makes this the
rare deferral that costs nothing, and it is recorded as an exclusion rather than left as an
absence. `person.display_name` being searchable is load-bearing for
[#9](https://github.com/nopivnick/lineup-prototype-03/issues/9), which already assumes it.

**`updated_at` / `updated_by`, written by the single writer, never by a trigger.** Postgres
has no equivalent to MySQL's `ON UPDATE current_timestamp()`, so this was always a choice
rather than a translation, and
[#13](https://github.com/nopivnick/lineup-prototype-03/issues/13) and
[#30](https://github.com/nopivnick/lineup-prototype-03/issues/30) both rejected triggers on
the same ground — *where would a reader find it*.
[#28](https://github.com/nopivnick/lineup-prototype-03/issues/28) had already put the field
writer in one place, which is what makes this nearly free.

**A transition log row may carry a free-text `reason`.** Optional, on all three logs.
[#19](https://github.com/nopivnick/lineup-prototype-03/issues/19) parked it here; the
column has to exist for [#37](https://github.com/nopivnick/lineup-prototype-03/issues/37)
to be free to put a reason box on a cancel button. Structured reason codes are out of
scope.

**`person` keeps 8 of `nyu_official`'s 34 columns**, including preferred names, pronouns
and `university_id` — the last two at the requester's direction over a recommendation to
drop them.

## The field-class map

[#28](https://github.com/nopivnick/lineup-prototype-03/issues/28) ruled that every column
gets a field class and **a column with no class is unwritable**.
[#8](https://github.com/nopivnick/lineup-prototype-03/issues/8) named seven columns, before
most of these tables existed. Completing the map is the one place ticket 10 adds a rule
rather than applying one.

| Class | Who writes | Where |
|---|---|---|
| **Structural** | Nobody — an invariant, not a permission | `offering.course_id`, `offering.term_code`, `offering.program_code`, `course.program_code` |
| **Machine-owned** | `applyTransition` only | every `snapshot` and `status`; `course.edition` |
| **Creation** | Written once, by the creating path | every `created_at` / `created_by`; every `granted_by` / `granted_at` |
| **Course body** — state-gated to `Revising` | Director of `course.program_code`, or `course.area_head` | `course.title`, `.description`, `.credits`, `.course_number`, `.url` |
| **Course assignment** — state-blind | Director of `course.program_code` alone | `course.area_head`, `course_area` rows |
| **Offering operational** — state-blind, `Concluded` included | Coordinator, or the offering's program director | `offering.section_number`, `.call_number`, `.sis_class_number`, `.url`, `.mode`, `.enrollment_limit`; `offering_meeting` rows |
| **Seat-sharing tags** — state-blind | Director of the **category's** program | `offering_area`, `offering_requirement_category` rows |
| **Roster** | Not a field class — `staff` / `unstaff` non-exposure | `offering_instructor` rows |
| **Proposal body** — gated to `Developing` | `course_proposal.created_by` | `course_proposal.title`, `.description`, `.credits` |
| **Review assignment** — gated to `Proposed` / `Developing` | Director of that review's program | `course_proposal_review.area_head`, `course_proposal_review_area` rows |
| **Authorization** | `chair` alone | `user_role`, `program_director` rows |
| **Timestamps** | The field writer, alongside any write above | every `updated_at` / `updated_by` |

`updated_at` / `updated_by` are deliberately *not* their own class — they are a side effect
of the writer, not something anyone chooses to set.

## What legacy contributed, and what it did not

Four legacy shapes the ticket named are **moot** rather than translated. `year(4)` does not
exist in Postgres and did not need to:
[#3](https://github.com/nopivnick/lineup-prototype-03/issues/3) replaced `(year, semester)`
with `term_code` everywhere but `term` itself. `activity_log`'s
`enum('INSERT','UPDATE','DELETE')` never arrives, because
[#6](https://github.com/nopivnick/lineup-prototype-03/issues/6) rejected that table's shape
outright. `lineup_official` is not a table, a view or a materialised view —
[#9](https://github.com/nopivnick/lineup-prototype-03/issues/9) made view-shaped TypeScript
read modules the only place a query lives, and its `LineupRow` is what `lineup_official`
was for. And MySQL's `ON UPDATE current_timestamp()` has no Postgres equivalent, which is
covered above.

Columns dropped from `course` and `section`, with reasons: **evaluations**
(`prof_evaluation_average`, `course_evaluation_average`, `evaluation_count`,
`evaluation_range`, `eval_by_instructor`, `expose_evals`) — out of scope.
**`actual_enrollment`** — nothing in the skeleton could ever fill it, since it came from
the Albert importer and registration is out of scope, so it would sit permanently at zero
next to the limit. **`faculty_deal`** — contractual, excluded by
[#21](https://github.com/nopivnick/lineup-prototype-03/issues/21). **`notes`,
`advise_notes`, `mode_note`** — free text, and
[#25](https://github.com/nopivnick/lineup-prototype-03/issues/25) declined to carry
legacy's `notes` forward specifically so the free-text question stayed whole; ticket 10
answered that question only for the transition log. **`old_course_number`** — a record of a
past renumbering, which is the audit question, ruled out of scope. **`un_area_head`** —
[#4](https://github.com/nopivnick/lineup-prototype-03/issues/4) made this a deliberate
non-actor, and it has no meaning until the map's open *how course review feedback is
captured* has somewhere for feedback to live. **`image`** and the whole `course_image`
table — the latter turns out to be a media library wired to a projects system
(`project_id`, `project_document_id`) that does not exist here. **`filter`,
`forum_link`** — no visible purpose, no view that reads them. **`status`** — replaced by
the machine.

From `nyu_official`: **authentication** (`password`, `token`, `login`, `barcode`,
`censusID`) — out of scope, and carrying credentials into a system with a deliberately
forgeable identity cookie would be actively wrong. **Sensitive personal data** (`gender`,
`citizenship`) — no feature reads them, and every person here is invented. **Excluded
features** (`current_status`, ruled out by name in
[#4](https://github.com/nopivnick/lineup-prototype-03/issues/4); `advisor`,
`advise_spreadsheet`, `classyear`, `starting_semester`, `semester_last_registered`,
`actual_grad_*`, `school`, `department`, `no_shop`, `remoteness`, `timezone`). **The `_int`
mirrors** (`starting_semester_int`, `semester_last_registered_int`, `actual_grad_year`) —
duplicate copies stored as numbers so they would sort, the exact pattern
[#3](https://github.com/nopivnick/lineup-prototype-03/issues/3) killed. Plus `itp_id`,
which `netid` replaces, and the three `middlename` columns.

## Two derivations

Two tables here are authorised by no closed ticket. Both are flagged in the SQL.

**`course_proposal_review_area`.** [#32](https://github.com/nopivnick/lineup-prototype-03/issues/32)
put the area assignment on the review and
[#25](https://github.com/nopivnick/lineup-prototype-03/issues/25) made areas
program-scoped, while #32 also established a course carries **1..n** areas. A review
therefore needs area *rows*, not a column, for `approve` to copy forward into `course_area`.

**`course_proposal_review_transition`.** [#6](https://github.com/nopivnick/lineup-prototype-03/issues/6)
specified two transition logs for what were then two machines;
[#7](https://github.com/nopivnick/lineup-prototype-03/issues/7) then split off a third
machine, and nothing revisited the count. Without this table `applyTransition` needs a
branch for a machine with no log, and a rejection is recorded nowhere — #13's `created_by`
on a minted course makes an *approval* attributable, but nothing makes a `reject` or a
`develop` so.

## Notes for the build effort

- **The CHECK on machine state is written against `snapshot->>'value'`, not against the
  generated `status` column.** Identical in effect and provably legal, where referencing a
  generated column in a CHECK is not something this spec wanted to depend on.
  [#13](https://github.com/nopivnick/lineup-prototype-03/issues/13)'s test — that the
  CHECK's value set equals the machine's exported state union — reads the same either way,
  and is ~15 lines the build effort owes.
- **`person` has no `created_by` / `updated_by`.** Both name an actor, and nothing in the
  skeleton writes a person: rows arrive from the seed, and in a real deployment from an NYU
  feed. `updated_at` survives because a feed has a meaningful one — legacy's `last_updated`
  was exactly that.
- **No RLS.** [#28](https://github.com/nopivnick/lineup-prototype-03/issues/28) ruled the
  read tiers a product rule rather than a security boundary; the shape RLS would take is
  recorded on the map for the effort that adds real authentication.
- **Nothing here is Supabase-specific** — hosted Postgres and its pooler, per
  [#9](https://github.com/nopivnick/lineup-prototype-03/issues/9). No extensions are
  required.
