import { Anchor, Container, Stack, Text, Title } from "@mantine/core";
import { Table, getTableName, is } from "drizzle-orm";

import * as classesSchema from "@/db/classes/schema";
import * as peopleSchema from "@/db/people/schema";

import { ScaffoldTable, type ScaffoldRow } from "./scaffold-table";

/**
 * The foundation ticket delivers no screen a person would want to look at
 * (#75). This one lists the curated schema as Drizzle now states it — 20 tables
 * in `classes`, 1 in `people` — so that the app booting and the schema being
 * complete are one observation rather than two.
 *
 * It reads the schema *modules*, never a handle. Every later screen reads
 * through a view-shaped read module instead; see `docs/data-access/README.md`.
 */
function tablesOf(
  project: ScaffoldRow["project"],
  schema: Record<string, unknown>,
): ScaffoldRow[] {
  return Object.values(schema)
    .filter((exported) => is(exported, Table))
    .map((table) => ({ project, table: getTableName(table) }))
    .sort((a, b) => a.table.localeCompare(b.table));
}

/**
 * **The links below are plain `Anchor`s and not `<Anchor component={Link}>`.**
 *
 * Mantine's polymorphic `component` prop takes a *component* — a function — and this
 * is a Server Component, so handing one to `Anchor` puts a function across the
 * server-to-client boundary and the page fails to render at all: *functions cannot be
 * passed directly to Client Components*. It typechecks and it builds, which is why it
 * survived a ticket; only rendering it shows it.
 *
 * The cost is a full page load rather than a client-side transition, on two prose
 * links out of a scaffold index. The alternative is a client component per link, which
 * is a lot of machinery to soft-navigate away from a page that lists table names.
 */
export default function HomePage() {
  const rows = [
    ...tablesOf("people", peopleSchema),
    ...tablesOf("classes", classesSchema),
  ];

  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>ITP/IMA catalog</Title>
        <Text c="dimmed">
          The walking skeleton. Two Postgres projects, {rows.length} tables, and
          no page holding a database handle.
        </Text>
        <Text>
          The first real screen is <Anchor href="/catalog">the Catalog</Anchor>{" "}
          — every course eligible to be offered, and the one view that never
          touches <code>people</code>.
        </Text>
        <Text>
          The second is <Anchor href="/lineup">the Lineup</Anchor> — the classes
          running in one term, and the only list that consumes the cross-project
          stitch. It is also where the read tiers first show: what a student
          sees there is a smaller list, not a flagged one.
        </Text>
        <ScaffoldTable rows={rows} />
      </Stack>
    </Container>
  );
}
