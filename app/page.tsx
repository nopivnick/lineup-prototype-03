import { Container, Stack, Text, Title } from "@mantine/core";
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
function tablesOf(project: ScaffoldRow["project"], schema: Record<string, unknown>): ScaffoldRow[] {
  return Object.values(schema)
    .filter((exported) => is(exported, Table))
    .map((table) => ({ project, table: getTableName(table) }))
    .sort((a, b) => a.table.localeCompare(b.table));
}

export default function HomePage() {
  const rows = [...tablesOf("people", peopleSchema), ...tablesOf("classes", classesSchema)];

  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>ITP/IMA catalog</Title>
        <Text c="dimmed">
          The walking skeleton. Two Postgres projects, {rows.length} tables, and no page holding a
          database handle.
        </Text>
        <ScaffoldTable rows={rows} />
      </Stack>
    </Container>
  );
}
