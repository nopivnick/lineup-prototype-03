import { redirect } from "next/navigation";
import { Anchor, Container, Stack, Text, Title } from "@mantine/core";
import { Table, getTableName, is } from "drizzle-orm";

import * as classesSchema from "@/db/classes/schema";
import * as peopleSchema from "@/db/people/schema";
import { getActorRoles } from "@/db/read/actor-roles";
import { mayOpenRolesPage } from "@/db/read/shape";
import { getActor } from "@/lib/auth/actor";

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
export default async function HomePage() {
  const rows = [
    ...tablesOf("people", peopleSchema),
    ...tablesOf("classes", classesSchema),
  ];

  /**
   * **The roles page's link is the nav item, and a `student` does not get one**
   * (issues/38). The fourth read predicate governs a page rather than a table, so
   * the link and the route agree by asking the same function — the route still
   * refuses on its own, because a link nobody rendered is not a check.
   */
  const actor = await getActor();
  if (!actor) redirect("/be-somebody");
  const roles = await getActorRoles(actor.netid);

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
        {mayOpenRolesPage(roles) ? (
          <Text>
            The third is <Anchor href="/roles">Roles</Anchor> — who holds what, one
            person at a time, with every refusal stated in the open rather than
            behind a menu. Only the chair writes it; everybody else reads it with
            the controls and the refusals absent together.
          </Text>
        ) : null}
        <ScaffoldTable rows={rows} />
      </Stack>
    </Container>
  );
}
