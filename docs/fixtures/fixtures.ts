// The seed content: 14 netids, 17 courses, 28 classes, 23 proposals, 29 reviews and
// every transition that puts them where they are.
//
// **Reference, not application code.** Nothing runs this and nothing imports it into
// a running system — see docs/README.md. The build effort converts it into a seed
// script.
//
// Settled by https://github.com/nopivnick/lineup-prototype-03/issues/49, amended by
// https://github.com/nopivnick/lineup-prototype-03/issues/61 and
// https://github.com/nopivnick/lineup-prototype-03/issues/65, transcribed by
// https://github.com/nopivnick/lineup-prototype-03/issues/58. Every claim names the
// ticket that settled it, per rule 2 of docs/agents/spec-packages.md. `#n` is
// https://github.com/nopivnick/lineup-prototype-03/issues/n throughout.
//
// Three rules govern the shape of this file, and all three come from closed tickets:
//
//   * **Nothing here is a snapshot.** #13 has the seed drive its fixtures **through
//     the machine** rather than inserting rows at rest, on a churn argument: a
//     hand-authored snapshot literal is a third copy of the machine's shape,
//     re-broken by every change, where `getPersistedSnapshot()` is valid by
//     construction. So an offering carries an **ordered event list** and no
//     `snapshot`, no `status`, no `from_state` / `to_state`. The seed calls
//     `applyTransition` once per step and the log writes itself.
//   * **The seed is checked like any other caller** (#28), and #34 fixed the order:
//     chair, roles, relationships, then the rest. See `SEED_ORDER`.
//   * **The checks read the end state, so the cast's present shape constrains its
//     own past** (#49). Every role and relationship row exists before any transition
//     is driven, and the permission check reads the rows as they are rather than as
//     they were on the fictional date in the log. A historical act by someone who no
//     longer holds the role is not awkward here, it is *refused*.
//
// Keys (`C1`, `O28`, `P23`, `R29`) are #49's own labels, kept because the ticket
// argues in them. They are not columns: every id in `docs/schema/classes.sql` is
// `bigint GENERATED ALWAYS AS IDENTITY`, so the seed resolves a key to an id as it
// inserts. Typing them as literal unions is what makes a mistyped cross-reference a
// compiler error rather than a foreign-key violation discovered at seed time.

import type { OfferingState } from "../machines/offering.machine";
import type { Role } from "../permissions/permissions";
import type {
  CourseEvent,
  CourseState,
  Netid,
  OfferingEvent,
  ProgramCode,
  ReviewEvent,
  ReviewState,
  TermCode,
  Timestamp,
} from "../data-access/data-access";

// ---------------------------------------------------------------------------
// The fixture world
// ---------------------------------------------------------------------------

/**
 * **Dates are literal, not computed** (#49).
 *
 * A seed that worked backwards from its own run time would have to decide which term
 * is current, and *current term is not computable* is a fact #3 established (term
 * dates deferred) that #14 and #41 both bend around. Fixed dates also mean a
 * screenshot stays true across resets.
 *
 * The world sits on **20 October 2026**: a moment at which a fall class is genuinely
 * running and spring offers are genuinely going out, which is what lets all fourteen
 * Offering states be occupied honestly rather than crowded into two terms.
 *
 * Nothing in the fixtures reads this constant. It is the date every timestamp below
 * was chosen against, recorded so a later editor extending the seed knows what
 * *now* means here.
 */
export const WORLD_DATE = "2026-10-20" as const;

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/** The fourteen netids in the fixtures. Thirteen have a `person` row; `xq7742` does not. */
export type FixtureNetid =
  | "tv1067"
  | "pr3390"
  | "ab9034"
  | "hs5540"
  | "dk2210"
  | "na2481"
  | "rc1129"
  | "hs4417"
  | "jl8802"
  | "vm7781"
  | "by6640"
  | "ok3356"
  | "mo5512"
  | "xq7742";

export type FixtureProgram = "ITP" | "IMA" | "LOWRES";

export type FixtureTerm = "20261" | "20263" | "20271";

export type AreaKey = "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "A7" | "A8" | "A9";

export type CategoryKey = "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6" | "Q7";

/** `P1`–`P8` are #49's eight in flight; `P9`–`P23` are its fifteen quiet ones. */
export type ProposalKey =
  | "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8"
  | "P9" | "P10" | "P11" | "P12" | "P13" | "P14" | "P15" | "P16"
  | "P17" | "P18" | "P19" | "P20" | "P21" | "P22" | "P23";

export type ReviewKey =
  | "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8" | "R9" | "R10"
  | "R11" | "R12" | "R13" | "R14" | "R15" | "R16" | "R17" | "R18" | "R19"
  | "R20" | "R21" | "R22" | "R23" | "R24" | "R25" | "R26" | "R27" | "R28" | "R29";

export type CourseKey =
  | "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8" | "C9"
  | "C10" | "C11" | "C12" | "C13" | "C14" | "C15" | "C16" | "C17";

export type OfferingKey =
  | "O1" | "O2" | "O3" | "O4" | "O5" | "O6" | "O7" | "O8" | "O9" | "O10"
  | "O11" | "O12" | "O13" | "O14" | "O15" | "O16" | "O17" | "O18" | "O19" | "O20"
  | "O21" | "O22" | "O23" | "O24" | "O25" | "O26" | "O27" | "O28";

// `Netid`, `ProgramCode` and `TermCode` come off docs/data-access/data-access.ts
// rather than being redeclared. These three lines exist so the compiler checks that
// the fixture unions are usable wherever the seam expects the open types — a
// mistyped key is caught here rather than at the first call site.
const _netidWidens: Netid = "tv1067" satisfies FixtureNetid;
const _programWidens: ProgramCode = "ITP" satisfies FixtureProgram;
const _termWidens: TermCode = "20263" satisfies FixtureTerm;
void _netidWidens, _programWidens, _termWidens;

// ---------------------------------------------------------------------------
// The cast
// ---------------------------------------------------------------------------

/**
 * A row in `person`, in the `people` project.
 *
 * No `created_by` / `updated_by`: the table has neither (#10), because both name an
 * actor and nothing in the skeleton writes a person. Rows arrive from the seed here
 * and from an NYU feed in a real deployment.
 *
 * `display_name` is generated and therefore absent — `coalesce(preferred, official)`
 * on each part. `by6640` is the row that earns it: official *Baoling*, preferred
 * *Bao*.
 */
export type PersonRow = {
  netid: FixtureNetid;
  universityId: string | null;
  officialFirstname: string;
  officialLastname: string;
  preferredFirstname?: string;
  preferredLastname?: string;
  /** Absent on `jl8802` — #40 wanted the column rendered present and absent. */
  pronouns?: string;
  updatedAt?: Timestamp;
  /** Why this row is in the cast at all, in #49's terms. */
  earnsItsPlace: string;
};

/**
 * **Thirteen `person` rows.** Each earns its place by a treatment that would
 * otherwise not render — #49 took this cast size over one-per-view (~9) and compact
 * (~5) at the requester's direction.
 *
 * `university_id` is present on nine and absent on four: stored, never displayed
 * (#40), with the nulls keeping the unique constraint honest about being optional.
 *
 * **Nobody holds zero roles.** A person holding nothing sees exactly what a
 * `student` sees, so the row would buy a fourteenth switcher entry and no new
 * rendering (#49).
 */
export const PEOPLE = [
  {
    netid: "tv1067",
    universityId: "N10029341",
    officialFirstname: "Theo",
    officialLastname: "Vance",
    pronouns: "he/him",
    earnsItsPlace:
      "The bootstrap, the last-chair revoke refusal, and a chair who teaches — #34 says that requires the chair granting themselves `instructor`, and O10 is where the grant is spent.",
  },
  {
    netid: "pr3390",
    universityId: "N10044182",
    officialFirstname: "Priya",
    officialLastname: "Raman",
    pronouns: "she/her",
    earnsItsPlace: "ITP's director: approves reviews, creates classes, retires C3.",
  },
  {
    netid: "ab9034",
    universityId: "N10047710",
    officialFirstname: "Amina",
    officialLastname: "Bello",
    pronouns: "she/her",
    earnsItsPlace:
      "IMA's director, who also teaches and heads IMA's areas — the person for whom #8's OR over independently-evaluated conjunctions is not academic.",
  },
  {
    netid: "hs5540",
    universityId: "N10061903",
    officialFirstname: "Hana",
    officialLastname: "Sørensen",
    pronouns: "she/her",
    earnsItsPlace:
      "LowRes's director. #49 seeded this row to hold no `instructor`, so that #43's create-form refusal had a person behind it; #65 restored #8's create row and killed that reason. See `AMENDMENTS` — the role is granted here and the refusal now belongs to `dk2210`, `ok3356` and `mo5512`.",
  },
  {
    netid: "dk2210",
    universityId: "N10052266",
    officialFirstname: "Dana",
    officialLastname: "Kirsch",
    pronouns: "she/her",
    earnsItsPlace:
      "The operational seat seen alone — a `coordinator` holding nothing else, which is the vacancy #8 invented the role for. Fires the whole forward path for all three programs, so this is the most common name in the offering log.",
  },
  {
    netid: "na2481",
    universityId: "N10031755",
    officialFirstname: "Nora",
    officialLastname: "Applebaum",
    pronouns: "she/her",
    earnsItsPlace:
      "**Blocked on both revokes** (#38): five roster rows on offerings in `LIVE_STATES` block `instructor`, nine non-retired courses headed block `area_head`. #49's parentheticals say *3 live classes* and *8 courses*; its own tables give five and nine, and `LIVE_STATES` includes `Scheduled` and `Published` (#14). Counted, not restated.",
  },
  {
    netid: "rc1129",
    universityId: null,
    officialFirstname: "Rui",
    officialLastname: "Chen",
    pronouns: "they/them",
    earnsItsPlace: "Proposes most of the in-flight work; the co-instructor on three sections.",
  },
  {
    netid: "hs4417",
    universityId: "N10036028",
    officialFirstname: "Hugo",
    officialLastname: "Santos",
    pronouns: "he/him",
    earnsItsPlace:
      "Taught twice last spring and holds nothing live — the **clean** `instructor` revoke against Nora's blocked one (#38).",
  },
  {
    netid: "jl8802",
    universityId: null,
    officialFirstname: "Jae",
    officialLastname: "Lin",
    earnsItsPlace:
      "Heads one **retired** course and nothing else — the clean `area_head` revoke, and the person with no pronouns on file (#40).",
  },
  {
    netid: "vm7781",
    universityId: "N10024419",
    officialFirstname: "Vera",
    officialLastname: "Molnar",
    pronouns: "she/her",
    earnsItsPlace:
      "The clean `program_director` revoke: holds the role and directs no program. Appears in no history at all, which is forced — the checks read the end state, so a director who has stepped down cannot be the actor on any past act. Seed-only; see `SEED_ONLY`.",
  },
  {
    netid: "by6640",
    universityId: "N10077342",
    officialFirstname: "Baoling",
    officialLastname: "Yun",
    preferredFirstname: "Bao",
    pronouns: "she/her",
    updatedAt: "2026-08-20T14:05:00Z",
    earnsItsPlace:
      "The student who also teaches (#38), leading O12 outright and proposing P6. The preferred first name is what makes `display_name` earn its generation, and its arrival is the `person` field edit.",
  },
  {
    netid: "ok3356",
    universityId: "N10058817",
    officialFirstname: "Olu",
    officialLastname: "Kalu",
    pronouns: "he/him",
    earnsItsPlace:
      "#38's fourth read predicate — *holds any role other than `student`* — with nothing behind it: reaches the roles page and may do nothing on it.",
  },
  {
    netid: "mo5512",
    universityId: null,
    officialFirstname: "Marcus",
    officialLastname: "Ola",
    pronouns: "he/him",
    earnsItsPlace: "The narrowest view in the system. No roles page at all.",
  },
] as const satisfies readonly PersonRow[];

/**
 * **One netid with no `person` row.** #37 asked for a roster netid absent from
 * `people` and #41 for a history actor with no name on file; #49 supplied both with
 * one netid — a new hire ahead of the directory feed, which is exactly the reading
 * #38 refused to let a typo imitate.
 *
 * The reads tolerate it by construction: `displayName` is nullable and a roster entry
 * is never dropped for want of a name (#9), so every view falls back to the netid,
 * which is a real identifier at NYU rather than a placeholder.
 *
 * **The write side is unsettled, and this package does not settle it** — see
 * `OPEN_AGAINST_THIS_PACKAGE`. `xq7742` holds position 0 on O4, O17 and O22, and
 * `FURTHER_INVARIANTS` in docs/permissions/permissions.ts carries *a roster write
 * refuses a netid the `people` project does not know*, which #9 wrote as a backstop
 * against seed scripts by name.
 */
export const NETID_WITH_NO_PERSON_ROW = {
  netid: "xq7742",
  holds: ["instructor"],
  appearsAs: [
    "lead of O4, O17 and O22 (`offering_instructor` position 0)",
    "the actor on O22's own `accept` — a history line naming nobody",
    "author of P3, on a proposals list that names the proposer on every group header",
  ],
  settledBy: ["#37", "#38", "#41", "#49"],
} as const;

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/**
 * A row in `user_role`.
 *
 * `checked: false` marks the **genesis grant** — the one `chair` row written before
 * any authority exists to write it (#34). Every other row is written by `tv1067` and
 * goes through the ordinary check.
 */
export type RoleGrantRow = {
  netid: FixtureNetid;
  role: Role;
  grantedBy: FixtureNetid;
  grantedAt: Timestamp;
  checked: boolean;
  note?: string;
};

/**
 * **Twenty `user_role` rows: one unchecked genesis grant and nineteen checked ones**,
 * every checked row written by `tv1067`, who is the only writer of this table (#34).
 *
 * #49's prose says *the remaining 17*; its own cast table enumerates eighteen, and
 * #65's amendment below adds the nineteenth. The enumeration is authoritative — this
 * map resolves prose-against-table for the table four times over (#32, #61, #65), and
 * an arithmetic slip is the weakest form of the same disagreement.
 *
 * **`hs5540` holds `instructor` here, and #49 said otherwise** — the amendment #65
 * handed this ticket by name. #49 gave Hana no `instructor` so that #43's refusal of
 * the propose control had a person behind it; #65 then found #43's narrowing was a
 * misquote of #8's row and restored `program_director` and `area_head` as flat create
 * arms, which means a non-teaching director may propose anyway. The requester states
 * that every real ITP/IMA/LowRes director teaches, so a cast holding a director who
 * does not is a fixture fault rather than a rule. See `AMENDMENTS`.
 *
 * `by6640` holds `student` *and* `instructor`, granted a year apart, which is the
 * whole of #38's student-who-teaches case.
 */
