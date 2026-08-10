"use client";

import { DataTable } from "mantine-datatable";

export type ScaffoldRow = {
  project: "people" | "classes";
  table: string;
};

/**
 * The only thing on the walking skeleton's first screen. It exists to prove
 * Mantine and mantine-datatable are wired, and it renders rows handed to it by
 * a Server Component — it holds no database handle, and under the
 * `no-restricted-imports` rule in `eslint.config.mjs` it could not.
 */
export function ScaffoldTable({ rows }: { rows: ScaffoldRow[] }) {
  return (
    <DataTable
      withTableBorder
      withColumnBorders
      striped
      highlightOnHover
      idAccessor={(row) => `${row.project}.${row.table}`}
      records={rows}
      columns={[
        { accessor: "project", title: "Postgres project" },
        { accessor: "table", title: "Table" },
      ]}
    />
  );
}
