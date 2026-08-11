"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  List,
  Menu,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";

import type { CatalogGroup, CatalogRow } from "@/db/read/catalog";
import type { Refusal } from "@/db/read/shape";

import { fireCourseEvent } from "./actions";

/**
 * **The Catalog's table** (issues/37, issues/81).
 *
 * Three things about it are the ticket's rather than the library's:
 *
 *   * **Rows are grouped with `rowExpansion` and `trigger: 'always'`**, because
 *     mantine-datatable has no row grouping at all — its `groups` groups
 *     *columns*. The records of the outer table are programs; each program's
 *     courses are the expanded content.
 *   * **Sorting is the application's.** The table hands over a column and a
 *     direction through `sortStatus` / `onSortStatusChange` and sorts nothing;
 *     `sorted()` below is what actually orders the rows, and one sort state is
 *     shared by every group so the three catalogs stay in step.
 *   * **The Actions column is absent, not empty**, for an actor who can never
 *     act. The server decided that by giving the row a `null` action set; this
 *     component reads the absence and drops the column.
 *
 * It computes **no rule**. `⋯ n`'s count is how many entries of a set the server
 * already intersected say `permitted`, and every refusal it renders is a
 * sentence the writer wrote.
 */
export function CatalogTable({ groups }: { groups: readonly CatalogGroup[] }) {
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<CatalogRow>>({
    columnAccessor: "courseNumber",
    direction: "asc",
  });
  // A refusal that arrives *after* the click: the world moved between the render
  // and the button. The menu's own refusals are stated in the menu.
  const [refused, setRefused] = useState<readonly Refusal[] | null>(null);

  // The server decided this per row, and it is the same answer for every row on
  // the page: an actor who can never act can never act on any of them.
  const actionsExist = groups.some((group) => group.courses.some((row) => row.actions !== null));

  return (
    <Stack gap="md">
      {refused ? (
        <Alert
          color="orange"
          title="That move was refused"
          withCloseButton
          onClose={() => setRefused(null)}
        >
          <Stack gap={4}>
            {refused.map((refusal) => (
              <Refused key={refusal.sentence} refusal={refusal} />
            ))}
          </Stack>
        </Alert>
      ) : null}

      <DataTable
        withTableBorder
        noHeader
        idAccessor="programCode"
        records={[...groups]}
        noRecordsText="No courses match. Clear the search or widen the status filter — retired courses are hidden by default."
        columns={[
          {
            accessor: "programName",
            render: (group) => (
              <Group gap="sm">
                <Badge variant="light">{group.programCode}</Badge>
                <Text fw={600}>{group.programName}</Text>
                <Text size="sm" c="dimmed">
                  {group.courseCount} {group.courseCount === 1 ? "course" : "courses"}
                </Text>
              </Group>
            ),
          },
        ]}
        rowExpansion={{
          trigger: "always",
          allowMultiple: true,
          content: ({ record }) => (
            <Box p="xs">
              <DataTable
                withColumnBorders
                highlightOnHover
                idAccessor="courseId"
                records={sorted(record.courses, sortStatus)}
                sortStatus={sortStatus}
                onSortStatusChange={setSortStatus}
                columns={[
                  { accessor: "courseNumber", title: "Number", sortable: true, noWrap: true },
                  { accessor: "title", title: "Title", sortable: true },
                  { accessor: "credits", title: "Cr", sortable: true, textAlign: "right" },
                  {
                    accessor: "areas",
                    title: "Areas",
                    sortable: false,
                    render: (row) => <Tags tags={row.areas} />,
                  },
                  {
                    accessor: "requirementCategories",
                    title: "Requirements",
                    sortable: false,
                    render: (row) => <Tags tags={row.requirementCategories} />,
                  },
                  {
                    accessor: "status",
                    title: "Status",
                    sortable: true,
                    render: (row) => (
                      <Group gap={6}>
                        <Badge color={TONE[row.status]} variant="light">
                          {row.status}
                        </Badge>
                        <NotOfferableYet row={row} />
                      </Group>
                    ),
                  },
                  ...(actionsExist
                    ? [
                        {
                          accessor: "actions",
                          title: "Actions",
                          sortable: false,
                          textAlign: "right" as const,
                          render: (row: CatalogRow) => (
                            <ActionMenu row={row} onRefused={setRefused} />
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </Box>
          ),
        }}
      />
    </Stack>
  );
}

/**
 * **The `⋯ n` menu** (issues/37). One control per row; `n` is how many moves
 * this actor can actually make, so `⋯ 0` says *nothing to do here* without
 * opening anything.
 *
 * Opening it lists **every** move the machine offers from this state — the
 * permitted ones clickable, the refused ones greyed with their reason stated
 * beneath, and the reason's dependencies listed under it where the refusal has
 * any. A move the machine does not offer is not in the set at all, which is why
 * a `Retired` course carries no menu rather than an empty one.
 */
function ActionMenu({
  row,
  onRefused,
}: {
  row: CatalogRow;
  onRefused: (refusals: readonly Refusal[] | null) => void;
}) {
  const [firing, startFiring] = useTransition();
  const actions = row.actions ?? [];

  if (actions.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        —
      </Text>
    );
  }

  const open = actions.filter((action) => action.permitted).length;

  const fire = (event: string) =>
    startFiring(async () => {
      onRefused(null);
      const outcome = await fireCourseEvent(row.courseId, event);
      onRefused(outcome?.refusals ?? null);
    });

  return (
    <Menu position="bottom-end" shadow="md" width={340} withinPortal>
      <Menu.Target>
        <Button variant="subtle" size="compact-sm" loading={firing} aria-label="Moves">
          ⋯ {open}
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>
          {row.courseNumber} — {open} of {actions.length} available to you
        </Menu.Label>
        {actions.map((action) =>
          action.permitted ? (
            <Menu.Item key={action.event} onClick={() => fire(action.event)}>
              <Text size="sm">{action.event}</Text>
            </Menu.Item>
          ) : (
            <Menu.Item key={action.event} disabled component="div">
              <Stack gap={2}>
                <Text size="sm">{action.event}</Text>
                <Refused refusal={action.refusal} />
              </Stack>
            </Menu.Item>
          ),
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * A refusal, rendered as the one value it is (issues/14): the sentence, and —
 * where the refusal's whole content is data elsewhere in the system — the
 * dependency listed beneath it (issues/38).
 */
function Refused({ refusal }: { refusal: Refusal }) {
  return (
    <Box>
      <Text size="xs" c="dimmed">
        {refusal.sentence}
      </Text>
      {refusal.dependencies.length > 0 ? (
        <List size="xs" c="dimmed" withPadding>
          {refusal.dependencies.map((dependency) => (
            <List.Item key={dependency}>{dependency}</List.Item>
          ))}
        </List>
      ) : null}
    </Box>
  );
}

/**
 * **`not offerable yet`** — the derived marker that closes the gap issues/37
 * opened by taking the area head off this row (issues/32).
 *
 * The tooltip names which of the two is missing, because *needs an area head* and
 * *needs an area* are different jobs for a different person.
 *
 * **Not rendered on a `Retired` course**, though the row still carries it. The
 * word the marker turns on is *yet*: it is issues/32's create-time gate shown one
 * step earlier, where a director can still act on it, and a retired course has no
 * such step — `Retired` is final, so *needs an area before it can be offered* is
 * advice about a door that closed. The `Retired` chip beside it already states
 * the whole of why this course will not be offered. The read module keeps the
 * marker on the row, which is where the rule lives; this is a rendering
 * judgement, and the one screen that shows retired courses is the one making it.
 */
function NotOfferableYet({ row }: { row: CatalogRow }) {
  const marker = row.notOfferableYet;
  if (!marker || row.status === "Retired") return null;

  const missing = [
    marker.missingArea ? "an area" : null,
    marker.missingAreaHead ? "an area head" : null,
  ].filter((one): one is string => one !== null);

  return (
    <Tooltip label={`Needs ${missing.join(" and ")} before it can be offered`} withArrow>
      <Badge color="gray" variant="outline" style={{ borderStyle: "dashed" }}>
        not offerable yet
      </Badge>
    </Tooltip>
  );
}

function Tags({ tags }: { tags: readonly { name: string }[] }) {
  if (tags.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        —
      </Text>
    );
  }
  return (
    <Group gap={4}>
      {tags.map((tag) => (
        <Badge key={tag.name} variant="default" size="sm">
          {tag.name}
        </Badge>
      ))}
    </Group>
  );
}

/**
 * **The sort the table does not do.** `sortStatus` is a column and a direction
 * and nothing else; this is the application implementing it, in memory, over a
 * row set that does not page.
 */
function sorted(
  courses: readonly CatalogRow[],
  sortStatus: DataTableSortStatus<CatalogRow>,
): CatalogRow[] {
  const column = sortStatus.columnAccessor as keyof CatalogRow;
  const direction = sortStatus.direction === "desc" ? -1 : 1;

  return [...courses].sort((left, right) => {
    const a = left[column];
    const b = right[column];
    if (typeof a === "number" && typeof b === "number") return (a - b) * direction;
    return String(a).localeCompare(String(b), undefined, { numeric: true }) * direction;
  });
}

/** The three Course states, read as tone rather than as colour with a meaning. */
const TONE: Record<CatalogRow["status"], string> = {
  Approved: "teal",
  Revising: "yellow",
  Retired: "gray",
};
