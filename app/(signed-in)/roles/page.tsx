import { redirect } from "next/navigation";
import { Alert, Anchor, Container, Stack, Text, Title } from "@mantine/core";

import { getRolesPage } from "@/db/read/roles";
import { getActor } from "@/lib/auth/actor";

import { RolesScreen } from "./roles-screen";

/**
 * **The roles page** — the authority structure the chair is the sole author of,
 * one person at a time (issues/34, issues/38).
 *
 * This page holds no database handle and writes no `WHERE` clause. It calls one
 * view-shaped read module and receives a finished page: the program strip, the
 * role-holders with every name already stitched in from the other project, all
 * seven roles on every record, and — for the chair alone — what may be granted or
 * revoked, with the refusal for what may not.
 *
 * **The route refuses rather than rendering an empty page.** The fourth read
 * predicate governs a page rather than a table, so `{ visible: false }` is not an
 * error and not a redirect: a `student` is told there is no Roles page here, in the
 * same terms the nav item is missing in. A silent redirect was rejected on
 * issues/9's rule that a cosmetic fault must not masquerade as a broken link.
 *
 * **The search lives in the URL and the selected person does not.** The search
 * changes what the server reads — for a chair it reaches past the holders into
 * `people` — and selecting somebody changes nothing the server did: every record
 * on the page is computed in the same set-based pass.
 */
export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/be-somebody");

  const params = await searchParams;
  const search = one(params.q) ?? "";

  const read = await getRolesPage(actor, { search: search || null });

  if (!read.visible) {
    return <NoPageHere />;
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={1}>Roles</Title>
          <Text c="dimmed">
            Who holds what, and what each role lets them do. Every role is stated on every record,
            held or not, with who granted it and when.
            {read.page.mayWrite
              ? " Granting and revoking is the chair's, and a revoke that is blocked says what is blocking it."
              : " Read-only: only the chair writes this table, so the controls are absent rather than greyed."}
          </Text>
        </Stack>

        <RolesScreen page={read.page} search={search} />
      </Stack>
    </Container>
  );
}

/**
 * **Absent rather than empty, scaled from a control to a whole page** (issues/37,
 * issues/38).
 *
 * The predicate is *holds any role other than `student`*, so this is what a
 * `student` — and a netid the department has granted nothing — sees at the URL.
 * It names no record and no person: there is nothing here to be refused *about*.
 */
function NoPageHere() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>Roles</Title>
        <Alert color="gray" title="There is no Roles page here">
          <Stack gap="xs">
            <Text size="sm">
              The roles page is open to anybody the department has given a role other than{" "}
              <code>student</code> — an instructor, an advisor, a coordinator, an area head, a
              director or the chair. Holding <code>student</code> alone, or holding nothing, there is
              no page to show and no nav item to reach it by.
            </Text>
            <Text size="sm" c="dimmed">
              A student who also teaches keeps it: the predicate is <i>holds any role other than</i>{" "}
              <code>student</code>, never <i>does not hold</i> <code>student</code>. Switch to
              somebody who holds one from the bar above, or start at{" "}
              <Anchor href="/catalog">the Catalog</Anchor>.
            </Text>
          </Stack>
        </Alert>
      </Stack>
    </Container>
  );
}

/** A repeated query parameter is a caller's mistake, not a second filter. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
