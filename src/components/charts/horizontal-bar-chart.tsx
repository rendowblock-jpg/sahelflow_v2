"use client";

import { useI18n } from "@/hooks/use-i18n";
import {
  DEFAULT_CHART_HEIGHT,
  normalizeChartHeight,
  resolveFormatter,
  type ChartFormatter,
  type ChartHeight,
} from "./chart-primitives";
import type { ChartConfig } from "./chart-types";
import {
  RankedMetricList,
  type RankedMetricDatum,
} from "./decision-visualizations";

export interface HBarDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
}

interface HorizontalBarChartProps {
  data: HBarDatum[];
  config: ChartConfig;
  height?: ChartHeight;
  formatValue?: ChartFormatter;
  emptyMessage?: string;
  maxValue?: number;
}

/**
 * Legacy API adapter for categorical rankings.
 *
 * Full Cartesian bar canvases wasted space for the small ranked lists used in
 * SahelFlow. The Class-AAA grammar renders an information-dense ranked evidence
 * list while preserving this API until all historical callers are retired.
 */
export function HorizontalBarChart({
  data,
  config,
  height = DEFAULT_CHART_HEIGHT,
  formatValue,
  emptyMessage,
  maxValue,
}: HorizontalBarChartProps) {
  const { locale } = useI18n();
  const format = resolveFormatter(formatValue, locale);
  const normalizedHeight = normalizeChartHeight(height);

  if (!data.length) {
    return (
      <div
        className="flex w-full items-center justify-center text-sm text-muted-foreground"
        style={{ minHeight: normalizedHeight }}
        role="status"
      >
        {emptyMessage ?? "—"}
      </div>
    );
  }

  const ranked: RankedMetricDatum[] = data.map((entry, index) => ({
    key: entry.key,
    label: entry.label,
    value: entry.value,
    displayValue: format(entry.value),
    color:
      entry.color ??
      config.value?.color ??
      `var(--color-chart-${(index % 5) + 1})`,
  }));

  return (
    <div
      className="flex w-full flex-col justify-center"
      style={{ minHeight: normalizedHeight }}
      data-legacy-chart-adapter="ranked-metrics"
    >
      <RankedMetricList data={ranked} maxValue={maxValue} />
    </div>
  );
}
