import type { ChartDataTable } from "@/components/charts/chart-primitives";

/**
 * The text alternative of a chart: an image label with the headline number and
 * the same numbers as a table (ChartCard `dataTable`). No table when there is
 * nothing to list, because the chart then shows its empty state.
 */
export function buildChartTable(
  t: (key: string, params?: Record<string, string | number>) => string,
  title: string,
  headline: string,
  columns: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number>>,
): ChartDataTable | undefined {
  if (rows.length === 0) return undefined;
  return {
    label: headline ? `${title}: ${headline}` : title,
    caption: t("charts.tableOf", { title }),
    columns,
    rows,
    showLabel: t("charts.showAsTable"),
    hideLabel: t("charts.showAsChart"),
  };
}