export const ROLE_GRANTS = [
  {
    netid: "tv1067",
    role: "chair",
    grantedBy: "tv1067",
    grantedAt: "2018-08-15T09:00:00Z",
    checked: false,
    note: "**The genesis grant.** The one row in the seed written with no authority behind it — the chair writes `user_role` and nobody else does, so the first chair cannot be granted by a checked path (#34). Every row below this one is checked.",
  },
  {
    netid: "tv1067",
    role: "instructor",
    grantedBy: "tv1067",
    grantedAt: "2018-08-15T09:05:00Z",
    checked: true,
    note: "#34's literal consequence: the chair bypasses the permission term and never standing principle 6, so a chair who teaches must hold `instructor` before a roster row naming them is writable. Spent on O10.",
  },
  { netid: "pr3390", role: "program_director", grantedBy: "tv1067", grantedAt: "2018-08-15T09:10:00Z", checked: true },
  { netid: "ab9034", role: "program_director", grantedBy: "tv1067", grantedAt: "2018-08-15T09:11:00Z", checked: true },
  { netid: "ab9034", role: "instructor", grantedBy: "tv1067", grantedAt: "2018-08-15T09:12:00Z", checked: true },
  { netid: "ab9034", role: "area_head", grantedBy: "tv1067", grantedAt: "2018-08-15T09:13:00Z", checked: true },
  { netid: "na2481", role: "instructor", grantedBy: "tv1067", grantedAt: "2018-08-15T09:14:00Z", checked: true },
  { netid: "na2481", role: "area_head", grantedBy: "tv1067", grantedAt: "2018-08-15T09:15:00Z", checked: true },
  { netid: "hs4417", role: "instructor", grantedBy: "tv1067", grantedAt: "2018-08-15T09:16:00Z", checked: true },
  { netid: "jl8802", role: "area_head", grantedBy: "tv1067", grantedAt: "2018-08-15T09:17:00Z", checked: true },
  {
    netid: "vm7781",
    role: "program_director",
    grantedBy: "tv1067",
    grantedAt: "2019-01-14T10:00:00Z",
    checked: true,
    note: "No matching `program_director` row. #51 settled that a qualification survives the loss of its scope, so un-appointing a director drops the relationship and leaves the role standing — this is that state, and the only clean director revoke in the cast.",
  },
  { netid: "hs5540", role: "program_director", grantedBy: "tv1067", grantedAt: "2019-08-19T09:00:00Z", checked: true },
  {
    netid: "hs5540",
    role: "instructor",
    grantedBy: "tv1067",
    grantedAt: "2019-08-19T09:01:00Z",
    checked: true,
    note: "**Added by #58 under #65's direction.** #49 withheld this grant so a non-teaching director would be refused the propose control; #65 restored the flat `program_director` arm on that act, so the refusal no longer fires and the requester's *every real director teaches* makes the withholding a fixture fault. Hana teaches nothing in the fixtures, which is legal — the grant is a qualification, and #14 already establishes that holding one implies no live class.",
  },
  { netid: "ok3356", role: "advisor", grantedBy: "tv1067", grantedAt: "2022-01-10T09:00:00Z", checked: true },
  { netid: "rc1129", role: "instructor", grantedBy: "tv1067", grantedAt: "2021-09-01T09:00:00Z", checked: true },
  { netid: "dk2210", role: "coordinator", grantedBy: "tv1067", grantedAt: "2023-08-01T09:00:00Z", checked: true },
  { netid: "mo5512", role: "student", grantedBy: "tv1067", grantedAt: "2025-09-02T09:00:00Z", checked: true },
  { netid: "by6640", role: "student", grantedBy: "tv1067", grantedAt: "2025-09-02T09:01:00Z", checked: true },
  { netid: "xq7742", role: "instructor", grantedBy: "tv1067", grantedAt: "2026-06-15T09:00:00Z", checked: true },
  { netid: "by6640", role: "instructor", grantedBy: "tv1067", grantedAt: "2026-09-01T09:00:00Z", checked: true },
] as const satisfies readonly RoleGrantRow[];

/**
 * `program_director` — the relationship that scopes the role (#4, #34).
 *
 * **Three programs, three different people, no overlap.** #42 needs a director whose
 * program shares a proposal with two others, which holds only if nobody directs two;
 * #38's *program with no director* strip wants the opposite. #49 ruled the second
 * against the first at the requester's direction, and ruling it that way dissolves
 * #42's constraint by construction rather than trading against it.
 *
 * Appointing a director is **two writes** and must not read as two acts (#34, #38):
 * the `user_role` row above and this one, both by the chair, in one control.
 */
export const PROGRAM_DIRECTORS = [
  { programCode: "ITP", netid: "pr3390", grantedBy: "tv1067", grantedAt: "2018-08-15T09:20:00Z" },
  { programCode: "IMA", netid: "ab9034", grantedBy: "tv1067", grantedAt: "2018-08-15T09:21:00Z" },
  { programCode: "LOWRES", netid: "hs5540", grantedBy: "tv1067", grantedAt: "2019-08-19T09:10:00Z" },
] as const satisfies readonly {
  programCode: FixtureProgram;
  netid: FixtureNetid;
  grantedBy: FixtureNetid;
  grantedAt: Timestamp;
}[];

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

/**
 * Reference-data rows carry `created_by NOT NULL` and #49 calls step 1 of the seed
 * order *no actor*. The seed writes the chair's netid: it is the map's own bootstrap
 * author, already used for the genesis grant, and it needs no new concept. A
 * derivation, recorded in the README rather than decided here.
 */
const REFERENCE_DATA_AUTHOR = "tv1067" satisfies FixtureNetid;

export const PROGRAMS = [
  { code: "ITP", name: "Interactive Telecommunications", degreeLevel: "graduate" },
  { code: "IMA", name: "Interactive Media Arts", degreeLevel: "undergraduate" },
  { code: "LOWRES", name: "IMA Low Residency", degreeLevel: "graduate" },
] as const satisfies readonly {
  code: FixtureProgram;
  name: string;
  degreeLevel: "undergraduate" | "graduate";
}[];

/**
 * Three terms — one finished, one under way, one being planned (#49, over four and
 * two).
 *
 * `sis_term_code` is filled on the first two and null on the third, since it is
 * recorded and never load-bearing (#3), and a term nobody has registered for yet is
 * exactly where NYU's own code has not arrived.
 *
 * **No fixture depends on term dates**, which #3 deferred: the terms are ordered by
 * `code` as text and *under way* is a property of the states in them.
 */
export const TERMS = [
  { code: "20261", year: 2026, semester: "Spring", sisTermCode: "1264", standing: "finished" },
  { code: "20263", year: 2026, semester: "Fall", sisTermCode: "1268", standing: "under way" },
  { code: "20271", year: 2027, semester: "Spring", sisTermCode: null, standing: "being planned" },
] as const satisfies readonly {
  code: FixtureTerm;
  year: number;
  semester: "Spring" | "Summer" | "Fall";
  sisTermCode: string | null;
  standing: string;
}[];

/** Program-scoped (#25 — the call #7 recommended against and the requester overruled). */
export const AREAS = [
  { key: "A1", programCode: "ITP", name: "Physical Interaction", createdBy: REFERENCE_DATA_AUTHOR },
  {
    key: "A2",
    programCode: "ITP",
    name: "Networks",
    createdBy: REFERENCE_DATA_AUTHOR,
    updatedAt: "2026-04-15T11:00:00Z",
    updatedBy: "pr3390",
    note: "The `area` field edit — one of #40's seven, and the one with no in-app control behind it. See `SEED_ONLY`.",
  },
  { key: "A3", programCode: "ITP", name: "Design & Fabrication", createdBy: REFERENCE_DATA_AUTHOR },
  { key: "A4", programCode: "ITP", name: "Media & Storytelling", createdBy: REFERENCE_DATA_AUTHOR },
  { key: "A5", programCode: "IMA", name: "Code & Media", createdBy: REFERENCE_DATA_AUTHOR },
  { key: "A6", programCode: "IMA", name: "Interactive Design", createdBy: REFERENCE_DATA_AUTHOR },
  { key: "A7", programCode: "IMA", name: "Sound & Image", createdBy: REFERENCE_DATA_AUTHOR },
  { key: "A8", programCode: "LOWRES", name: "Computational Media", createdBy: REFERENCE_DATA_AUTHOR },
  { key: "A9", programCode: "LOWRES", name: "Residency Studio", createdBy: REFERENCE_DATA_AUTHOR },
] as const satisfies readonly {
  key: AreaKey;
  programCode: FixtureProgram;
  name: string;
  createdBy: FixtureNetid;
  updatedAt?: Timestamp;
  updatedBy?: FixtureNetid;
  note?: string;
}[];

/**
 * `credits` is null on all three electives — **the column doing its job rather than a
 * gap** (#49). An elective category imposes no credit total; a core one does.
 */
export const REQUIREMENT_CATEGORIES = [
  { key: "Q1", programCode: "ITP", name: "Core", credits: 12, groupNo: 1, createdBy: REFERENCE_DATA_AUTHOR },
  { key: "Q2", programCode: "ITP", name: "Elective", credits: null, groupNo: 2, createdBy: REFERENCE_DATA_AUTHOR },
  { key: "Q3", programCode: "IMA", name: "Foundations", credits: 8, groupNo: 1, createdBy: REFERENCE_DATA_AUTHOR },
  { key: "Q4", programCode: "IMA", name: "Media Studies", credits: 4, groupNo: 2, createdBy: REFERENCE_DATA_AUTHOR },
  { key: "Q5", programCode: "IMA", name: "Elective", credits: null, groupNo: 3, createdBy: REFERENCE_DATA_AUTHOR },
  { key: "Q6", programCode: "LOWRES", name: "Residency Intensive", credits: 8, groupNo: 1, createdBy: REFERENCE_DATA_AUTHOR },
  { key: "Q7", programCode: "LOWRES", name: "Elective", credits: null, groupNo: 2, createdBy: REFERENCE_DATA_AUTHOR },
] as const satisfies readonly {
  key: CategoryKey;
  programCode: FixtureProgram;
  name: string;
  credits: number | null;
  groupNo: number;
  createdBy: FixtureNetid;
}[];

// ---------------------------------------------------------------------------
// Proposals and reviews
// ---------------------------------------------------------------------------

/** One step in a machine's history. No `from_state` / `to_state`: `applyTransition` derives both (#13). */
export type ReviewStep = {
  event: ReviewEvent;
  actor: FixtureNetid;
  at: Timestamp;
  /** Free text on `develop` and `reject`, which #10 kept so a history reads like a real one. */
  reason?: string;
};

/**
 * A `course_proposal_review` row. **The row is the request** (#10): a program was
 * requested exactly when a review exists for it, so nothing records requested
 * programs separately.
 *
 * `areaHead` and `areas` are #32's assignment, both nullable and checked by no guard
 * — the rule they answer to (*no offering against a course with no area and no head*)
 * is a create-path invariant, not a transition guard.
 *
 * `endState` is an **assertion, not a stored value**. The seed drives `history` and
 * asserts it lands here; it is not written to a column, so it is not a second copy
 * standing principle 1 would object to.
 */
export type ReviewRow = {
  key: ReviewKey;
  programCode: FixtureProgram;
  areaHead: FixtureNetid | null;
  areas: readonly AreaKey[];
  history: readonly ReviewStep[];
  endState: ReviewState;
  /** Set on the review whose `approve` minted a course. */
  mints?: CourseKey;
  note?: string;
};

export type ProposalRow = {
  key: ProposalKey;
  title: string;
  credits: number;
  createdBy: FixtureNetid;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  updatedBy?: FixtureNetid;
  reviews: readonly ReviewRow[];
  note?: string;
};

/**
 * **Twenty-three proposals and twenty-nine reviews.** Sixteen ended in approval and
 * minted the seventeen-course catalog — *Machine Vision* mints twice — and seven have
 * minted nothing.
 *
 * `~8 in flight` was #49's override of a recommended ~4.
 *
 * The **fifteen quiet ones** (P9–P23) are specified by #49 at aggregate resolution:
 * one per remaining course, single-program except *Machine Vision*, dated 2018 to
 * 2025 so a course running since 2019 is not asked to claim it was proposed this
 * year, authored by instructors of the period, approved by the program's **current**
 * director or by the review's own area head, with roughly a third running through
 * `develop` first. Concretising them inside that envelope is not a decision — nothing
 * in the map turns on which Tuesday in 2021 P16 was approved — and the envelope's
 * every constraint is checked here rather than approximated.
 */
