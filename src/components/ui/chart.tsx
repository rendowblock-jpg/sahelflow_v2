/**
 * Legacy compatibility bridge for callers that only import the chart metadata
 * type from the historical shadcn path. Rendering authority lives under
 * `components/charts` and is ECharts/native-SVG only.
 */
export type {
  ChartConfig,
  ChartThemeConfig,
} from "@/components/charts/chart-types";
