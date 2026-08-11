/**
 * **The fixture world, as data the seed reads.**
 *
 * `docs/fixtures/fixtures.ts` is authoritative and `docs/fixtures/README.md`
 * carries the reasoning — why the cast is thirteen people, why `xq7742` holds no
 * roster row, why `endState` is an assertion rather than a column. This file
 * states the same world as code the seed runs (issues/78), converted rather than
 * lifted, exactly as issues/76 converted the machines and the permission model.
 * Where the two ever disagree the spec wins.
 *
 * Three things travel with the data and are worth knowing before reading it:
 *
 *   * **Nothing here is a snapshot** (issues/13). A course, a review and an
 *     offering each carry an *ordered event list*, and `db/seed.ts` calls
 *     `applyTransition` once per step. There is no `snapshot`, no `status` and
 *     no `from_state` / `to_state` anywhere below.
 *   * **`endState` and `edition` are assertions**, checked after the history is
 *     driven and written to no column.
 *   * **Keys are not columns.** `C1`, `O28`, `P23`, `R29` are issues/49's own
 *     labels. Every id in the schema is `bigint GENERATED ALWAYS AS IDENTITY`,
 *     so the seed resolves a key to an id as it inserts, and typing the keys as
 *     literal unions makes a mistyped cross-reference a compiler error rather
 *     than a foreign-key violation at seed time.
 *
 * The prose the artifact carries on every row — which ticket settled it, what it
 * earns its place by — is **not** copied here. It lives in `docs/fixtures/`, and
 * a second copy is what rule 3 of `docs/agents/spec-packages.md` forbids.
 */
import type { CourseState } from "@/lib/machines/course.machine";
import type { CourseProposalReviewState as ReviewState } from "@/lib/machines/course-proposal-review.machine";
import type { OfferingState } from "@/lib/machines/offering.machine";
import type { Role } from "@/lib/permissions";
import type {
  CourseEvent as CourseTransitionEvent,
  OfferingEvent as OfferingTransitionEvent,
  ReviewEvent as ReviewTransitionEvent,
} from "@/db/write/apply-transition";

/**
 * An ISO-8601 instant, always literal and never computed from run time
 * (issues/49). See `WORLD_DATE`.
 */
type Timestamp = string;

/**
 * The three event unions as **names**, taken off the write paths — which take
 * them off the machines — rather than restated here. A renamed event is a
 * compiler error in the histories below.
 */
type CourseEvent = CourseTransitionEvent["type"];
type ReviewEvent = ReviewTransitionEvent["type"];
type OfferingEvent = OfferingTransitionEvent["type"];
export const WORLD_DATE = "2026-10-20" as const;

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

export type PersonRow = {
  netid: FixtureNetid;
  universityId: string | null;
  officialFirstname: string;
  officialLastname: string;
  preferredFirstname?: string;
  preferredLastname?: string;
  pronouns?: string;
  updatedAt?: Timestamp;
};

export const PEOPLE = [
  {
    netid: "tv1067",
    universityId: "N10029341",
    officialFirstname: "Theo",
    officialLastname: "Vance",
    pronouns: "he/him",
  },
  {
    netid: "pr3390",
    universityId: "N10044182",
    officialFirstname: "Priya",
    officialLastname: "Raman",
    pronouns: "she/her",
  },
  {
    netid: "ab9034",
    universityId: "N10047710",
    officialFirstname: "Amina",
    officialLastname: "Bello",
    pronouns: "she/her",
  },
  {
    netid: "hs5540",
    universityId: "N10061903",
    officialFirstname: "Hana",
    officialLastname: "Sørensen",
    pronouns: "she/her",
  },
  {
    netid: "dk2210",
    universityId: "N10052266",
    officialFirstname: "Dana",
    officialLastname: "Kirsch",
    pronouns: "she/her",
  },
  {
    netid: "na2481",
    universityId: "N10031755",
    officialFirstname: "Nora",
    officialLastname: "Applebaum",
    pronouns: "she/her",
  },
  {
    netid: "rc1129",
    universityId: null,
    officialFirstname: "Rui",
    officialLastname: "Chen",
    pronouns: "they/them",
  },
  {
    netid: "hs4417",
    universityId: "N10036028",
    officialFirstname: "Hugo",
    officialLastname: "Santos",
    pronouns: "he/him",
  },
  {
    netid: "jl8802",
    universityId: null,
    officialFirstname: "Jae",
    officialLastname: "Lin",
  },
  {
    netid: "vm7781",
    universityId: "N10024419",
    officialFirstname: "Vera",
    officialLastname: "Molnar",
    pronouns: "she/her",
  },
  {
    netid: "by6640",
    universityId: "N10077342",
    officialFirstname: "Baoling",
    officialLastname: "Yun",
    preferredFirstname: "Bao",
    pronouns: "she/her",
    updatedAt: "2026-08-20T14:05:00Z",
  },
  {
    netid: "ok3356",
    universityId: "N10058817",
    officialFirstname: "Olu",
    officialLastname: "Kalu",
    pronouns: "he/him",
  },
  {
    netid: "mo5512",
    universityId: null,
    officialFirstname: "Marcus",
    officialLastname: "Ola",
    pronouns: "he/him",
  },
] as const satisfies readonly PersonRow[];

