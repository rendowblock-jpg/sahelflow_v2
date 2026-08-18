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

interface LineTrendChartProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: TimeSeriesDefinition[];
  config: ChartConfig;
  height?: ChartHeight;
  formatY?: ChartFormatter;
  emptyMessage?: string;
  referenceLines?: ChartReferenceLine[];
  referenceBands?: ChartReferenceBand[];
  yDomain?: [number, number];
}

export function LineTrendChart({
  data,
  xKey,
  series,
  config,
  height = DEFAULT_CHART_HEIGHT,
  formatY,
  emptyMessage,
  referenceLines,
  referenceBands,
  yDomain,
}: LineTrendChartProps) {
  const { t } = useI18n();
  return (
    <TimeSeriesChart
      data={data}
      xKey={xKey}
      series={series}
      config={config}
      height={height}
      formatY={formatY}
      emptyMessage={emptyMessage}
      mode="line"
      ariaLabel={t("charts.lineTrend")}
      referenceLines={referenceLines}
      referenceBands={referenceBands}
      yDomain={yDomain}
    />
  );
}
