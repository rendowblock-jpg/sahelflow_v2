"use client";

import { useI18n } from "@/hooks/use-i18n";
import {
  DEFAULT_CHART_HEIGHT,
  type ChartFormatter,
  type ChartHeight,
} from "./chart-primitives";
import type {
  ChartConfig,
  ChartReferenceBand,
  ChartReferenceLine,
} from "./chart-types";
import { TimeSeriesChart, type TimeSeriesDefinition } from "./time-series-chart";

interface AreaTrendChartProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: TimeSeriesDefinition[];
  config: ChartConfig;
  height?: ChartHeight;
  formatY?: ChartFormatter;
  showGrid?: boolean;
  curve?: "monotone" | "linear" | "step" | "natural";
  emptyMessage?: string;
  referenceLines?: ChartReferenceLine[];
  referenceBands?: ChartReferenceBand[];
  yDomain?: [number, number];
}

export function AreaTrendChart({
  data,
  xKey,
  series,
  config,
  height = DEFAULT_CHART_HEIGHT,
  formatY,
  showGrid = true,
  curve = "monotone",
  emptyMessage,
  referenceLines,
  referenceBands,
  yDomain,
}: AreaTrendChartProps) {
  const { t } = useI18n();
  const primary = series.length === 1 ? series[0] : undefined;
  const values = primary
    ? data.map((row) => Number(row[primary.key] ?? 0)).filter(Number.isFinite)
    : [];
  const average = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
  const resolvedReferenceLines =
    referenceLines ??
    (primary?.key === "revenue" && average > 0
      ? [
          {
            value: average,
            label: t("analytics.avgValue"),
            color: "var(--muted-foreground)",
            lineStyle: "dotted" as const,
          },
        ]
      : undefined);

  return (
    <TimeSeriesChart
      data={data}
      xKey={xKey}
      series={series}
      config={config}
      height={height}
      formatY={formatY}
      showGrid={showGrid}
      curve={curve}
      emptyMessage={emptyMessage}
      mode="area"
      ariaLabel={t("charts.areaTrend")}
      referenceLines={resolvedReferenceLines}
      referenceBands={referenceBands}
      yDomain={yDomain}
    />
  );
}