export type RoleGrantRow = {
  netid: FixtureNetid;
  role: Role;
  grantedBy: FixtureNetid;
  grantedAt: Timestamp;
  checked: boolean;
};

export const ROLE_GRANTS = [
  {
    netid: "tv1067",
    role: "chair",
    grantedBy: "tv1067",
    grantedAt: "2018-08-15T09:00:00Z",
    checked: false,
  },
  {
    netid: "tv1067",
    role: "instructor",
    grantedBy: "tv1067",
    grantedAt: "2018-08-15T09:05:00Z",
    checked: true,
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
  },
  { netid: "hs5540", role: "program_director", grantedBy: "tv1067", grantedAt: "2019-08-19T09:00:00Z", checked: true },
  {
    netid: "hs5540",
    role: "instructor",
    grantedBy: "tv1067",
    grantedAt: "2019-08-19T09:01:00Z",
    checked: true,
  },
  { netid: "ok3356", role: "advisor", grantedBy: "tv1067", grantedAt: "2022-01-10T09:00:00Z", checked: true },
  { netid: "rc1129", role: "instructor", grantedBy: "tv1067", grantedAt: "2021-09-01T09:00:00Z", checked: true },
  { netid: "dk2210", role: "coordinator", grantedBy: "tv1067", grantedAt: "2023-08-01T09:00:00Z", checked: true },
  { netid: "mo5512", role: "student", grantedBy: "tv1067", grantedAt: "2025-09-02T09:00:00Z", checked: true },
  { netid: "by6640", role: "student", grantedBy: "tv1067", grantedAt: "2025-09-02T09:01:00Z", checked: true },
  {
    netid: "xq7742",
    role: "instructor",
    grantedBy: "tv1067",
    grantedAt: "2026-06-15T09:00:00Z",
    checked: true,
  },
  {
    netid: "xq7742",
    role: "area_head",
    grantedBy: "tv1067",
    grantedAt: "2026-01-05T09:00:00Z",
    checked: true,
  },
  { netid: "by6640", role: "instructor", grantedBy: "tv1067", grantedAt: "2026-09-01T09:00:00Z", checked: true },
] as const satisfies readonly RoleGrantRow[];

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

/**
 * Reference-data rows carry `created_by NOT NULL` and issues/49 calls step 1 of
 * the seed order *no actor*. The seed writes the chair's netid: the map's own
 * bootstrap author, already spending the unchecked genesis grant, needing no new
 * concept. Derived rather than decided — see `docs/fixtures/README.md`.
 */
export const REFERENCE_DATA_AUTHOR = "tv1067" satisfies FixtureNetid;

export const PROGRAMS = [
  { code: "ITP", name: "Interactive Telecommunications", degreeLevel: "graduate" },
  { code: "IMA", name: "Interactive Media Arts", degreeLevel: "undergraduate" },
  { code: "LOWRES", name: "IMA Low Residency", degreeLevel: "graduate" },
] as const satisfies readonly {
  code: FixtureProgram;
  name: string;
  degreeLevel: "undergraduate" | "graduate";
}[];

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

