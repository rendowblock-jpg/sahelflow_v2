"use client";

import { useI18n } from "@/hooks/use-i18n";
import {
  DEFAULT_CHART_HEIGHT,
  normalizeChartHeight,
  type ChartHeight,
} from "./chart-primitives";
import type { ChartConfig } from "./chart-types";
import {
  SegmentedBreakdown,
  type BreakdownDatum,
} from "./decision-visualizations";

/**
 * Legacy API adapter.
 *
 * Founder review rejected decorative categorical donuts as the default product
 * grammar. Existing callers can keep this API while the rendered experience is
 * now a readable segmented breakdown with explicit values and percentages.
 */
export interface DonutDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
}

interface DonutChartProps {
  data: DonutDatum[];
  config: ChartConfig;
  height?: ChartHeight;
  centerLabel?: string;
  centerValue?: string;
  emptyMessage?: string;
}

export function DonutChart({
  data,
  config,
  height = DEFAULT_CHART_HEIGHT,
  centerLabel,
  centerValue,
  emptyMessage,
}: DonutChartProps) {
  const { locale } = useI18n();
  const dateLocale =
    locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-DZ";
  const numberFormatter = new Intl.NumberFormat(dateLocale, {
    maximumFractionDigits: 2,
  });
  const percentFormatter = new Intl.NumberFormat(dateLocale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const breakdown: BreakdownDatum[] = data.map((entry, index) => ({
    key: entry.key,
    label: entry.label,
    value: entry.value,
    color:
      entry.color ??
      config[entry.key]?.color ??
      `var(--color-chart-${(index % 5) + 1})`,
  }));
  const total = breakdown.reduce((sum, entry) => sum + entry.value, 0);
  const normalizedHeight = normalizeChartHeight(height);

  if (total <= 0) {
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

  return (
    <div
      className="flex w-full flex-col justify-center"
      style={{ minHeight: normalizedHeight }}
      data-legacy-chart-adapter="categorical-breakdown"
    >
      {centerValue || centerLabel ? (
        <div className="mb-4 border-b border-border/60 pb-3">
          {centerValue ? (
            <div className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {centerValue}
            </div>
          ) : null}
          {centerLabel ? (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {centerLabel}
            </div>
          ) : null}
        </div>
      ) : null}
      <SegmentedBreakdown
        data={breakdown}
        total={total}
        formatValue={(value) => numberFormatter.format(value)}
        formatPercent={(fraction) => percentFormatter.format(fraction)}
      />
    </div>
  );
}