export const PROPOSALS = [
  // -- The eight in flight (#49) -------------------------------------------
  {
    key: "P1",
    title: "Physical Computing II",
    credits: 4,
    createdBy: "rc1129",
    createdAt: "2026-01-12T15:00:00Z",
    updatedAt: "2026-03-05T16:20:00Z",
    updatedBy: "rc1129",
    note: "**Three verdicts on one header, landed three weeks apart** — #42's whole screen, and #7's reason for splitting the machine. The body edit on 5 March is thirteen days after ITP minted C6 from it, which is the **drift line** on C6's course page and the only way that treatment appears. Legal because IMA's review is still `Developing` (#8, as scoped by #65) and `rc1129` is `created_by`.",
    reviews: [
      {
        key: "R1",
        programCode: "ITP",
        areaHead: "na2481",
        areas: ["A1"],
        mints: "C6",
        history: [{ event: "approve", actor: "pr3390", at: "2026-02-20T14:00:00Z" }],
        endState: "Approved",
      },
      {
        key: "R2",
        programCode: "IMA",
        areaHead: "ab9034",
        areas: ["A5"],
        history: [
          {
            event: "develop",
            actor: "ab9034",
            at: "2026-02-14T11:30:00Z",
            reason: "The outcomes overlap Creative Coding almost exactly. Please differentiate before we look again.",
          },
        ],
        endState: "Developing",
      },
      {
        key: "R3",
        programCode: "LOWRES",
        areaHead: null,
        areas: [],
        history: [
          {
            event: "reject",
            actor: "hs5540",
            at: "2026-03-02T10:00:00Z",
            reason: "A weekly hardware lab cannot run in a low-residency format, and there is no intensive version of it.",
          },
        ],
        endState: "Rejected",
      },
    ],
  },
  {
    key: "P2",
    title: "Critical Data Practice",
    credits: 4,
    createdBy: "na2481",
    createdAt: "2026-02-02T13:00:00Z",
    note: "**The author is also the assigned area head.** The coincidence the review page states and nothing refuses — ruled out of scope on the map by #42 — and the one review reachable by **two Tier 3 arms at once**, `created_by` and `review.area_head`. #65 widened the cost it carries: an assigned head may now edit the shared body and then approve it, without having been the proposer.",
    reviews: [
      {
        key: "R4",
        programCode: "ITP",
        areaHead: "na2481",
        areas: ["A1"],
        history: [],
        endState: "Proposed",
        note: "`area_head` was assigned after the row was created — one of #40's seven field edits, written by `pr3390` under the Review assignment class, legal because the review is `Proposed`.",
      },
    ],
  },
  {
    key: "P3",
    title: "Sound as Material",
    credits: 2,
    createdBy: "xq7742",
    createdAt: "2026-01-28T09:40:00Z",
    note: "A proposal whose author has **no name on file**, on a screen that names the proposer on every group header (#42). The proposals list is where `xq7742` renders without touching a roster.",
    reviews: [
      { key: "R5", programCode: "IMA", areaHead: "ab9034", areas: ["A7"], history: [], endState: "Proposed" },
    ],
  },
  {
    key: "P4",
    title: "Speculative Futures Studio",
    credits: 4,
    createdBy: "rc1129",
    createdAt: "2025-10-03T14:20:00Z",
    note: "**The chair acting on a program they do not direct** — #42's requirement, and the only place #34's bypass is exercised in data. #49 put it on a review rather than on a class deliberately: ruling the LowRes conflict the other way would have signed every LowRes act with the chair's name and left no ordinary LowRes point of view to switch to.",
    reviews: [
      {
        key: "R6",
        programCode: "LOWRES",
        areaHead: "na2481",
        areas: ["A8"],
        history: [
          {
            event: "develop",
            actor: "tv1067",
            at: "2025-10-29T16:00:00Z",
            reason: "Hana is on leave and this cannot wait a month. Needs a residency plan before it goes further.",
          },
        ],
        endState: "Developing",
      },
    ],
  },
  {
    key: "P5",
    title: "Narrative Systems",
    credits: 4,
    createdBy: "rc1129",
    createdAt: "2026-03-11T10:10:00Z",
    note: "Single-program, seven months in development at the world date — the long-running one, and the only shape where *sent back* is the whole story.",
    reviews: [
      {
        key: "R7",
        programCode: "IMA",
        areaHead: "ab9034",
        areas: ["A6"],
        history: [
          {
            event: "develop",
            actor: "ab9034",
            at: "2026-03-18T15:45:00Z",
            reason: "Promising, but it needs a reading list and a clearer relationship to Interactive Narrative.",
          },
        ],
        endState: "Developing",
      },
    ],
  },
  {
    key: "P6",
    title: "Embodied Interfaces",
    credits: 4,
    createdBy: "by6640",
    createdAt: "2026-10-12T11:00:00Z",
    note: "Eight days old at the world date, nothing done — three programs with nothing to say yet, and a proposal by the student who teaches.",
    reviews: [
      { key: "R8", programCode: "ITP", areaHead: null, areas: [], history: [], endState: "Proposed" },
      { key: "R9", programCode: "IMA", areaHead: null, areas: [], history: [], endState: "Proposed" },
      { key: "R10", programCode: "LOWRES", areaHead: null, areas: [], history: [], endState: "Proposed" },
    ],
  },
  {
    key: "P7",
    title: "Wearable Studio",
    credits: 2,
    createdBy: "hs4417",
    createdAt: "2026-09-04T12:00:00Z",
    note: "Rejected outright, which #42 gave its own filter because — unlike a retired course — it leads nowhere.",
    reviews: [
      {
        key: "R11",
        programCode: "ITP",
        areaHead: "na2481",
        areas: ["A3"],
        history: [
          {
            event: "reject",
            actor: "pr3390",
            at: "2026-09-21T09:30:00Z",
            reason: "Covered by Introduction to Fabrication's second half. Retired or not, we are not running both.",
          },
        ],
        endState: "Rejected",
      },
    ],
  },
  {
    key: "P8",
    title: "Data & Society",
    credits: 4,
    createdBy: "ab9034",
    createdAt: "2026-09-15T08:50:00Z",
    note: "A director proposing into someone else's program, and the case where a reader may **read a sibling's verdict and not act on it** — #42's read-only page.",
    reviews: [
      {
        key: "R12",
        programCode: "ITP",
        areaHead: "na2481",
        areas: ["A4"],
        history: [
          {
            event: "develop",
            actor: "pr3390",
            at: "2026-09-28T13:15:00Z",
            reason: "We would take this at 2 credits as a seminar. At 4 it collides with the IMA version.",
          },
        ],
        endState: "Developing",
      },
      { key: "R13", programCode: "IMA", areaHead: "ab9034", areas: ["A6"], history: [], endState: "Proposed" },
    ],
  },

  // -- The fifteen quiet ones (#49) ----------------------------------------
  {
    key: "P9",
    title: "Physical Computing",
    credits: 4,
    createdBy: "tv1067",
    createdAt: "2018-09-10T10:00:00Z",
    reviews: [
      {
        key: "R14",
        programCode: "ITP",
        areaHead: "na2481",
        areas: ["A1"],
        mints: "C1",
        history: [{ event: "approve", actor: "pr3390", at: "2018-11-05T14:00:00Z" }],
        endState: "Approved",
      },
    ],
  },
  {
    key: "P10",
    title: "Live Web",
    credits: 2,
    createdBy: "na2481",
    createdAt: "2019-02-11T10:00:00Z",
    reviews: [
      {
        key: "R15",
        programCode: "ITP",
        areaHead: "na2481",
        areas: ["A2"],
        mints: "C2",
        history: [{ event: "approve", actor: "na2481", at: "2019-04-08T14:00:00Z" }],
        endState: "Approved",
        note: "Approved by the review's own **area head** rather than by a director — #32's route, restored to the table after #8's prose dropped it. `course.created_by` is therefore the head, which is #32 amending #13 on who the approving actor is.",
      },
    ],
  },
  {
    key: "P11",
    title: "Introduction to Fabrication",
    credits: 4,
    createdBy: "tv1067",
    createdAt: "2018-10-01T10:00:00Z",
    reviews: [
      {
        key: "R16",
        programCode: "ITP",
        areaHead: "jl8802",
        areas: ["A3"],
        mints: "C3",
        history: [
          { event: "develop", actor: "jl8802", at: "2018-10-22T11:00:00Z", reason: "Split the shop-safety component out of week one; it needs its own session." },
          { event: "approve", actor: "jl8802", at: "2018-12-03T14:00:00Z" },
        ],
        endState: "Approved",
      },
    ],
  },
  {
    key: "P12",
    title: "Video Sketchbook",
    credits: 2,
    createdBy: "hs4417",
    createdAt: "2020-01-20T10:00:00Z",
    reviews: [
      {
        key: "R17",
        programCode: "ITP",
        areaHead: "na2481",
        areas: ["A4"],
        mints: "C4",
        history: [{ event: "approve", actor: "pr3390", at: "2020-03-16T14:00:00Z" }],
        endState: "Approved",
      },
    ],
  },
  {
    key: "P13",
    title: "Speculative Objects",
    credits: 2,
    createdBy: "rc1129",
    createdAt: "2024-09-16T10:00:00Z",
    reviews: [
      {
        key: "R18",
        programCode: "ITP",
        areaHead: null,
        areas: [],
        mints: "C5",
        history: [
          { event: "develop", actor: "pr3390", at: "2024-10-07T11:00:00Z", reason: "Give it a fabrication component or it is a reading group." },
          { event: "approve", actor: "pr3390", at: "2024-11-11T14:00:00Z" },
        ],
        endState: "Approved",
        note: "**Approved with neither an area nor a head assigned**, which #32 permits explicitly: a director may assign before approval, at it, or after, and the gate is the Offering create path. C5 is still in that state at the world date and is the *neither* case of #43's three shades of not-offerable.",
      },
    ],
  },
  {
    key: "P14",
    title: "Creative Coding",
    credits: 4,
    createdBy: "ab9034",
    createdAt: "2018-09-24T10:00:00Z",
    reviews: [
      {
        key: "R19",
        programCode: "IMA",
        areaHead: "ab9034",
        areas: ["A5"],
        mints: "C7",
        history: [{ event: "approve", actor: "ab9034", at: "2018-11-19T14:00:00Z" }],
        endState: "Approved",
      },
    ],
  },
  {
    key: "P15",
    title: "Nature of Code",
    credits: 4,
    createdBy: "ab9034",
    createdAt: "2019-09-23T10:00:00Z",
    reviews: [
      {
        key: "R20",
        programCode: "IMA",
        areaHead: "ab9034",
        areas: ["A5"],
        mints: "C8",
        history: [{ event: "approve", actor: "ab9034", at: "2019-11-18T14:00:00Z" }],
        endState: "Approved",
      },
    ],
  },
  {
    key: "P16",
    title: "Sound Studio",
    credits: 4,
    createdBy: "na2481",
    createdAt: "2021-02-15T10:00:00Z",
    reviews: [
      {
        key: "R21",
        programCode: "IMA",
        areaHead: "ab9034",
        areas: ["A7"],
        mints: "C9",
        history: [
          { event: "develop", actor: "ab9034", at: "2021-03-08T11:00:00Z", reason: "Room 406 cannot hold sixteen at once. Cap it or rewrite the studio component." },
          { event: "approve", actor: "ab9034", at: "2021-04-12T14:00:00Z" },
        ],
        endState: "Approved",
      },
    ],
  },
  {
    key: "P17",
    title: "Interaction Design Studio",
    credits: 4,
    createdBy: "ab9034",
    createdAt: "2018-10-08T10:00:00Z",
    reviews: [
      {
        key: "R22",
        programCode: "IMA",
        areaHead: "ab9034",
        areas: ["A6"],
        mints: "C10",
        history: [{ event: "approve", actor: "ab9034", at: "2018-12-10T14:00:00Z" }],
        endState: "Approved",
      },
    ],
  },
  {
    key: "P18",
    title: "Sound as Interface",
    credits: 2,
    createdBy: "rc1129",
    createdAt: "2023-09-18T10:00:00Z",
    reviews: [
      {
        key: "R23",
        programCode: "IMA",
        areaHead: null,
        areas: ["A7"],
        mints: "C11",
        history: [{ event: "approve", actor: "ab9034", at: "2023-11-13T14:00:00Z" }],
        endState: "Approved",
        note: "**An area and no head** — the row #43 named by hand when it said *half-missing is a real state of its own since #32 made area and head separate*.",
      },
    ],
  },
  {
    key: "P19",
    title: "Interactive Narrative",
    credits: 4,
    createdBy: "rc1129",
    createdAt: "2022-09-19T10:00:00Z",
    reviews: [
      {
        key: "R24",
        programCode: "IMA",
        areaHead: "ab9034",
        areas: [],
        mints: "C12",
        history: [
          { event: "develop", actor: "ab9034", at: "2022-10-10T11:00:00Z", reason: "Needs a written brief for the final project. One paragraph is not a brief." },
          { event: "approve", actor: "ab9034", at: "2022-11-14T14:00:00Z" },
        ],
        endState: "Approved",
        note: "**A head and no area** — the third shade of #43's not-offerable, and the mirror of R23.",
      },
    ],
  },
  {
    key: "P20",
    title: "Residency Studio I",
    credits: 4,
    createdBy: "na2481",
    createdAt: "2019-09-30T10:00:00Z",
    reviews: [
      {
        key: "R25",
        programCode: "LOWRES",
        areaHead: "na2481",
        areas: ["A9"],
        mints: "C14",
        history: [{ event: "approve", actor: "hs5540", at: "2019-11-25T14:00:00Z" }],
        endState: "Approved",
      },
    ],
  },
  {
    key: "P21",
    title: "Residency Studio II",
    credits: 4,
    createdBy: "na2481",
    createdAt: "2020-09-28T10:00:00Z",
    reviews: [
      {
        key: "R26",
        programCode: "LOWRES",
        areaHead: "na2481",
        areas: ["A9"],
        mints: "C15",
        history: [{ event: "approve", actor: "na2481", at: "2020-11-23T14:00:00Z" }],
        endState: "Approved",
      },
    ],
  },
  {
    key: "P22",
    title: "Remote Critique",
    credits: 2,
    createdBy: "rc1129",
    createdAt: "2022-02-14T10:00:00Z",
    reviews: [
      {
        key: "R27",
        programCode: "LOWRES",
        areaHead: "na2481",
        areas: ["A8"],
        mints: "C16",
        history: [
          { event: "develop", actor: "hs5540", at: "2022-03-07T11:00:00Z", reason: "If it is fully asynchronous, say so in the description — that is the point of it." },
          { event: "approve", actor: "hs5540", at: "2022-04-11T14:00:00Z" },
        ],
        endState: "Approved",
      },
    ],
  },
  {
    key: "P23",
    title: "Machine Vision",
    credits: 4,
    createdBy: "rc1129",
    createdAt: "2025-01-13T10:00:00Z",
    note: "**One body, two catalogs.** Requested of LowRes and ITP, approved by both four months apart, minting two courses under two numbers. C17 was then revised to *Machine Vision Systems*, which is #7's copy-rather-than-link semantics **actually diverging** rather than merely being permitted to — and it puts two rows with a common ancestor and different titles in the Catalog at once.",
    reviews: [
      {
        key: "R28",
        programCode: "LOWRES",
        areaHead: "na2481",
        areas: ["A8"],
        mints: "C13",
        history: [{ event: "approve", actor: "hs5540", at: "2025-03-10T14:00:00Z" }],
        endState: "Approved",
      },
      {
        key: "R29",
        programCode: "ITP",
        areaHead: "na2481",
        areas: ["A1"],
        mints: "C17",
        history: [{ event: "approve", actor: "pr3390", at: "2025-07-14T14:00:00Z" }],
        endState: "Approved",
      },
    ],
  },
] as const satisfies readonly ProposalRow[];

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