export const AREAS = [
  { key: "A1", programCode: "ITP", name: "Physical Interaction", createdBy: REFERENCE_DATA_AUTHOR },
  {
    key: "A2",
    programCode: "ITP",
    name: "Networks",
    createdBy: REFERENCE_DATA_AUTHOR,
    updatedAt: "2026-04-15T11:00:00Z",
    updatedBy: "pr3390",
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
}[];

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

export type ReviewStep = {
  event: ReviewEvent;
  actor: FixtureNetid;
  at: Timestamp;
  reason?: string;
};

export type ReviewRow = {
  key: ReviewKey;
  programCode: FixtureProgram;
  areaHead: FixtureNetid | null;
  areas: readonly AreaKey[];
  history: readonly ReviewStep[];
  endState: ReviewState;
  mints?: CourseKey;
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
};

export const PROPOSALS = [
  {
    key: "P1",
    title: "Physical Computing II",
    credits: 4,
    createdBy: "rc1129",
    createdAt: "2026-01-12T15:00:00Z",
    updatedAt: "2026-03-05T16:20:00Z",
    updatedBy: "rc1129",
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
        areaHead: "xq7742",
        areas: ["A5"],
        history: [
          {
            event: "develop",
            actor: "xq7742",
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
    reviews: [
      {
        key: "R4",
        programCode: "ITP",
        areaHead: "na2481",
        areas: ["A1"],
        history: [],
        endState: "Proposed",
      },
    ],
  },
  {
    key: "P3",
    title: "Sound as Material",
    credits: 2,
    createdBy: "xq7742",
    createdAt: "2026-01-28T09:40:00Z",
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

export type CourseStep = {
  event: CourseEvent;
  actor: FixtureNetid;
  at: Timestamp;
  reason?: string;
};

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
  edition: number;
  endState: CourseState;
};

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
  },
] as const satisfies readonly CourseRow[];

export type OfferingStep = {
  event: OfferingEvent;
  actor: FixtureNetid;
  at: Timestamp;
  subject?: FixtureNetid;
  reason?: string;
};

export type RosterRow = {
  position: number;
  netid: FixtureNetid;
  grantedBy: FixtureNetid;
  grantedAt: Timestamp;
};

export type MeetingRow =
  | { kind: "weekly"; dayOfWeek: number; startTime: string; endTime: string; room: string }
  | { kind: "dates"; startDate: string; endDate: string; startTime: string; endTime: string; room: string }
  | { kind: "async" };

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
};

export const OFFERINGS = [
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
    roster: [{ position: 0, netid: "hs5540", grantedBy: "hs5540", grantedAt: "2025-09-05T10:15:00Z" }],
    meetings: [
      { kind: "dates", startDate: "2026-01-12", endDate: "2026-01-23", startTime: "10:00", endTime: "16:00", room: "370J-Commons" },
    ],
    history: [
      { event: "staff", actor: "hs5540", at: "2025-09-05T10:15:00Z", subject: "hs5540" },
      { event: "offer", actor: "dk2210", at: "2025-09-08T10:15:00Z", subject: "hs5540" },
      { event: "accept", actor: "hs5540", at: "2025-09-15T10:15:00Z", subject: "hs5540" },
      { event: "schedule", actor: "dk2210", at: "2025-10-06T10:15:00Z" },
      { event: "publish", actor: "dk2210", at: "2025-10-20T10:15:00Z" },
      { event: "list", actor: "dk2210", at: "2025-11-03T10:15:00Z" },
      { event: "run", actor: "dk2210", at: "2026-01-12T10:15:00Z" },
      { event: "evaluate", actor: "dk2210", at: "2026-02-02T10:15:00Z" },
      { event: "conclude", actor: "dk2210", at: "2026-02-16T10:15:00Z" },
    ],
    endState: "Concluded",
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
  },

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
    roster: [{ position: 0, netid: "ab9034", grantedBy: "pr3390", grantedAt: "2026-06-16T10:40:00Z" }],
    meetings: [{ kind: "weekly", dayOfWeek: 4, startTime: "15:20", endTime: "17:50", room: "370J-406" }],
    history: [
      { event: "staff", actor: "pr3390", at: "2026-06-16T10:40:00Z", subject: "ab9034" },
      { event: "offer", actor: "dk2210", at: "2026-06-18T10:40:00Z", subject: "ab9034" },
      { event: "accept", actor: "ab9034", at: "2026-06-22T10:40:00Z", subject: "ab9034" },
      { event: "schedule", actor: "dk2210", at: "2026-07-06T10:40:00Z" },
      { event: "publish", actor: "dk2210", at: "2026-07-20T10:40:00Z" },
      { event: "list", actor: "dk2210", at: "2026-08-03T10:40:00Z" },
      { event: "run", actor: "dk2210", at: "2026-09-08T10:40:00Z" },
    ],
    endState: "Running",
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
  },

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
    roster: [{ position: 0, netid: "rc1129", grantedBy: "hs5540", grantedAt: "2026-06-16T10:00:00Z" }],
    meetings: [
      { kind: "dates", startDate: "2027-01-04", endDate: "2027-01-15", startTime: "10:00", endTime: "16:00", room: "370J-Commons" },
      { kind: "async" },
    ],
    seatSharing: [{ kind: "area", key: "A1", grantedBy: "pr3390", grantedAt: "2025-11-02T10:00:00Z" }],
    history: [
      { event: "staff", actor: "hs5540", at: "2026-06-16T10:00:00Z", subject: "rc1129" },
      { event: "offer", actor: "dk2210", at: "2026-06-18T10:00:00Z", subject: "rc1129" },
      { event: "accept", actor: "rc1129", at: "2026-06-25T10:00:00Z", subject: "rc1129" },
    ],
    endState: "Accepted",
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

