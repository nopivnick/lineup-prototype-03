import type { DataTableColumn } from "mantine-datatable";

/**
 * **One column grid per screen, not one per group.**
 *
 * Every list in this application groups its rows the same way — an outer table
 * whose records are the groups, and one *separate* inner table rendered inside
 * each group's expansion, because mantine-datatable groups columns rather than
 * rows. That device buys the grouping and costs the alignment: each inner table
 * is its own `<table>`, so under the browser's default `table-layout: auto` each
 * one sizes its columns to its own content. Cells line up underneath the header
 * row they sit under and nowhere else, and a reader scanning *Status* down the
 * page finds it in a different place in every group.
 *
 * The fix is the two halves below, and they only work together:
 *
 *   * `alignedTable` puts the table into **`table-layout: fixed`**, which makes
 *     declared widths authoritative instead of advisory — under `auto` a width
 *     is a hint the content may overrule, which is exactly how two groups end up
 *     disagreeing.
 *   * `sized` makes a width **required** on every column. `DataTableColumn` has
 *     `width` optional, and one column left without one is all it takes to put
 *     the grid back in the content's hands, so the requirement is the compiler's
 *     rather than a convention: a column with no width is a build error.
 *
 * Widths are percentages so the grid stays one grid at any width, with a
 * `minWidth` beneath them so a narrow viewport scrolls the table rather than
 * crushing every column proportionally.
 */
export type SizedColumn<T> = DataTableColumn<T> & { width: string | number };

/**
 * The columns of one grouped list, each carrying its width. Call it with the row
 * type stated — `sized<CatalogRow>([…])` — so the array literal is checked
 * against {@link SizedColumn} rather than inferred loosely from itself.
 */
export function sized<T>(columns: readonly SizedColumn<T>[]): DataTableColumn<T>[] {
  return [...columns];
}

/**
 * The `styles` prop that makes a table's declared widths binding. `minWidth` is
 * the width below which the table scrolls instead of shrinking — pick it from
 * the narrowest the columns can be and still be read, not from the viewport.
 */
export function alignedTable(minWidth: number) {
  return { table: { tableLayout: "fixed" as const, minWidth } };
}