export type CourseStep = {
  event: CourseEvent;
  actor: FixtureNetid;
  at: Timestamp;
  reason?: string;
};

/**
 * A `course` row.
 *
 * `mintedFromReview` is **`NOT NULL`** since #49: every seeded course is minted
 * through a proposal and an approving review, which is what closed the nullability
 * #42 left open. `createdBy` is the approving **actor** — which may be the area head
 * rather than a director (#32 amending #13) — and `createdAt` is that `approve`.
 *
 * `edition` is **earned, not asserted**: it is one plus the number of `approve` rows
 * in `history`, and the seed lets `applyTransition` bump it rather than writing the
 * number. Stated here so a reader can check the two agree.
 */
export type CourseRow = {
  key: CourseKey;
  programCode: FixtureProgram;
  courseNumber: string;
  title: string;
  description: string;
  credits: number;
  url?: string;
  mintedFromReview: ReviewKey;
  createdBy: FixtureNetid;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  updatedBy?: FixtureNetid;
  areaHead: FixtureNetid | null;
  areas: readonly AreaKey[];
  categories: readonly CategoryKey[];
  history: readonly CourseStep[];
  /** One plus the number of `approve` rows in `history`. Asserted, not written. */
  edition: number;
  endState: CourseState;
  note?: string;
};

/**
 * **Seventeen courses** — seven ITP, six IMA, four LowRes. #49's override of a
 * recommended ~12, and it is what makes the state coverage sit in terms where it is
 * plausible rather than crowded into two.
 *
 * Three of them are **not offerable**, and all three shades are here (#43, #32):
 * C5 has neither an area nor a head, C11 has an area and no head, C12 has a head and
 * no area. None of the three has a class, which is the create-path invariant working
 * rather than an omission.
 */
export const COURSES = [
  {
    key: "C1",
    programCode: "ITP",
    courseNumber: "ITPG-GT 2233",
    title: "Physical Computing",
    description:
      "Sensing, actuating and the physical form of interaction. Microcontrollers, circuits and enclosure, built up over a term of weekly labs toward a final project shown in public.",
    credits: 4,
    mintedFromReview: "R14",
    createdBy: "pr3390",
    createdAt: "2018-11-05T14:00:00Z",
    updatedAt: "2023-06-20T13:00:00Z",
    updatedBy: "pr3390",
    areaHead: "na2481",
    areas: ["A1"],
    categories: ["Q1"],
    history: [
      { event: "revise", actor: "pr3390", at: "2020-06-15T10:00:00Z" },
      { event: "approve", actor: "pr3390", at: "2020-07-20T10:00:00Z" },
      { event: "revise", actor: "na2481", at: "2023-06-12T10:00:00Z" },
      { event: "approve", actor: "na2481", at: "2023-07-17T10:00:00Z" },
    ],
    edition: 3,
    endState: "Approved",
    note: "The description edit sits **inside** the second `Revising` window, which is the Course body class's state gate (#8) binding the seed as an invariant rather than a permission (#28). Its writer is the director while the `revise` was fired by the area head: two routes on one course, both legal, evaluated independently (#8).",
  },
  {
    key: "C2",
    programCode: "ITP",
    courseNumber: "ITPG-GT 2048",
    title: "Live Web",
    description:
      "Real-time communication on the web: sockets, streams and the design problems that only appear when two people are on the page at once.",
    credits: 2,
    mintedFromReview: "R15",
    createdBy: "na2481",
    createdAt: "2019-04-08T14:00:00Z",
    areaHead: "na2481",
    areas: ["A2"],
    categories: ["Q2"],
    history: [],
    edition: 1,
    endState: "Approved",
  },
  {
    key: "C3",
    programCode: "ITP",
    courseNumber: "ITPG-GT 1010",
    title: "Introduction to Fabrication",
    description:
      "Shop practice for people who have never held a tool: measuring, cutting, joining, finishing, and the safety habits that make the rest of it possible.",
    credits: 4,
    mintedFromReview: "R16",
    createdBy: "jl8802",
    createdAt: "2018-12-03T14:00:00Z",
    areaHead: "jl8802",
    areas: ["A3"],
    categories: ["Q1"],
    history: [
      { event: "revise", actor: "pr3390", at: "2019-05-06T10:00:00Z" },
      { event: "approve", actor: "pr3390", at: "2019-06-10T10:00:00Z" },
      { event: "revise", actor: "jl8802", at: "2020-05-04T10:00:00Z" },
      { event: "approve", actor: "jl8802", at: "2020-06-08T10:00:00Z" },
      { event: "revise", actor: "pr3390", at: "2021-05-03T10:00:00Z" },
      { event: "approve", actor: "pr3390", at: "2021-06-07T10:00:00Z" },
      { event: "revise", actor: "jl8802", at: "2022-05-02T10:00:00Z" },
      { event: "approve", actor: "jl8802", at: "2022-06-06T10:00:00Z" },
      { event: "retire", actor: "pr3390", at: "2024-05-06T10:00:00Z" },
    ],
    edition: 5,
    endState: "Retired",
    note: "**The `Retired` course** #43 requires the slating form to refuse, and the only reason `jl8802`'s area-head revoke comes away clean. It has no offerings, so `noLiveOfferings` held vacuously — #49's prose says *two concluded classes in its past*, and its own three term tables enumerate twenty-eight offerings with none of C3 among them. Resolved for the table, per the map's own four precedents. `retire` is director-only (#8), which is why the last act here is `pr3390`'s and not the head's.",
  },
  {
    key: "C4",
    programCode: "ITP",
    courseNumber: "ITPG-GT 2999",
    title: "Video Sketchbook",
    description:
      "A weekly making practice in moving image. Short assignments, shown and discussed, with no expectation that any of them is finished.",
    credits: 2,
    mintedFromReview: "R17",
    createdBy: "pr3390",
    createdAt: "2020-03-16T14:00:00Z",
    areaHead: "na2481",
    areas: ["A4"],
    categories: ["Q2"],
    history: [
      { event: "revise", actor: "pr3390", at: "2022-06-13T10:00:00Z" },
      { event: "approve", actor: "pr3390", at: "2022-07-18T10:00:00Z" },
      { event: "revise", actor: "na2481", at: "2026-09-14T10:00:00Z" },
    ],
    edition: 2,
    endState: "Revising",
    note: "**`Revising` at edition 2** — one cycle finished, a second `revise` fired and not yet approved. That is what makes the number and the state legible together, and it is #40's *an edition reading 2* occupied by the one course where the reader can see why.",
  },
  {
    key: "C5",
    programCode: "ITP",
    courseNumber: "ITPG-GT 3011",
    title: "Speculative Objects",
    description: "Design fiction as a making practice: props, artefacts and evidence from futures that do not exist.",
    credits: 2,
    mintedFromReview: "R18",
    createdBy: "pr3390",
    createdAt: "2024-11-11T14:00:00Z",
    areaHead: null,
    areas: [],
    categories: ["Q2"],
    history: [],
    edition: 1,
    endState: "Approved",
    note: "**Neither an area nor a head.** Carries #37's derived *not offerable yet* marker in the Catalog, appears in the slating form's picker under *Not yet — assignments missing* with the reason on the line, and refuses on its own course page.",
  },
  {
    key: "C6",
    programCode: "ITP",
    courseNumber: "ITPG-GT 2245",
    title: "Physical Computing II",
    description:
      "The second term of Physical Computing: networked devices, power, and the engineering of something meant to survive being installed somewhere.",
    credits: 4,
    mintedFromReview: "R1",
    createdBy: "pr3390",
    createdAt: "2026-02-20T14:00:00Z",
    areaHead: "na2481",
    areas: ["A1"],
    categories: ["Q2"],
    history: [],
    edition: 1,
    endState: "Approved",
    note: "Minted from a proposal whose body was **edited thirteen days later** — the drift line on this course's page, and the only place that treatment appears (#42, #7).",
  },
  {
    key: "C7",
    programCode: "IMA",
    courseNumber: "IMNY-UT 105",
    title: "Creative Coding",
    description: "Programming as a medium. Drawing, motion and interaction from first principles, for people who have not written code before.",
    credits: 4,
    mintedFromReview: "R19",
    createdBy: "ab9034",
    createdAt: "2018-11-19T14:00:00Z",
    areaHead: "ab9034",
    areas: ["A5"],
    categories: ["Q3"],
    history: [
      { event: "revise", actor: "ab9034", at: "2021-06-14T10:00:00Z" },
      { event: "approve", actor: "ab9034", at: "2021-07-19T10:00:00Z" },
    ],
    edition: 2,
    endState: "Approved",
  },
  {
    key: "C8",
    programCode: "IMA",
    courseNumber: "IMNY-UT 205",
    title: "Nature of Code",
    description: "Simulating natural systems in code: forces, particles, autonomous agents and the mathematics underneath them.",
    credits: 4,
    mintedFromReview: "R20",
    createdBy: "ab9034",
    createdAt: "2019-11-18T14:00:00Z",
    areaHead: "ab9034",
    areas: ["A5"],
    categories: ["Q5"],
    history: [],
    edition: 1,
    endState: "Approved",
  },
  {
    key: "C9",
    programCode: "IMA",
    courseNumber: "IMNY-UT 260",
    title: "Sound Studio",
    description: "Recording, editing and composition for people making work in other media. Studio practice, weekly.",
    credits: 4,
    mintedFromReview: "R21",
    createdBy: "ab9034",
    createdAt: "2021-04-12T14:00:00Z",
    areaHead: "ab9034",
    areas: ["A7"],
    categories: ["Q4"],
    history: [],
    edition: 1,
    endState: "Approved",
  },
  {
    key: "C10",
    programCode: "IMA",
    courseNumber: "IMNY-UT 120",
    title: "Interaction Design Studio",
    description: "Interfaces as designed objects: research, sketching, prototyping and critique, run as a studio rather than a lecture.",
    credits: 4,
    mintedFromReview: "R22",
    createdBy: "ab9034",
    createdAt: "2018-12-10T14:00:00Z",
    areaHead: "ab9034",
    areas: ["A6"],
    categories: ["Q3"],
    history: [
      { event: "revise", actor: "ab9034", at: "2020-06-08T10:00:00Z" },
      { event: "approve", actor: "ab9034", at: "2020-07-13T10:00:00Z" },
      { event: "revise", actor: "ab9034", at: "2023-06-05T10:00:00Z" },
      { event: "approve", actor: "ab9034", at: "2023-07-10T10:00:00Z" },
    ],
    edition: 3,
    endState: "Approved",
  },
  {
    key: "C11",
    programCode: "IMA",
    courseNumber: "IMNY-UT 310",
    title: "Sound as Interface",
    description: "Listening as an input device. Microphones, analysis and the design of things that respond to sound.",
    credits: 2,
    mintedFromReview: "R23",
    createdBy: "ab9034",
    createdAt: "2023-11-13T14:00:00Z",
    areaHead: null,
    areas: ["A7"],
    categories: ["Q4"],
    history: [],
    edition: 1,
    endState: "Approved",
    note: "**An area and no head** — the exact row #43 named. Not offerable.",
  },
  {
    key: "C12",
    programCode: "IMA",
    courseNumber: "IMNY-UT 410",
    title: "Interactive Narrative",
    description: "Story that the reader moves through. Branching, state, and what a plot becomes when the audience holds the controls.",
    credits: 4,
    mintedFromReview: "R24",
    createdBy: "ab9034",
    createdAt: "2022-11-14T14:00:00Z",
    areaHead: "ab9034",
    areas: [],
    categories: ["Q5"],
    history: [],
    edition: 1,
    endState: "Approved",
    note: "**A head and no area.** Not offerable — the mirror of C11, and the reason the refusal has to name which half is missing.",
  },
  {
    key: "C13",
    programCode: "LOWRES",
    courseNumber: "IMLR-GT 1500",
    title: "Machine Vision",
    description: "How cameras are made to see: detection, tracking and classification, and the politics of a system that decides what it is looking at.",
    credits: 4,
    mintedFromReview: "R28",
    createdBy: "hs5540",
    createdAt: "2025-03-10T14:00:00Z",
    areaHead: "na2481",
    areas: ["A8"],
    categories: ["Q6"],
    history: [],
    edition: 1,
    endState: "Approved",
    note: "One half of the twinned mint. Keeps the proposal's title; C17 did not.",
  },
  {
    key: "C14",
    programCode: "LOWRES",
    courseNumber: "IMLR-GT 1210",
    title: "Residency Studio I",
    description: "The first on-campus intensive: two weeks of studio work, critique and shop access, framing the year of remote work that follows.",
    credits: 4,
    mintedFromReview: "R25",
    createdBy: "hs5540",
    createdAt: "2019-11-25T14:00:00Z",
    areaHead: "na2481",
    areas: ["A9"],
    categories: ["Q6"],
    history: [
      { event: "revise", actor: "hs5540", at: "2022-06-06T10:00:00Z" },
      { event: "approve", actor: "hs5540", at: "2022-07-11T10:00:00Z" },
    ],
    edition: 2,
    endState: "Approved",
  },
  {
    key: "C15",
    programCode: "LOWRES",
    courseNumber: "IMLR-GT 1220",
    title: "Residency Studio II",
    description: "The second intensive: thesis work brought to the room it will be shown in, and the critique that decides what it becomes.",
    credits: 4,
    mintedFromReview: "R26",
    createdBy: "na2481",
    createdAt: "2020-11-23T14:00:00Z",
    areaHead: "na2481",
    areas: ["A9"],
    categories: ["Q6"],
    history: [],
    edition: 1,
    endState: "Approved",
  },
  {
    key: "C16",
    programCode: "LOWRES",
    courseNumber: "IMLR-GT 1610",
    title: "Remote Critique",
    description: "Critique that works at a distance and across time zones: written response, recorded walkthroughs, and the discipline of reading someone else's work closely.",
    credits: 2,
    mintedFromReview: "R27",
    createdBy: "hs5540",
    createdAt: "2022-04-11T14:00:00Z",
    areaHead: "na2481",
    areas: ["A8"],
    categories: ["Q7"],
    history: [],
    edition: 1,
    endState: "Approved",
  },
  {
    key: "C17",
    programCode: "ITP",
    courseNumber: "ITPG-GT 2560",
    title: "Machine Vision Systems",
    description:
      "How cameras are made to see, and what it costs to deploy one: detection, tracking, classification, and the engineering of a system that runs unattended.",
    credits: 4,
    mintedFromReview: "R29",
    createdBy: "pr3390",
    createdAt: "2025-07-14T14:00:00Z",
    areaHead: "na2481",
    areas: ["A1"],
    categories: ["Q2"],
    history: [
      { event: "revise", actor: "pr3390", at: "2025-09-08T10:00:00Z" },
      { event: "approve", actor: "pr3390", at: "2025-10-13T10:00:00Z" },
    ],
    edition: 2,
    endState: "Approved",
    note: "**The divergence.** Minted from the same body as C13 and revised into a different title and description four months later. #7 had the mint *copy* rather than reference precisely so this could happen; this is the only place in the seed where it has.",
  },
] as const satisfies readonly CourseRow[];

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

