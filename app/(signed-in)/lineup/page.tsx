import { redirect } from "next/navigation";
import { Container, Group, Stack, Text, Title } from "@mantine/core";

import { listCatalogPrograms } from "@/db/read/catalog";
import {
  getLineupPage,
  listLineupTerms,
  type LineupFilters,
  type LineupTerm,
} from "@/db/read/lineup";
import { getActor } from "@/lib/auth/actor";
import { OFFERING_STATES, type OfferingState } from "@/lib/machines/offering.machine";

import { one } from "../query-params";
import { LineupFilterBar, type FilterOption } from "./lineup-filters";
import { LineupTable } from "./lineup-table";

/**
 * **The Lineup** — the classes running in one selected term, grouped on course and
 * term so that sibling sections read as variations rather than as repetition
 * (issues/37, issues/82).
 *
 * This page holds no database handle and writes no `WHERE` clause. It calls one
 * view-shaped read module and receives finished rows: the record, the roster with
 * every name already stitched in from the other project, what this actor may do
 * about it, and the refusal for what they may not. Everything it does with what comes
 * back is rendering.
 *
 * **The term picker is not optional**, the Lineup being term-scoped by definition
 * (issues/9), so the one filter with no empty value is the term — and its default is
 * the newest term the department has, whether or not anything is slated in it.
 *
 * **The two empty states are decided here and not in the read module.** *A term with
 * no offerings* and *a view filtered to nothing* are both no groups, and which one a
 * reader is looking at is a fact about what they clicked: this page knows, and the
 * module knows only the term it was asked about. There is no third empty state, and
 * in particular no empty group — a course whose every section is invisible to the
 * reader is absent from what the module returns.
 */
export default async function LineupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/be-somebody");

  const [terms, programs] = await Promise.all([listLineupTerms(), listCatalogPrograms()]);

  // A department with no terms has no Lineup to show, and it is not an error: the
  // reference data is the seed's first step, so this is what an unseeded database
  // looks like rather than what a broken one does.
  const newest = terms[0];
  if (!newest) return <NoTerms />;

  /**
   * **Every filter is narrowed to something the picker offers.** A query parameter is
   * a public input, and one the page cannot honour must not survive into `chosen` —
   * `chosen` is what the filter bar renders as its current value, so an unrecognised
   * `?status=Bogus` would leave the State control blank while the page rendered every
   * state, and the bar would then push the same nonsense back into the URL on the next
   * edit. A control that disagrees with the rows beneath it is worse than a control
   * that has been reset.
   */
  const params = await searchParams;
  const chosen = {
    termCode:
      offered(
        terms.map((term) => term.code),
        one(params.term),
      ) ?? newest.code,
    search: one(params.q) ?? "",
    programCode:
      offered(
        programs.map((program) => program.code),
        one(params.program),
      ) ?? "",
    status: offered(OFFERING_STATES, one(params.status)) ?? ANY_VIEW,
  };

  const filters: LineupFilters = {
    termCode: chosen.termCode,
    search: chosen.search || null,
    programCode: chosen.programCode || null,
    status: statusFor(chosen.status),
  };

  const groups = await getLineupPage(actor, filters);
  const sections = groups.reduce((total, group) => total + group.sectionCount, 0);

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={1}>The Lineup</Title>
          <Group gap="xs">
            <Text c="dimmed">
              The classes running in one term, gathered under the course they are sections of.
              Course-level facts are stated once; each section carries only what differs from its
              siblings.
            </Text>
          </Group>
        </Stack>

        <LineupFilterBar
          chosen={chosen}
          terms={terms.map((term) => ({
            value: term.code,
            label: labelFor(term),
          }))}
          programs={programs.map((program) => ({
            value: program.code,
            label: program.name,
          }))}
          statuses={STATUS_OPTIONS}
          matched={sections}
        />

        <LineupTable
          groups={groups}
          termLabel={labelFor(terms.find((term) => term.code === chosen.termCode) ?? newest)}
          filtered={Boolean(filters.search || filters.programCode || filters.status)}
        />
      </Stack>
    </Container>
  );
}

function NoTerms() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="xs">
        <Title order={1}>The Lineup</Title>
        <Text c="dimmed">
          There are no terms yet. The Lineup is scoped to one term by definition, so there is
          nothing for it to be scoped to — run <code>npm run db:reset</code> to seed the world.
        </Text>
      </Stack>
    </Container>
  );
}

/**
 * The status filter's own vocabulary. Unlike the Catalog's, its default is **any
 * state**: the Catalog hides `Retired` by default because a retired course is one
 * nobody can act on, where every Offering state in a term is somebody's live
 * business — and the reader's tier has already narrowed the set before this filter
 * sees it.
 *
 * The states are read off the machine, so one added there arrives here without
 * anybody choosing to bring it. A reader who cannot see a state gets *nothing matches
 * those filters* rather than a refusal, which is *absent, never flagged* applied to
 * the filter: a sentence explaining that `Declined` is not for them would announce
 * the declines.
 */
const ANY_VIEW = "any";

const STATUS_OPTIONS: readonly FilterOption[] = [
  { value: ANY_VIEW, label: "Any state" },
  ...OFFERING_STATES.map((state) => ({ value: state, label: state })),
];

function statusFor(chosen: string): readonly OfferingState[] | null {
  const named = OFFERING_STATES.find((state) => state === chosen);
  return named ? [named] : null;
}

/**
 * The asked-for value if the picker offers it, and `undefined` otherwise — so a
 * caller-supplied parameter can only ever be one of the options, and `?term=` in
 * particular cannot scope the page to a term that does not exist.
 */
function offered(options: readonly string[], asked: string | undefined): string | undefined {
  return options.find((option) => option === asked);
}

function labelFor(term: LineupTerm): string {
  return `${term.semester} ${term.year}`;
}