export const FIELD_EDITS = [
  {
    table: "person",
    record: "by6640",
    what: "preferred first name added — official *Baoling*, preferred *Bao*",
    at: "2026-08-20T14:05:00Z",
    by: null,
    fieldClass: null,
  },
  {
    table: "course",
    record: "C1",
    what: "description rewritten",
    at: "2023-06-20T13:00:00Z",
    by: "pr3390",
    fieldClass: "Course body",
  },
  {
    table: "offering",
    record: "O9",
    what: "enrolment limit raised to 20",
    at: "2026-09-15T09:00:00Z",
    by: "dk2210",
    fieldClass: "Offering operational",
  },
  {
    table: "offering_meeting",
    record: "O9",
    what: "second weekly slot added in a second room",
    at: "2026-09-15T09:00:00Z",
    by: "dk2210",
    fieldClass: "Offering operational",
  },
  {
    table: "course_proposal",
    record: "P1",
    what: "body edited after ITP had already minted C6 from it",
    at: "2026-03-05T16:20:00Z",
    by: "rc1129",
    fieldClass: "Proposal body",
  },
  {
    table: "course_proposal_review",
    record: "R4",
    what: "`area_head` assigned after the row was created",
    at: "2026-02-09T11:00:00Z",
    by: "pr3390",
    fieldClass: "Review assignment",
  },
  {
    table: "area",
    record: "A2",
    what: "renamed to *Networks*",
    at: "2026-04-15T11:00:00Z",
    by: "pr3390",
    fieldClass: null,
  },
] as const satisfies readonly {
  table: string;
  record: string;
  what: string;
  at: Timestamp;
  by: FixtureNetid | null;
  fieldClass: string | null;
}[];