export type OfferingStep = {
  event: OfferingEvent;
  actor: FixtureNetid;
  at: Timestamp;
  /**
   * Who it was done to. Forced on `staff`, `unstaff`, `offer`, `accept`, `decline`
   * and `withdraw` — #15 added the column, #41 extended it to `offer` and `accept`
   * because a roster rewritten under the log makes both unattributable.
   */
  subject?: FixtureNetid;
  reason?: string;
};

/**
 * One `offering_instructor` row.
 *
 * **`grantedBy` / `grantedAt` on every row, position 0 included** (#61). The Creation
 * class is *written once, by the creating path* — whichever path that is — and a
 * conditional column is worse than a redundant one, so a position-0 row carries them
 * alongside the log's own `subject_netid` rather than instead of it.
 *
 * Every `grantedBy` here is **the offering's own program director**, and that is
 * forced from both sides: position 0 is written by `staff`, which #8 reserves to the
 * director, and positions 1..n were narrowed to the director alone by #61 — off #8's
 * decision-versus-execution axis, since seating a second paid instructor commits the
 * department to an appointment in the way reassigning a room does not.
 *
 * `grantedBy` also has to name someone who legitimately holds the write **at seed
 * time**, not on the fictional date: the checks read the end state (#49), so all
 * three sitting directors qualify and nobody else does.
 */
export type RosterRow = {
  position: number;
  netid: FixtureNetid;
  grantedBy: FixtureNetid;
  grantedAt: Timestamp;
  note?: string;
};

/** One `offering_meeting` row — #10's declared kind, with the shape CHECK behind it. */
export type MeetingRow =
  | { kind: "weekly"; dayOfWeek: number; startTime: string; endTime: string; room: string }
  | { kind: "dates"; startDate: string; endDate: string; startTime: string; endTime: string; room: string }
  | { kind: "async" };

/** A seat-sharing tag: another program declaring that this class counts toward its degree (#25, #30). */
export type SeatSharingTag = {
  kind: "area" | "requirement_category";
  key: AreaKey | CategoryKey;
  grantedBy: FixtureNetid;
  grantedAt: Timestamp;
};

export type OfferingRow = {
  key: OfferingKey;
  course: CourseKey;
  termCode: FixtureTerm;
  sectionNumber: string;
  createdBy: FixtureNetid;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  updatedBy?: FixtureNetid;
  callNumber: string | null;
  sisClassNumber: number | null;
  enrollmentLimit: number | null;
  mode: string | null;
  url?: string;
  roster: readonly RosterRow[];
  meetings: readonly MeetingRow[];
  seatSharing?: readonly SeatSharingTag[];
  history: readonly OfferingStep[];
  endState: OfferingState;
  note?: string;
};

/**
 * **Twenty-eight classes across three terms**, and **every one of the fourteen
 * Offering states is occupied in a term where it is plausible** — which is the whole
 * reason #49 took three terms and ~28 classes over the recommended two and ~20.
 *
 * `program_code` is absent from every row here on purpose: **nothing outside the
 * create path ever writes it** (#30), and the create path derives it from the course
 * inside the transaction, so it never appears in a create signature — including this
 * one.
 *
 * Operational fields follow commitment rather than being filled uniformly (#49):
 * `callNumber` and `sisClassNumber` from `Scheduled` onward and null before it,
 * `enrollmentLimit` on everything but `Slated`, `mode` drawn from *In person* /
 * *Online* / *Low residency* — free text, per #10's one refusal to guess a value set
 * — and `url` on three classes only.
 */
