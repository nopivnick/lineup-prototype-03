import { redirect } from "next/navigation";
import { Container, Group, Stack, Text, Title } from "@mantine/core";

import {
  ANY_STATUS,
  DEFAULT_STATUS,
  getCatalogPage,
  listCatalogPrograms,
  type CatalogFilters,
} from "@/db/read/catalog";
import { getActor } from "@/lib/auth/actor";
import { COURSE_STATES, type CourseState } from "@/lib/machines/course.machine";

import { CatalogFilterBar, type FilterOption } from "./catalog-filters";
import { CatalogTable } from "./catalog-table";

/**
 * **The Catalog** — every Course eligible to be offered, grouped into ITP's,
 * IMA's and LowRes's three catalogs, independent of any term (issues/37,
 * issues/81).
 *
 * This page holds no database handle and writes no `WHERE` clause. It calls one
 * view-shaped read module and receives finished rows: the record, what this
 * actor may do about it, and the refusal for what they may not, already
 * intersected across machine legality, the invariants and the permission term.
 * Everything it does with what comes back is rendering.
 *
 * **The filters are the URL**, so the read module is the only thing that
 * filters. `Retired` is hidden by the *default* rather than by the query — this
 * is the page that supplies that default, and one click widens it — which is
 * what keeps a retired course reachable from the only view that lists courses.
 */
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/be-somebody");

  const params = searchParams;
  const chosen = {
    search: one(params.q) ?? "",
    programCode: one(params.program) ?? "",
    status: one(params.status) ?? DEFAULT_VIEW,
  };

  const filters: CatalogFilters = {
    search: chosen.search || null,
    programCode: chosen.programCode || null,
    status: statusFor(chosen.status),
  };

  const [groups, programs] = await Promise.all([
    getCatalogPage(actor, filters),
    listCatalogPrograms(),
  ]);

  const courses = groups.reduce((total, group) => total + group.courseCount, 0);

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={1}>The Catalog</Title>
          <Group gap="xs">
            <Text c="dimmed">
              Every course eligible to be offered, in one program&rsquo;s catalog each. No term, and
              no person: a course has no instructor.
            </Text>
          </Group>
        </Stack>

        <CatalogFilterBar
          chosen={chosen}
          programs={programs.map((program) => ({ value: program.code, label: program.name }))}
          statuses={STATUS_OPTIONS}
          matched={courses}
        />

        <CatalogTable groups={groups} />
      </Stack>
    </Container>
  );
}

/**
 * The status filter's own vocabulary, which is not the machine's: two of its
 * options are *sets* of states rather than states.
 *
 * `default` is the one the ticket settled — `Approved` and `Revising`, a
 * `Revising` course still being eligible to be offered in future — and `any` is
 * the one click that reaches the retired ones. The three states between them are
 * read off the machine, so a state added there arrives here without anybody
 * choosing to bring it.
 */
const DEFAULT_VIEW = "default";
const ANY_VIEW = "any";

const STATUS_OPTIONS: readonly FilterOption[] = [
  { value: DEFAULT_VIEW, label: `${DEFAULT_STATUS.join(" & ")} — the default` },
  ...COURSE_STATES.map((state) => ({ value: state, label: state })),
  { value: ANY_VIEW, label: "Any status" },
];

function statusFor(chosen: string): readonly CourseState[] {
  if (chosen === ANY_VIEW) return ANY_STATUS;
  const named = COURSE_STATES.find((state) => state === chosen);
  return named ? [named] : DEFAULT_STATUS;
}

/** A repeated query parameter is a caller's mistake, not a second filter. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