export const SEED_ORDER = [
  { step: 1, writes: "`program`, `term`, `area`, `requirement_category`", actor: "none — reference data" },
  { step: 2, writes: "`person` rows, in the `people` project", actor: "none — the directory feed's job in a real deployment" },
  { step: 3, writes: "the one unchecked `chair` row", actor: "`tv1067`, unchecked — the genesis grant" },
  { step: 4, writes: "the remaining twenty `user_role` rows", actor: "`tv1067`, checked" },
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

export const COUNTS = {
  people: 13,
  netidsWithoutAPersonRow: 1,
  roleGrants: 21,
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
 * **Rendered, never minted** — states the seed can reach that no screen can
 * create. Three of them, and in each case the missing piece is a **control** and
 * not a rule: a build effort that reads one of these as a bug should add the
 * screen, not edit the seed (issues/49, issues/69).
 *
 * The third is the odd one and is worth its place for that: it is seeded by
 * *not* being there. A program with no director is unreachable because
 * issues/49 ruled the LowRes conflict in favour of a full complement, and the
 * roles page appoints without un-appointing.
 */
export const SEED_ONLY = [
  { what: "`vm7781` holds `program_director` and directs no program" },
  { what: "ITP's *Networks* area renamed by `pr3390`" },
  { what: "the roles page's *program with no director* empty state, which is not seeded and is not reachable at runtime" },
] as const;

/** The fourteenth netid, which holds two roles and has no `person` row (issues/69). */
export const NETID_WITH_NO_PERSON_ROW = "xq7742" satisfies FixtureNetid;

// ---------------------------------------------------------------------------
// Concretised, not decided
// ---------------------------------------------------------------------------
// Five values the artifact implies and does not spell, each forced by a rule the
// seed has to satisfy rather than chosen. issues/49 set the precedent when it
// specified its fifteen quiet proposals at aggregate resolution: concretising
// inside an envelope every constraint of which is checked is not a decision, and
// nothing in the map turns on the wording of a paragraph.
//
// They exist because the seed **drives** the world rather than inserting it. A
// snapshot fixture can state a course's description and stop; a seed that walks
// the history has to know what the description was **before** the edit that
// produced it, and what body the mint copied before a revision diverged from it.

/**
 * The body every proposal was created with.
 *
 * Forced, not invented, wherever a proposal minted a course: `approve` **copies**
 * the proposal's title, description and credits into the new `course` row
 * (issues/7), so the proposal's body at mint time *is* the minted course's. The
 * seven that minted nothing carry a sentence of their own.
 *
 * Two carry the body as it stood *before* a later edit, which is the same
 * constraint read forwards: **P9** is C1's description before the rewrite of 20
 * June 2023, and **P23** is C13's and C17's shared body before C17 diverged from
 * it. A snapshot fixture can state the text after the edit and stop; a seed that
 * walks the history needs what was there first.
 */
export const PROPOSAL_DESCRIPTIONS = {
  P1: "The second term of Physical Computing: networked devices, power, and the engineering of something meant to survive being installed somewhere.",
  P2: "Data as a material with a politics: collection, cleaning, and the arguments a dataset is already making before anybody plots it.",
  P3: "Sound as something you build with rather than something you add at the end. Materials, resonance and the physical objects that make noise.",
  P4: "A studio for work set in futures that have not arrived: scenarios, artefacts and the critique of the assumptions underneath them.",
  P5: "Systems that tell stories: state, branching and the authoring problems that appear once a narrative has to remember what happened.",
  P6: "Interfaces worn on the body. Textiles, sensors and the design of something a person has to be willing to put on.",
  P7: "A making studio in soft materials: patterning, sewing, and the electronics that survive being washed.",
  P8: "What data does to the people it is collected from. Readings, cases and a term of argument about consent, inference and harm.",
  P9: "Sensing, actuating and the physical form of interaction. Microcontrollers, circuits and enclosure, over a term of weekly labs.",
  P10: "Real-time communication on the web: sockets, streams and the design problems that only appear when two people are on the page at once.",
  P11: "Shop practice for people who have never held a tool: measuring, cutting, joining, finishing, and the safety habits that make the rest of it possible.",
  P12: "A weekly making practice in moving image. Short assignments, shown and discussed, with no expectation that any of them is finished.",
  P13: "Design fiction as a making practice: props, artefacts and evidence from futures that do not exist.",
  P14: "Programming as a medium. Drawing, motion and interaction from first principles, for people who have not written code before.",
  P15: "Simulating natural systems in code: forces, particles, autonomous agents and the mathematics underneath them.",
  P16: "Recording, editing and composition for people making work in other media. Studio practice, weekly.",
  P17: "Interfaces as designed objects: research, sketching, prototyping and critique, run as a studio rather than a lecture.",
  P18: "Listening as an input device. Microphones, analysis and the design of things that respond to sound.",
  P19: "Story that the reader moves through. Branching, state, and what a plot becomes when the audience holds the controls.",
  P20: "The first on-campus intensive: two weeks of studio work, critique and shop access, framing the year of remote work that follows.",
  P21: "The second intensive: thesis work brought to the room it will be shown in, and the critique that decides what it becomes.",
  P22: "Critique that works at a distance and across time zones: written response, recorded walkthroughs, and the discipline of reading someone else's work closely.",
  P23: "How cameras are made to see: detection, tracking and classification, and the politics of a system that decides what it is looking at.",
} as const satisfies Record<ProposalKey, string>;

/**
 * The **drift line** (issues/42, issues/7). P1's body was edited thirteen days
 * after ITP minted C6 from it, and the mint copies rather than references — so
 * the proposal and the course say different things from 5 March onward, which is
 * the treatment C6's page exists to render. The artifact fixes the date, the
 * actor and the field class; the sentence is here.
 */
export const P1_BODY_AFTER_THE_EDIT =
  "The second term of Physical Computing: networked devices, power, and the engineering of something meant to survive being installed somewhere. Rewritten after IMA's review asked for a sharper line between this and Creative Coding — the work here is hardware that has to keep running unattended.";

/**
 * **The divergence** (issues/7, issues/49). C13 and C17 are minted from one body
 * four months apart, and C17 is then revised into a different title and
 * description — the only place in the seed where issues/7's copy-rather-than-link
 * semantics actually diverge rather than merely being permitted to.
 *
 * The artifact states the revision in C17's history and its outcome in C17's
 * title and description; what it does not state is the moment inside the
 * `Revising` window at which the body was written. It has to be inside that
 * window, because the Course body class's state gate is an **invariant** and
 * binds the seed exactly as it binds the chair (issues/8, issues/28) — so it sits
 * between the `revise` of 8 September and the `approve` of 13 October 2025.
 */
export const C17_DIVERGENCE = {
  at: "2025-09-22T10:00:00Z",
  writtenBy: "pr3390",
} as const satisfies { at: Timestamp; writtenBy: FixtureNetid };

/**
 * O9's enrolment limit **before** the coordinator raised it to 20 on 15
 * September 2026 — the artifact's Offering-operational field edit. Any value
 * below 20 tells the same story; 18 is the limit the other Physical Computing
 * section carries.
 */
export const O9_ENROLLMENT_LIMIT_BEFORE_THE_EDIT = 18;