export const OFFERINGS = [
  // -- Spring 2026 · finished -----------------------------------------------
  {
    key: "O1",
    course: "C1",
    termCode: "20261",
    sectionNumber: "1",
    createdBy: "pr3390",
    createdAt: "2025-09-02T10:00:00Z",
    callNumber: "18422",
    sisClassNumber: 18422,
    enrollmentLimit: 18,
    mode: "In person",
    roster: [
      { position: 0, netid: "na2481", grantedBy: "pr3390", grantedAt: "2025-09-05T10:00:00Z" },
      { position: 1, netid: "rc1129", grantedBy: "pr3390", grantedAt: "2025-10-15T10:00:00Z" },
    ],
    meetings: [{ kind: "weekly", dayOfWeek: 1, startTime: "18:30", endTime: "21:00", room: "370J-447" }],
    history: [
      { event: "staff", actor: "pr3390", at: "2025-09-05T10:00:00Z", subject: "na2481" },
      { event: "offer", actor: "dk2210", at: "2025-09-08T10:00:00Z", subject: "na2481" },
      { event: "accept", actor: "na2481", at: "2025-09-12T10:00:00Z", subject: "na2481" },
      { event: "schedule", actor: "dk2210", at: "2025-10-06T10:00:00Z" },
      { event: "publish", actor: "dk2210", at: "2025-10-20T10:00:00Z" },
      { event: "list", actor: "dk2210", at: "2025-11-03T10:00:00Z" },
      { event: "run", actor: "dk2210", at: "2026-01-26T10:00:00Z" },
      { event: "evaluate", actor: "dk2210", at: "2026-05-11T10:00:00Z" },
      { event: "conclude", actor: "dk2210", at: "2026-05-25T10:00:00Z" },
    ],
    endState: "Concluded",
    note: "The co-instructor row was written **in `Published`**, four weeks after the class was listed — the Roster 1..n class is state-blind (#61, re-grounded on #8's field-class rule), and this is where the seed exercises it.",
  },
  {
    key: "O2",
    course: "C7",
    termCode: "20261",
    sectionNumber: "1",
    createdBy: "ab9034",
    createdAt: "2025-09-02T10:05:00Z",
    callNumber: "18510",
    sisClassNumber: 18510,
    enrollmentLimit: 20,
    mode: "In person",
    roster: [{ position: 0, netid: "hs4417", grantedBy: "ab9034", grantedAt: "2025-09-05T10:05:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 2, startTime: "09:30", endTime: "12:00", room: "370J-802" }],
    history: [
      { event: "staff", actor: "ab9034", at: "2025-09-05T10:05:00Z", subject: "hs4417" },
      { event: "offer", actor: "dk2210", at: "2025-09-08T10:05:00Z", subject: "hs4417" },
      { event: "accept", actor: "hs4417", at: "2025-09-11T10:05:00Z", subject: "hs4417" },
      { event: "schedule", actor: "dk2210", at: "2025-10-06T10:05:00Z" },
      { event: "publish", actor: "dk2210", at: "2025-10-20T10:05:00Z" },
      { event: "list", actor: "dk2210", at: "2025-11-03T10:05:00Z" },
      { event: "run", actor: "dk2210", at: "2026-01-26T10:05:00Z" },
      { event: "evaluate", actor: "dk2210", at: "2026-05-11T10:05:00Z" },
      { event: "conclude", actor: "dk2210", at: "2026-05-25T10:05:00Z" },
    ],
    endState: "Concluded",
    note: "One half of Hugo's entire teaching record. Both halves are `Concluded`, which is what makes his `instructor` revoke the clean one against Nora's blocked one (#38, #34).",
  },
  {
    key: "O3",
    course: "C8",
    termCode: "20261",
    sectionNumber: "1",
    createdBy: "ab9034",
    createdAt: "2025-09-02T10:10:00Z",
    callNumber: "18511",
    sisClassNumber: 18511,
    enrollmentLimit: 20,
    mode: "In person",
    roster: [{ position: 0, netid: "ab9034", grantedBy: "ab9034", grantedAt: "2025-09-05T10:10:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 3, startTime: "15:20", endTime: "17:50", room: "370J-410" }],
    history: [
      { event: "staff", actor: "ab9034", at: "2025-09-05T10:10:00Z", subject: "ab9034" },
      { event: "offer", actor: "dk2210", at: "2025-09-08T10:10:00Z", subject: "ab9034" },
      { event: "accept", actor: "ab9034", at: "2025-09-10T10:10:00Z", subject: "ab9034" },
      { event: "schedule", actor: "dk2210", at: "2025-10-06T10:10:00Z" },
      { event: "publish", actor: "dk2210", at: "2025-10-20T10:10:00Z" },
      { event: "list", actor: "dk2210", at: "2025-11-03T10:10:00Z" },
      { event: "run", actor: "dk2210", at: "2026-01-26T10:10:00Z" },
      { event: "evaluate", actor: "dk2210", at: "2026-05-11T10:10:00Z" },
      { event: "conclude", actor: "dk2210", at: "2026-05-25T10:10:00Z" },
    ],
    endState: "Concluded",
  },
  {
    key: "O4",
    course: "C14",
    termCode: "20261",
    sectionNumber: "1",
    createdBy: "hs5540",
    createdAt: "2025-09-02T10:15:00Z",
    callNumber: "18690",
    sisClassNumber: 18690,
    enrollmentLimit: 14,
    mode: "Low residency",
    roster: [{ position: 0, netid: "xq7742", grantedBy: "hs5540", grantedAt: "2025-09-05T10:15:00Z" }],
    meetings: [
      { kind: "dates", startDate: "2026-01-12", endDate: "2026-01-23", startTime: "10:00", endTime: "16:00", room: "370J-Commons" },
    ],
    history: [
      { event: "staff", actor: "hs5540", at: "2025-09-05T10:15:00Z", subject: "xq7742" },
      { event: "offer", actor: "dk2210", at: "2025-09-08T10:15:00Z", subject: "xq7742" },
      { event: "accept", actor: "xq7742", at: "2025-09-15T10:15:00Z", subject: "xq7742" },
      { event: "schedule", actor: "dk2210", at: "2025-10-06T10:15:00Z" },
      { event: "publish", actor: "dk2210", at: "2025-10-20T10:15:00Z" },
      { event: "list", actor: "dk2210", at: "2025-11-03T10:15:00Z" },
      { event: "run", actor: "dk2210", at: "2026-01-12T10:15:00Z" },
      { event: "evaluate", actor: "dk2210", at: "2026-02-02T10:15:00Z" },
      { event: "conclude", actor: "dk2210", at: "2026-02-16T10:15:00Z" },
    ],
    endState: "Concluded",
    note: "The first LowRes intensive — a `dates` meeting rather than a `weekly` one, which is the first thing in the skeleton that **visibly differs** by program (#10). Lead is the netid with no `person` row; see `OPEN_AGAINST_THIS_PACKAGE`.",
  },
  {
    key: "O5",
    course: "C2",
    termCode: "20261",
    sectionNumber: "1",
    createdBy: "pr3390",
    createdAt: "2025-09-02T10:20:00Z",
    callNumber: "18423",
    sisClassNumber: 18423,
    enrollmentLimit: 16,
    mode: "In person",
    roster: [{ position: 0, netid: "rc1129", grantedBy: "pr3390", grantedAt: "2025-09-05T10:20:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 4, startTime: "18:30", endTime: "21:00", room: "370J-410" }],
    history: [
      { event: "staff", actor: "pr3390", at: "2025-09-05T10:20:00Z", subject: "rc1129" },
      { event: "offer", actor: "dk2210", at: "2025-09-08T10:20:00Z", subject: "rc1129" },
      { event: "accept", actor: "rc1129", at: "2025-09-14T10:20:00Z", subject: "rc1129" },
      { event: "schedule", actor: "dk2210", at: "2025-10-06T10:20:00Z" },
      { event: "publish", actor: "dk2210", at: "2025-10-20T10:20:00Z" },
      { event: "list", actor: "dk2210", at: "2025-11-03T10:20:00Z" },
      { event: "run", actor: "dk2210", at: "2026-01-26T10:20:00Z" },
      { event: "evaluate", actor: "dk2210", at: "2026-05-11T10:20:00Z" },
    ],
    endState: "Evaluating",
    note: "**#14's closed backwater, occupied**: a class that finished and was never concluded. `Evaluating` can never re-enter the forward path, which is why #14 excluded it from `LIVE_STATES` — so this row does not block C2 from being retired.",
  },
  {
    key: "O6",
    course: "C9",
    termCode: "20261",
    sectionNumber: "1",
    createdBy: "ab9034",
    createdAt: "2025-09-02T10:25:00Z",
    callNumber: "18512",
    sisClassNumber: 18512,
    enrollmentLimit: 12,
    mode: "In person",
    roster: [{ position: 0, netid: "rc1129", grantedBy: "ab9034", grantedAt: "2025-09-05T10:25:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 5, startTime: "12:30", endTime: "15:00", room: "370J-406" }],
    history: [
      { event: "staff", actor: "ab9034", at: "2025-09-05T10:25:00Z", subject: "rc1129" },
      { event: "offer", actor: "dk2210", at: "2025-09-08T10:25:00Z", subject: "rc1129" },
      { event: "accept", actor: "rc1129", at: "2025-09-14T10:25:00Z", subject: "rc1129" },
      { event: "schedule", actor: "dk2210", at: "2025-10-06T10:25:00Z" },
      { event: "publish", actor: "dk2210", at: "2025-10-20T10:25:00Z" },
      { event: "list", actor: "dk2210", at: "2025-11-03T10:25:00Z" },
      { event: "run", actor: "dk2210", at: "2026-01-26T10:25:00Z" },
      { event: "evaluate", actor: "dk2210", at: "2026-05-11T10:25:00Z" },
      { event: "conclude", actor: "dk2210", at: "2026-05-25T10:25:00Z" },
    ],
    endState: "Concluded",
  },
  {
    key: "O7",
    course: "C4",
    termCode: "20261",
    sectionNumber: "1",
    createdBy: "pr3390",
    createdAt: "2025-09-02T10:30:00Z",
    callNumber: null,
    sisClassNumber: null,
    enrollmentLimit: 12,
    mode: "In person",
    roster: [],
    meetings: [{ kind: "weekly", dayOfWeek: 2, startTime: "18:30", endTime: "21:00", room: "370J-447" }],
    history: [
      { event: "kill", actor: "pr3390", at: "2025-10-14T10:30:00Z", reason: "No instructor available and the slot is needed for Live Web." },
    ],
    endState: "Dead",
    note: "**The shortest life a class can have**, and the only `kill` in the seed: slated and killed without ever being staffed. `kill` is director-only (#8).",
  },
  {
    key: "O8",
    course: "C10",
    termCode: "20261",
    sectionNumber: "1",
    createdBy: "ab9034",
    createdAt: "2025-09-02T10:35:00Z",
    callNumber: "18513",
    sisClassNumber: 18513,
    enrollmentLimit: 20,
    mode: "In person",
    roster: [{ position: 0, netid: "hs4417", grantedBy: "ab9034", grantedAt: "2025-09-05T10:35:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 1, startTime: "12:30", endTime: "15:00", room: "370J-802" }],
    history: [
      { event: "staff", actor: "ab9034", at: "2025-09-05T10:35:00Z", subject: "hs4417" },
      { event: "offer", actor: "dk2210", at: "2025-09-08T10:35:00Z", subject: "hs4417" },
      { event: "accept", actor: "hs4417", at: "2025-09-11T10:35:00Z", subject: "hs4417" },
      { event: "schedule", actor: "dk2210", at: "2025-10-06T10:35:00Z" },
      { event: "publish", actor: "dk2210", at: "2025-10-20T10:35:00Z" },
      { event: "list", actor: "dk2210", at: "2025-11-03T10:35:00Z" },
      { event: "run", actor: "dk2210", at: "2026-01-26T10:35:00Z" },
      { event: "evaluate", actor: "dk2210", at: "2026-05-11T10:35:00Z" },
      { event: "conclude", actor: "dk2210", at: "2026-05-25T10:35:00Z" },
    ],
    endState: "Concluded",
    note: "The other half of Hugo's teaching record.",
  },

  // -- Fall 2026 · under way ------------------------------------------------
  {
    key: "O9",
    course: "C1",
    termCode: "20263",
    sectionNumber: "1",
    createdBy: "pr3390",
    createdAt: "2026-03-02T10:00:00Z",
    updatedAt: "2026-09-15T09:00:00Z",
    updatedBy: "dk2210",
    callNumber: "19104",
    sisClassNumber: 19104,
    enrollmentLimit: 20,
    mode: "In person",
    url: "https://itp.nyu.edu/physcomp/",
    roster: [
      { position: 0, netid: "na2481", grantedBy: "pr3390", grantedAt: "2026-03-05T10:00:00Z" },
      { position: 1, netid: "rc1129", grantedBy: "pr3390", grantedAt: "2026-03-20T10:00:00Z" },
    ],
    meetings: [
      { kind: "weekly", dayOfWeek: 1, startTime: "18:30", endTime: "21:00", room: "370J-447" },
      { kind: "weekly", dayOfWeek: 3, startTime: "15:20", endTime: "16:20", room: "370J-410" },
    ],
    seatSharing: [
      { kind: "area", key: "A5", grantedBy: "ab9034", grantedAt: "2026-05-10T10:00:00Z" },
      { kind: "requirement_category", key: "Q3", grantedBy: "ab9034", grantedAt: "2026-05-10T10:00:00Z" },
    ],
    history: [
      { event: "staff", actor: "pr3390", at: "2026-03-05T10:00:00Z", subject: "na2481" },
      { event: "offer", actor: "dk2210", at: "2026-03-09T10:00:00Z", subject: "na2481" },
      { event: "accept", actor: "na2481", at: "2026-03-12T10:00:00Z", subject: "na2481" },
      { event: "schedule", actor: "dk2210", at: "2026-04-06T10:00:00Z" },
      { event: "publish", actor: "dk2210", at: "2026-04-20T10:00:00Z" },
      { event: "list", actor: "dk2210", at: "2026-05-04T10:00:00Z" },
      { event: "run", actor: "dk2210", at: "2026-09-08T10:00:00Z" },
    ],
    endState: "Running",
    note: "**The seat-sharing class.** IMA's *Code & Media* area and *Foundations* category on an ITP section, written by IMA's director — the sole place in the whole model where a program other than the course's own appears (#25, made sole by #30). It is also the only class with **two meeting rows in two rooms**, which is why #10 moved `room` off the offering, and it carries two of #40's seven field edits: the enrolment limit and the second room, both by the coordinator under the state-blind Offering operational class.",
  },
  {
    key: "O10",
    course: "C1",
    termCode: "20263",
    sectionNumber: "2",
    createdBy: "pr3390",
    createdAt: "2026-03-02T10:05:00Z",
    callNumber: "19105",
    sisClassNumber: 19105,
    enrollmentLimit: 18,
    mode: "In person",
    roster: [{ position: 0, netid: "tv1067", grantedBy: "pr3390", grantedAt: "2026-03-05T10:05:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 2, startTime: "18:30", endTime: "21:00", room: "370J-447" }],
    history: [
      { event: "staff", actor: "pr3390", at: "2026-03-05T10:05:00Z", subject: "tv1067" },
      { event: "offer", actor: "dk2210", at: "2026-03-09T10:05:00Z", subject: "tv1067" },
      { event: "accept", actor: "tv1067", at: "2026-03-11T10:05:00Z", subject: "tv1067" },
      { event: "schedule", actor: "dk2210", at: "2026-04-06T10:05:00Z" },
      { event: "publish", actor: "dk2210", at: "2026-04-20T10:05:00Z" },
      { event: "list", actor: "dk2210", at: "2026-05-04T10:05:00Z" },
      { event: "run", actor: "dk2210", at: "2026-09-08T10:05:00Z" },
    ],
    endState: "Running",
    note: "**The chair teaching** — #34's literal consequence, and the reason `tv1067` holds `instructor` in `ROLE_GRANTS`. The chair's bypass is a permission clause and never touches standing principle 6, so the roster row was unwritable until the grant existed. Also the second section of one course in one term, which is why there is no uniqueness on `(course_id, term_code)` (#30).",
  },
  {
    key: "O11",
    course: "C7",
    termCode: "20263",
    sectionNumber: "1",
    createdBy: "ab9034",
    createdAt: "2026-03-02T10:10:00Z",
    callNumber: "19210",
    sisClassNumber: 19210,
    enrollmentLimit: 20,
    mode: "In person",
    roster: [{ position: 0, netid: "rc1129", grantedBy: "ab9034", grantedAt: "2026-03-05T10:10:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 4, startTime: "09:30", endTime: "12:00", room: "370J-802" }],
    history: [
      { event: "staff", actor: "ab9034", at: "2026-03-05T10:10:00Z", subject: "rc1129" },
      { event: "offer", actor: "dk2210", at: "2026-03-09T10:10:00Z", subject: "rc1129" },
      { event: "accept", actor: "rc1129", at: "2026-03-13T10:10:00Z", subject: "rc1129" },
      { event: "schedule", actor: "dk2210", at: "2026-04-06T10:10:00Z" },
      { event: "publish", actor: "dk2210", at: "2026-04-20T10:10:00Z" },
      { event: "list", actor: "dk2210", at: "2026-05-04T10:10:00Z" },
      { event: "run", actor: "dk2210", at: "2026-09-08T10:10:00Z" },
    ],
    endState: "Running",
  },
  {
    key: "O12",
    course: "C8",
    termCode: "20263",
    sectionNumber: "1",
    createdBy: "ab9034",
    createdAt: "2026-03-02T10:15:00Z",
    callNumber: "19211",
    sisClassNumber: 19211,
    enrollmentLimit: 20,
    mode: "In person",
    roster: [{ position: 0, netid: "by6640", grantedBy: "ab9034", grantedAt: "2026-09-02T10:15:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 3, startTime: "15:20", endTime: "17:50", room: "370J-410" }],
    history: [
      { event: "staff", actor: "ab9034", at: "2026-09-02T10:15:00Z", subject: "by6640" },
      { event: "offer", actor: "dk2210", at: "2026-09-03T10:15:00Z", subject: "by6640" },
      { event: "accept", actor: "by6640", at: "2026-09-04T10:15:00Z", subject: "by6640" },
      { event: "schedule", actor: "dk2210", at: "2026-09-05T10:15:00Z" },
      { event: "publish", actor: "dk2210", at: "2026-09-06T10:15:00Z" },
      { event: "list", actor: "dk2210", at: "2026-09-07T10:15:00Z" },
      { event: "run", actor: "dk2210", at: "2026-09-08T10:15:00Z" },
    ],
    endState: "Running",
    note: "**The student who teaches**, leading a class outright (#38). Staffed a day after the `instructor` grant landed, which is the shortest planning window in the seed and is meant to be: the whole point of the row is that one person holds two roles that see different systems.",
  },
  {
    key: "O13",
    course: "C2",
    termCode: "20263",
    sectionNumber: "1",
    createdBy: "pr3390",
    createdAt: "2026-03-02T10:20:00Z",
    callNumber: "19106",
    sisClassNumber: 19106,
    enrollmentLimit: 16,
    mode: "In person",
    roster: [{ position: 0, netid: "na2481", grantedBy: "pr3390", grantedAt: "2026-03-05T10:20:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 3, startTime: "18:30", endTime: "21:00", room: "370J-410" }],
    history: [
      { event: "staff", actor: "pr3390", at: "2026-03-05T10:20:00Z", subject: "na2481" },
      { event: "offer", actor: "dk2210", at: "2026-03-09T10:20:00Z", subject: "na2481" },
      { event: "accept", actor: "na2481", at: "2026-03-12T10:20:00Z", subject: "na2481" },
      { event: "schedule", actor: "dk2210", at: "2026-04-06T10:20:00Z" },
      { event: "publish", actor: "dk2210", at: "2026-04-20T10:20:00Z" },
      { event: "list", actor: "dk2210", at: "2026-05-04T10:20:00Z" },
      { event: "run", actor: "dk2210", at: "2026-09-08T10:20:00Z" },
    ],
    endState: "Running",
  },
  {
    key: "O14",
    course: "C6",
    termCode: "20263",
    sectionNumber: "1",
    createdBy: "pr3390",
    createdAt: "2026-03-02T10:25:00Z",
    callNumber: "19107",
    sisClassNumber: 19107,
    enrollmentLimit: 14,
    mode: "In person",
    roster: [{ position: 0, netid: "rc1129", grantedBy: "pr3390", grantedAt: "2026-03-05T10:25:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 5, startTime: "12:30", endTime: "15:00", room: "370J-447" }],
    history: [
      { event: "staff", actor: "pr3390", at: "2026-03-05T10:25:00Z", subject: "rc1129" },
      { event: "offer", actor: "dk2210", at: "2026-03-09T10:25:00Z", subject: "rc1129" },
      { event: "accept", actor: "rc1129", at: "2026-03-13T10:25:00Z", subject: "rc1129" },
      { event: "schedule", actor: "dk2210", at: "2026-04-06T10:25:00Z" },
      { event: "publish", actor: "dk2210", at: "2026-04-20T10:25:00Z" },
      { event: "list", actor: "dk2210", at: "2026-05-04T10:25:00Z" },
      { event: "run", actor: "dk2210", at: "2026-09-08T10:25:00Z" },
    ],
    endState: "Running",
    note: "The first class of a course minted **this year**, from P1's ITP review — the shortest path in the seed from a proposal to a room.",
  },
  {
    key: "O15",
    course: "C16",
    termCode: "20263",
    sectionNumber: "1",
    createdBy: "hs5540",
    createdAt: "2026-03-02T10:30:00Z",
    callNumber: "19310",
    sisClassNumber: 19310,
    enrollmentLimit: 16,
    mode: "Online",
    url: "https://lowres.ima.nyu.edu/remote-critique/",
    roster: [{ position: 0, netid: "ab9034", grantedBy: "hs5540", grantedAt: "2026-03-05T10:30:00Z" }],
    meetings: [{ kind: "async" }],
    history: [
      { event: "staff", actor: "hs5540", at: "2026-03-05T10:30:00Z", subject: "ab9034" },
      { event: "offer", actor: "dk2210", at: "2026-03-09T10:30:00Z", subject: "ab9034" },
      { event: "accept", actor: "ab9034", at: "2026-03-12T10:30:00Z", subject: "ab9034" },
      { event: "schedule", actor: "dk2210", at: "2026-04-06T10:30:00Z" },
      { event: "publish", actor: "dk2210", at: "2026-04-20T10:30:00Z" },
      { event: "list", actor: "dk2210", at: "2026-05-04T10:30:00Z" },
      { event: "run", actor: "dk2210", at: "2026-09-08T10:30:00Z" },
    ],
    endState: "Running",
    note: "**Fully asynchronous** — one `async` meeting row and no time at all, which #10 made a positive statement rather than an absence so that an asynchronous class is distinguishable from an unscheduled one.",
  },
  {
    key: "O16",
    course: "C10",
    termCode: "20263",
    sectionNumber: "1",
    createdBy: "ab9034",
    createdAt: "2026-03-02T10:35:00Z",
    callNumber: "19212",
    sisClassNumber: 19212,
    enrollmentLimit: 18,
    mode: "In person",
    roster: [{ position: 0, netid: "na2481", grantedBy: "ab9034", grantedAt: "2026-03-05T10:35:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 1, startTime: "12:30", endTime: "15:00", room: "370J-802" }],
    history: [
      { event: "staff", actor: "ab9034", at: "2026-03-05T10:35:00Z", subject: "na2481" },
      { event: "offer", actor: "dk2210", at: "2026-03-09T10:35:00Z", subject: "na2481" },
      { event: "accept", actor: "na2481", at: "2026-03-12T10:35:00Z", subject: "na2481" },
      { event: "schedule", actor: "dk2210", at: "2026-04-06T10:35:00Z" },
      { event: "publish", actor: "dk2210", at: "2026-04-20T10:35:00Z" },
      { event: "list", actor: "dk2210", at: "2026-05-04T10:35:00Z" },
      { event: "run", actor: "dk2210", at: "2026-09-08T10:35:00Z" },
    ],
    endState: "Running",
    note: "Nora's third live class. O9, O13 and O16 together are what block her `instructor` revoke (#34, #38) — the refusal counts roster rows on offerings in `LIVE_STATES`, and `Running` is in the set.",
  },
  {
    key: "O17",
    course: "C17",
    termCode: "20263",
    sectionNumber: "1",
    createdBy: "pr3390",
    createdAt: "2026-03-02T10:40:00Z",
    callNumber: "19108",
    sisClassNumber: 19108,
    enrollmentLimit: 14,
    mode: "In person",
    roster: [{ position: 0, netid: "xq7742", grantedBy: "pr3390", grantedAt: "2026-06-16T10:40:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 4, startTime: "15:20", endTime: "17:50", room: "370J-406" }],
    history: [
      { event: "staff", actor: "pr3390", at: "2026-06-16T10:40:00Z", subject: "xq7742" },
      { event: "offer", actor: "dk2210", at: "2026-06-18T10:40:00Z", subject: "xq7742" },
      { event: "accept", actor: "xq7742", at: "2026-06-22T10:40:00Z", subject: "xq7742" },
      { event: "schedule", actor: "dk2210", at: "2026-07-06T10:40:00Z" },
      { event: "publish", actor: "dk2210", at: "2026-07-20T10:40:00Z" },
      { event: "list", actor: "dk2210", at: "2026-08-03T10:40:00Z" },
      { event: "run", actor: "dk2210", at: "2026-09-08T10:40:00Z" },
    ],
    endState: "Running",
    note: "The divergent ITP twin of C13, running under a lead with no `person` row — so the Lineup renders a `Running` class whose instructor cell falls back to a netid (#9's *the read tolerates and never hides*).",
  },
  {
    key: "O18",
    course: "C13",
    termCode: "20263",
    sectionNumber: "1",
    createdBy: "hs5540",
    createdAt: "2026-03-02T10:45:00Z",
    callNumber: "19311",
    sisClassNumber: 19311,
    enrollmentLimit: 12,
    mode: "Low residency",
    roster: [{ position: 0, netid: "rc1129", grantedBy: "hs5540", grantedAt: "2026-03-05T10:45:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 5, startTime: "09:30", endTime: "12:00", room: "370J-410" }],
    history: [
      { event: "staff", actor: "hs5540", at: "2026-03-05T10:45:00Z", subject: "rc1129" },
      { event: "offer", actor: "dk2210", at: "2026-03-09T10:45:00Z", subject: "rc1129" },
      { event: "accept", actor: "rc1129", at: "2026-03-13T10:45:00Z", subject: "rc1129" },
      { event: "schedule", actor: "dk2210", at: "2026-04-06T10:45:00Z" },
      { event: "publish", actor: "dk2210", at: "2026-04-20T10:45:00Z" },
      { event: "list", actor: "dk2210", at: "2026-05-04T10:45:00Z" },
      { event: "cancel", actor: "hs5540", at: "2026-09-02T10:45:00Z", reason: "Four registrations against a floor of eight. Running it next spring instead." },
    ],
    endState: "Canceled",
    note: "**Cancelled from `Listed`** — #21's post-acceptance boundary occupied, drawn where ACT-UAW Art. IV(C) attaches pay to an *accepted* course. The roster row survives the cancellation (only `decline` and `withdraw` vacate position 0), so the log and the roster still agree on who was going to teach it. `cancel` is director-only (#8).",
  },

  // -- Spring 2027 · being planned ------------------------------------------
  {
    key: "O19",
    course: "C1",
    termCode: "20271",
    sectionNumber: "1",
    createdBy: "pr3390",
    createdAt: "2026-09-01T10:00:00Z",
    callNumber: "19602",
    sisClassNumber: 19602,
    enrollmentLimit: 20,
    mode: "In person",
    roster: [{ position: 0, netid: "na2481", grantedBy: "pr3390", grantedAt: "2026-09-04T10:00:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 1, startTime: "18:30", endTime: "21:00", room: "370J-447" }],
    history: [
      { event: "staff", actor: "pr3390", at: "2026-09-04T10:00:00Z", subject: "na2481" },
      { event: "offer", actor: "dk2210", at: "2026-09-08T10:00:00Z", subject: "na2481" },
      { event: "accept", actor: "dk2210", at: "2026-09-14T10:00:00Z", subject: "na2481" },
      { event: "schedule", actor: "dk2210", at: "2026-10-05T10:00:00Z" },
    ],
    endState: "Scheduled",
    note: "**The proxy `accept`** — taken by the coordinator from an email rather than clicked by the lead. `actor_netid` records who clicked and `subject_netid` who agreed, which is the asymmetry #8 fixed when it extended #15's proxy from `decline` to all three answers: acceptances arrive by email exactly as refusals do.",
  },
  {
    key: "O20",
    course: "C1",
    termCode: "20271",
    sectionNumber: "2",
    createdBy: "pr3390",
    createdAt: "2026-09-01T10:05:00Z",
    callNumber: null,
    sisClassNumber: null,
    enrollmentLimit: null,
    mode: null,
    roster: [],
    meetings: [{ kind: "weekly", dayOfWeek: 2, startTime: "18:30", endTime: "21:00", room: "370J-447" }],
    history: [],
    endState: "Slated",
    note: "*Running it, haven't picked who to ask* — the sharpened meaning `Slated` acquired when #15 split `Staffed` off it. Every operational field is null, which is what `Slated` looks like before anyone commits to anything.",
  },
  {
    key: "O21",
    course: "C1",
    termCode: "20271",
    sectionNumber: "3",
    createdBy: "pr3390",
    createdAt: "2026-09-01T10:10:00Z",
    callNumber: null,
    sisClassNumber: null,
    enrollmentLimit: 18,
    mode: "In person",
    roster: [
      {
        position: 1,
        netid: "rc1129",
        grantedBy: "pr3390",
        grantedAt: "2026-11-10T10:00:00Z",
        note: "Seated while the section was `Offered`, and still here after both leads left it. This row is the whole of #61's sixth empty state.",
      },
    ],
    meetings: [{ kind: "weekly", dayOfWeek: 4, startTime: "18:30", endTime: "21:00", room: "370J-447" }],
    history: [
      { event: "staff", actor: "pr3390", at: "2026-09-04T10:10:00Z", subject: "tv1067" },
      { event: "offer", actor: "dk2210", at: "2026-09-08T10:10:00Z", subject: "tv1067" },
      { event: "defer", actor: "tv1067", at: "2026-09-22T10:10:00Z", subject: "tv1067", reason: "Waiting on the sabbatical decision." },
      { event: "withdraw", actor: "pr3390", at: "2026-11-24T10:10:00Z", subject: "tv1067", reason: "The section had to be confirmed by 1 December." },
      { event: "staff", actor: "pr3390", at: "2026-11-26T10:10:00Z", subject: "hs4417" },
      { event: "offer", actor: "dk2210", at: "2026-11-27T10:10:00Z", subject: "hs4417" },
      { event: "decline", actor: "pr3390", at: "2026-12-04T10:10:00Z", subject: "hs4417", reason: "Recorded from Hugo's email; he is already at three sections." },
    ],
    endState: "Declined",
    note: "**#41's class, and #61's.** Two people held position 0 in one term and nobody holds it now — the exact configuration that forced `subject_netid` onto `offer` and `accept`, since read from the roster the log would attribute the first offer to nobody. It is also the seed's only section holding **co-instructors and no lead**: `withdraw` and `decline` each DELETE position 0 and leave everything below untouched, so this is a shape the machine's own edges **produce** rather than one written by hand. #61 amended #41 twice for it — the read model carries each row's `position` and the lead is whoever holds 0, never `roster[0]`, and the empty-state set went from five to six. Hugo's revoke stays clean because `Declined` is not in `LIVE_STATES` and his row was deleted on the decline.",
  },
  {
    key: "O22",
    course: "C13",
    termCode: "20271",
    sectionNumber: "1",
    createdBy: "hs5540",
    createdAt: "2025-10-06T10:00:00Z",
    callNumber: null,
    sisClassNumber: null,
    enrollmentLimit: 12,
    mode: "Low residency",
    url: "https://lowres.ima.nyu.edu/machine-vision/",
    roster: [{ position: 0, netid: "xq7742", grantedBy: "hs5540", grantedAt: "2026-06-16T10:00:00Z" }],
    meetings: [
      { kind: "dates", startDate: "2027-01-04", endDate: "2027-01-15", startTime: "10:00", endTime: "16:00", room: "370J-Commons" },
      { kind: "async" },
    ],
    seatSharing: [{ kind: "area", key: "A1", grantedBy: "pr3390", grantedAt: "2025-11-02T10:00:00Z" }],
    history: [
      { event: "staff", actor: "hs5540", at: "2026-06-16T10:00:00Z", subject: "xq7742" },
      { event: "offer", actor: "dk2210", at: "2026-06-18T10:00:00Z", subject: "xq7742" },
      { event: "accept", actor: "xq7742", at: "2026-06-25T10:00:00Z", subject: "xq7742" },
    ],
    endState: "Accepted",
    note: "**The January intensive**, and **seat sharing in the other direction**: ITP's *Physical Interaction* on a LowRes class, written by ITP's director. Two meeting rows of two different kinds on one class — `dates` and `async` — which together with O4, O15 and O23 exercises all three of #10's kinds. The lead accepted the offer himself, so `xq7742` is a history actor as well as a roster netid.",
  },
  {
    key: "O23",
    course: "C15",
    termCode: "20271",
    sectionNumber: "1",
    createdBy: "hs5540",
    createdAt: "2026-09-01T10:15:00Z",
    callNumber: null,
    sisClassNumber: null,
    enrollmentLimit: 12,
    mode: "Low residency",
    roster: [{ position: 0, netid: "by6640", grantedBy: "hs5540", grantedAt: "2026-10-05T10:15:00Z" }],
    meetings: [
      { kind: "dates", startDate: "2027-01-18", endDate: "2027-01-29", startTime: "10:00", endTime: "16:00", room: "370J-Commons" },
    ],
    history: [
      { event: "staff", actor: "hs5540", at: "2026-10-05T10:15:00Z", subject: "by6640" },
      { event: "offer", actor: "dk2210", at: "2026-10-14T10:15:00Z", subject: "by6640" },
    ],
    endState: "Offered",
    note: "An offer out and unanswered at the world date — which is what `Offered` certifies, its three exits being `accept`, `decline` and `defer` (#19).",
  },
  {
    key: "O24",
    course: "C7",
    termCode: "20271",
    sectionNumber: "1",
    createdBy: "ab9034",
    createdAt: "2026-09-01T10:20:00Z",
    callNumber: null,
    sisClassNumber: null,
    enrollmentLimit: 20,
    mode: "In person",
    roster: [{ position: 0, netid: "rc1129", grantedBy: "ab9034", grantedAt: "2026-10-12T10:20:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 2, startTime: "09:30", endTime: "12:00", room: "370J-802" }],
    history: [{ event: "staff", actor: "ab9034", at: "2026-10-12T10:20:00Z", subject: "rc1129" }],
    endState: "Staffed",
    note: "*Position 0 is occupied and nobody has been asked yet* — the state #15 introduced in place of the `hasLead` guard, which turns *which spring sections still need an instructor?* into a `status` filter rather than an anti-join.",
  },
  {
    key: "O25",
    course: "C8",
    termCode: "20271",
    sectionNumber: "1",
    createdBy: "ab9034",
    createdAt: "2026-09-01T10:25:00Z",
    callNumber: null,
    sisClassNumber: null,
    enrollmentLimit: 20,
    mode: "In person",
    roster: [{ position: 0, netid: "ab9034", grantedBy: "ab9034", grantedAt: "2026-09-04T10:25:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 3, startTime: "15:20", endTime: "17:50", room: "370J-410" }],
    history: [
      { event: "staff", actor: "ab9034", at: "2026-09-04T10:25:00Z", subject: "ab9034" },
      { event: "offer", actor: "dk2210", at: "2026-09-08T10:25:00Z", subject: "ab9034" },
      { event: "defer", actor: "ab9034", at: "2026-09-30T10:25:00Z", subject: "ab9034", reason: "Ask me again once the fall thesis load is settled." },
    ],
    endState: "Deferred",
    note: "**The lead's third answer**, not a departmental hold (#21). `Deferred` has exactly one inbound edge since #21 deleted the other three, which is what lets it certify *asked, no answer* — and is why it is operationally distinct from `Offered`: one wants a chase, the other wants a wait.",
  },
  {
    key: "O26",
    course: "C2",
    termCode: "20271",
    sectionNumber: "1",
    createdBy: "pr3390",
    createdAt: "2026-09-01T10:30:00Z",
    callNumber: "19603",
    sisClassNumber: 19603,
    enrollmentLimit: 16,
    mode: "In person",
    roster: [{ position: 0, netid: "na2481", grantedBy: "pr3390", grantedAt: "2026-09-04T10:30:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 4, startTime: "18:30", endTime: "21:00", room: "370J-410" }],
    history: [
      { event: "staff", actor: "pr3390", at: "2026-09-04T10:30:00Z", subject: "na2481" },
      { event: "offer", actor: "dk2210", at: "2026-09-08T10:30:00Z", subject: "na2481" },
      { event: "accept", actor: "na2481", at: "2026-09-11T10:30:00Z", subject: "na2481" },
      { event: "schedule", actor: "dk2210", at: "2026-10-05T10:30:00Z" },
      { event: "publish", actor: "dk2210", at: "2026-10-19T10:30:00Z" },
    ],
    endState: "Published",
    note: "Published the day before the world date. The **published-means-cancel** rule is dead (#8): the operational fields on this row stay editable, which is the exact post-hoc correction case #17 opened with.",
  },
  {
    key: "O27",
    course: "C10",
    termCode: "20271",
    sectionNumber: "1",
    createdBy: "ab9034",
    createdAt: "2026-09-01T10:35:00Z",
    callNumber: "19704",
    sisClassNumber: 19704,
    enrollmentLimit: 18,
    mode: "In person",
    roster: [{ position: 0, netid: "rc1129", grantedBy: "ab9034", grantedAt: "2026-09-04T10:35:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 1, startTime: "12:30", endTime: "15:00", room: "370J-802" }],
    history: [
      { event: "staff", actor: "ab9034", at: "2026-09-04T10:35:00Z", subject: "rc1129" },
      { event: "offer", actor: "dk2210", at: "2026-09-08T10:35:00Z", subject: "rc1129" },
      { event: "accept", actor: "rc1129", at: "2026-09-11T10:35:00Z", subject: "rc1129" },
      { event: "schedule", actor: "dk2210", at: "2026-10-05T10:35:00Z" },
      { event: "publish", actor: "dk2210", at: "2026-10-12T10:35:00Z" },
      { event: "list", actor: "dk2210", at: "2026-10-19T10:35:00Z" },
    ],
    endState: "Listed",
  },
  {
    key: "O28",
    course: "C6",
    termCode: "20271",
    sectionNumber: "1",
    createdBy: "pr3390",
    createdAt: "2026-09-01T10:40:00Z",
    callNumber: null,
    sisClassNumber: null,
    enrollmentLimit: null,
    mode: null,
    roster: [],
    meetings: [{ kind: "weekly", dayOfWeek: 5, startTime: "12:30", endTime: "15:00", room: "370J-447" }],
    history: [],
    endState: "Slated",
  },
] as const satisfies readonly OfferingRow[];

// ---------------------------------------------------------------------------
// Field edits
// ---------------------------------------------------------------------------

/**
 * **One field edit on every kind of record** (#40), because `updated_at` /
 * `updated_by` is the *only* trace of a change the transition log is forbidden to
 * record — the cost #17 took when it deleted the transition a field write used to
 * fire, and the argument #40 sharpened out of it.
 *
 * Each row below is also duplicated onto the record it edits, as `updatedAt` /
 * `updatedBy`. This list is the index, not a second source: it exists so a build
 * effort can check it wrote all seven, and so each edit can name the field class it
 * goes through and the gate it had to satisfy.
 */
export const FIELD_EDITS = [
  {
    table: "person",
    record: "by6640",
    what: "preferred first name added — official *Baoling*, preferred *Bao*",
    at: "2026-08-20T14:05:00Z",
    by: null,
    fieldClass: null,
    note: "**`updated_at` only.** `person` has no `updated_by` at all (#10): both actor columns name an actor and nothing in the skeleton writes a person, so they would be permanently null. This edit is the feed, not a field write, and it is why `display_name` has a preferred name to prefer.",
  },
  {
    table: "course",
    record: "C1",
    what: "description rewritten",
    at: "2023-06-20T13:00:00Z",
    by: "pr3390",
    fieldClass: "Course body",
    note: "Sits inside C1's second `Revising` window. The state gate is an **invariant** (#28) and therefore binds the seed exactly as it binds the chair — an edit dated outside a `Revising` window would be refused, not merely irregular.",
  },
  {
    table: "offering",
    record: "O9",
    what: "enrolment limit raised to 20",
    at: "2026-09-15T09:00:00Z",
    by: "dk2210",
    fieldClass: "Offering operational",
    note: "Written by the coordinator while the class is `Running`. State-blind on purpose (#8).",
  },
  {
    table: "offering_meeting",
    record: "O9",
    what: "second weekly slot added in a second room",
    at: "2026-09-15T09:00:00Z",
    by: "dk2210",
    fieldClass: "Offering operational",
    note: "#8's *meeting pattern* class governs **rows** rather than a column, because #10 moved `room` off `offering` once a class could meet in two rooms on two days — same writers, different mechanism.",
  },
  {
    table: "course_proposal",
    record: "P1",
    what: "body edited after ITP had already minted C6 from it",
    at: "2026-03-05T16:20:00Z",
    by: "rc1129",
    fieldClass: "Proposal body",
    note: "Legal by the `created_by` arm, under the actorless floor *at least one review is `Developing`* — IMA's has been since 14 February. The mint **copies** (#7), so this changes the proposal and not C6, which is the drift #42 made both pages state.",
  },
  {
    table: "course_proposal_review",
    record: "R4",
    what: "`area_head` assigned after the row was created",
    at: "2026-02-09T11:00:00Z",
    by: "pr3390",
    fieldClass: "Review assignment",
    note: "#32's point that a director may assign before approval, at it, or after — here it is *after* the row and before any verdict, with the review still `Proposed`. The writer refuses a netid not holding `area_head` (standing principle 6); `na2481` holds it.",
  },
  {
    table: "area",
    record: "A2",
    what: "renamed to *Networks*",
    at: "2026-04-15T11:00:00Z",
    by: "pr3390",
    fieldClass: null,
    note: "**Seed-only.** `area.name` sits in no field class, and #28's rule is that a column with no class is unwritable — so no control in the skeleton can perform this edit. It is seeded anyway on #49's own *rendered, never minted* precedent, which it set for `xq7742` and for Vera. See `SEED_ONLY`; this is a missing control rather than a missing rule, and it is not the same shape as the entry in `OPEN_AGAINST_THIS_PACKAGE`, which violates an invariant rather than lacking a screen.",
  },
] as const satisfies readonly {
  table: string;
  record: string;
  what: string;
  at: Timestamp;
  by: FixtureNetid | null;
  fieldClass: string | null;
  note: string;
}[];

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * **The order, and it is forced rather than chosen** (#34, extended at each end by
 * what the rows depend on).
 *
 * Steps 1 and 2 are the only writes with no in-app author — the same standing #43
 * gave programs, terms, areas and categories when it recorded them as *excluded from
 * the create forms rather than absent from them*. Everything from step 3 onward is a
 * write the running system can perform.
 */
export const SEED_ORDER = [
  { step: 1, writes: "`program`, `term`, `area`, `requirement_category`", actor: "none — reference data" },
  { step: 2, writes: "`person` rows, in the `people` project", actor: "none — the directory feed's job in a real deployment" },
  { step: 3, writes: "the one unchecked `chair` row", actor: "`tv1067`, unchecked — the genesis grant" },
  { step: 4, writes: "the remaining nineteen `user_role` rows", actor: "`tv1067`, checked" },
  { step: 5, writes: "the three `program_director` rows", actor: "`tv1067`, checked" },
  { step: 6, writes: "proposals, then reviews — the row that *is* the request", actor: "each proposal's author" },
  {
    step: 7,
    writes: "review transitions; each `approve` **mints a course** in the same transaction, copying body and assignment",
    actor: "the program's director, or the review's own area head",
  },
  { step: 8, writes: "course `revise` / `approve` cycles for the editions, and `retire` on C3", actor: "director or area head; `retire` director-only" },
  { step: 9, writes: "offerings created, then driven event by event", actor: "director, coordinator or lead, per the matrix" },
  { step: 10, writes: "seat-sharing tags on O9 and O22", actor: "the **other** program's director" },
  { step: 11, writes: "the field edits that leave `updated_at` / `updated_by` behind", actor: "per `FIELD_EDITS`" },
] as const;

/**
 * Exact counts, derived by enumerating this file rather than restated from #49.
 *
 * #49 gives round figures — *about 210 transitions*, *roughly 164 offering, 24
 * course, 24 review*. The offering count lands on 164 exactly, which is worth saying
 * because it is a check rather than a coincidence: it only comes out if every history
 * above walks the edges #17, #19 and #21 left in the machine. The other two are
 * higher than the round figures because #49's 24s do not count the `develop` steps or
 * C4's pending `revise`.
 */
export const COUNTS = {
  people: 13,
  netidsWithoutAPersonRow: 1,
  roleGrants: 20,
  programDirectorRows: 3,
  proposals: 23,
  reviews: 29,
  courses: 17,
  offerings: 28,
  offeringTransitions: 164,
  courseTransitions: 26,
  reviewTransitions: 28,
  fieldEdits: 7,
} as const;

/**
 * **All fourteen Offering states occupied**, each in a term where it is plausible.
 * This is what the three-term, twenty-eight-class sizing was bought for, and it is
 * the assertion a build effort should write a test against: the seed is only correct
 * if driving `history` through the machine produces exactly this partition.
 */
export const STATE_COVERAGE = {
  Slated: ["O20", "O28"],
  Staffed: ["O24"],
  Offered: ["O23"],
  Deferred: ["O25"],
  Accepted: ["O22"],
  Declined: ["O21"],
  Scheduled: ["O19"],
  Published: ["O26"],
  Listed: ["O27"],
  Running: ["O9", "O10", "O11", "O12", "O13", "O14", "O15", "O16", "O17"],
  Evaluating: ["O5"],
  Concluded: ["O1", "O2", "O3", "O4", "O6", "O8"],
  Canceled: ["O18"],
  Dead: ["O7"],
} as const satisfies Record<OfferingState, readonly OfferingKey[]>;

/**
 * #38's revoke refusals, both halves of all three pairs — blocked against clean, so
 * the roles page renders the refusal *and* the ordinary case for every role that has
 * one.
 *
 * `coordinator`, `student` and `advisor` are always clean, having no dependency #34
 * names, which the page shows rather than hides.
 */
export const REVOKE_COVERAGE = [
  {
    role: "instructor",
    blocked: {
      netid: "na2481",
      because:
        "five roster rows in `LIVE_STATES` — O9, O13 and O16 `Running`, O19 `Scheduled`, O26 `Published`. The last two are why the refusal has to read `LIVE_STATES` rather than *is it teaching now*.",
    },
    clean: { netid: "hs4417", because: "O2 and O8 are `Concluded`, and O21's row was deleted on the decline" },
  },
  {
    role: "area_head",
    blocked: { netid: "na2481", because: "heads nine courses, none of them retired" },
    clean: { netid: "jl8802", because: "heads C3 alone, and C3 is `Retired`" },
  },
  {
    role: "program_director",
    blocked: { netid: "pr3390", because: "directs ITP — as do `ab9034` and `hs5540` for theirs" },
    clean: { netid: "vm7781", because: "holds the role and directs nothing" },
  },
  {
    role: "chair",
    blocked: { netid: "tv1067", because: "the last remaining `chair` row, refused by the authorization writer (#34)" },
    clean: null,
  },
] as const;

/**
 * **Rendered, never minted** — states the seed can reach that no screen can create.
 * #49 set this precedent with `xq7742` and applied it to Vera; the `area` rename
 * joins them here.
 *
 * Flagged rather than removed, because in each case the missing piece is a control
 * and not a rule. A build effort that reads one of these as a bug should add the
 * screen, not edit the seed.
 */
export const SEED_ONLY = [
  {
    what: "`vm7781` holds `program_director` and directs no program",
    why: "The roles page appoints a director as one control writing both rows, and nothing un-appoints one (#38, #51). If this reads as a bug rather than as a person who stepped down, the missing piece is an un-appoint control.",
  },
  {
    what: "ITP's *Networks* area renamed by `pr3390`",
    why: "`area.name` sits in no field class, so under #28 it is unwritable and no screen offers it. Reference-data maintenance is a screen the skeleton does not contain.",
  },
  {
    what: "the roles page's *program with no director* empty state is not seeded **and is not reachable at runtime**",
    why: "#49 ruled the LowRes conflict in favour of a full complement of directors, so #38's finding 1 stands as written. Not an omission — the same missing un-appoint control.",
  },
] as const;

/**
 * **What this package could not settle, and did not.**
 *
 * #50's rule for the transcription tickets is that a transcription which finds itself
 * *deciding* something has found a ticket rather than a paragraph, and #65 is the
 * precedent: a package is the first reader forced to write **one** answer down.
 *
 * Everything else in this file is #49's, #61's or #65's ruling carried over. This one
 * entry is a conflict between two closed tickets that no third ticket has resolved,
 * and the fixtures are written **as #49 ruled them** pending that resolution.
 */
export const OPEN_AGAINST_THIS_PACKAGE = [
  {
    conflict:
      "`xq7742` holds position 0 on O4, O17 and O22 while `people` has no row for that netid — and *a roster write refuses a netid the `people` project does not know* is a `FURTHER_INVARIANT` (#9, restated by #61), which under #28 binds the seed exactly as it binds the chair.",
    why_it_is_not_the_seed_only_shape:
      "Vera's row and the `area` rename lack a **control**; they violate nothing. These three roster rows violate an **invariant**, and #9 named the case outright — *in practice the netid arrives from a picker populated out of `people`, so this is a backstop against seed scripts and direct writes*. A seed script is precisely what this is.",
    what_is_at_stake:
      "#37 asked for a roster netid absent from `people` and #41 for the roster rendering that follows; #9's *the writer checks, the read tolerates* is what makes the read side safe. The state is real in production — a new hire ahead of the directory feed — and unreachable through a checked seed, because the seed writes `people` itself.",
    settledBy: [],
    graduatedAs: "#69",
  },
] as const;

/**
 * Amendments this package absorbs, recorded here as well as in the README so the
 * artifact is never the only place a change is visible (rule 3 of
 * docs/agents/spec-packages.md). An amendment **replaces** what it overturns.
 */
export const AMENDMENTS = [
  {
    amends: "#49",
    by: "#61",
    was: "`offering_instructor` carried no provenance columns.",
    now: "**Every roster row carries `granted_by` / `granted_at`, position 0 included**, and every `granted_by` in the seed is the offering's own program director — forced from both sides, since `staff` is director-only (#8) and positions 1..n were narrowed to the director alone by #61.",
  },
  {
    amends: "#49",
    by: "#61",
    was: "O21 had an empty roster, and no section held co-instructors without a lead.",
    now: "**O21 keeps `rc1129` at position 1.** `withdraw` and `decline` each DELETE position 0 and leave the rows below, so this is a shape the machine's edges produce; it is the only way #41's sixth empty state — *rows below a vacant position 0*, added by #61 — renders at all.",
  },
  {
    amends: "#49",
    by: "#65",
    was: "`hs5540` held no `instructor`, so that #43's refusal of the propose control had a person behind it.",
    now: "**`hs5540` holds `instructor`.** #65 found #43's narrowing was a misquote of #8's row and restored `program_director` and `area_head` as flat create arms, so a non-teaching director is no longer refused and the requester states every real director teaches. The refusal still renders, on `dk2210`, `ok3356` and `mo5512`; and the two restored arms are exercised by `vm7781` and `jl8802`, who reach the control through them and through nothing else.",
  },
  {
    amends: "#42",
    by: "#49",
    was: "`course.minted_from_review_id` was nullable, deferred by name to whoever settled the seed.",
    now: "**`NOT NULL`.** Every course here is minted through a proposal and an approving review, so the reason for the nullability is gone. Already carried in `docs/schema/classes.sql`; restated here because this package is what made it true.",
  },
] as const;
