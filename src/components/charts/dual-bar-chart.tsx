"use client";

import * as React from "react";

import { useI18n } from "@/hooks/use-i18n";
import { formatDZD } from "@/lib/utils";
import {
  DEFAULT_CHART_HEIGHT,
  normalizeChartHeight,
  type ChartHeight,
} from "./chart-primitives";
import {
  cartesianAxisStyle,
  chartTooltip,
  EChartSurface,
  type SahelChartTheme,
} from "./echarts-runtime";

interface DualBarChartProps {
  data: Array<{ month: string; revenue: number; expenses: number }>;
  revenueLabel?: string;
  expensesLabel?: string;
  height?: ChartHeight;
}

function isolate(value: unknown) {
  return `\u2068${String(value ?? "")}\u2069`;
}

export function DualBarChart({
  data,
  revenueLabel = "Revenue",
  expensesLabel = "Expenses",
  height = DEFAULT_CHART_HEIGHT,
}: DualBarChartProps) {
  const { dir, locale } = useI18n();
  const chartHeight = normalizeChartHeight(height);
  const netLabel = `${revenueLabel} − ${expensesLabel}`;
  const netValues = React.useMemo(
    () => data.map((entry) => entry.revenue - entry.expenses),
    [data],
  );
  const yMin = Math.min(0, ...netValues);
  const axisFormatter = React.useMemo(
    () =>
      new Intl.NumberFormat(
        locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-DZ",
        { notation: "compact", maximumFractionDigits: 1 },
      ),
    [locale],
  );

  const option = React.useCallback(
    (theme: SahelChartTheme) => {
      const axis = cartesianAxisStyle(theme);
      return {
        color: [theme.chart[0], theme.chart[1], theme.foreground],
        grid: {
          left: 8,
          right: 14,
          top: 26,
          bottom: 10,
          containLabel: true,
        },
        tooltip: chartTooltip(theme, dir),
        axisPointer: {
          label: {
            show: true,
            backgroundColor: theme.foreground,
            color: theme.card,
            borderRadius: 5,
            padding: [4, 6],
          },
        },
        xAxis: {
          type: "category",
          data: data.map((entry) => entry.month),
          axisLine: { show: false },
          axisTick: { show: false },
          axisPointer: { show: true, type: "shadow" },
          axisLabel: {
            color: theme.mutedForeground,
            fontSize: 12,
            margin: 12,
            hideOverlap: true,
            formatter: (value: string) => isolate(value),
          },
        },
        yAxis: {
          type: "value",
          min: yMin < 0 ? Math.floor(yMin * 1.1) : 0,
          ...axis,
          axisLabel: {
            ...axis.axisLabel,
            formatter: (value: number) => isolate(axisFormatter.format(value)),
          },
        },
        series: [
          {
            id: "revenue",
            name: revenueLabel,
            type: "bar" as const,
            data: data.map((entry) => entry.revenue),
            barMaxWidth: 34,
            barMinWidth: 6,
            itemStyle: {
              color: theme.chart[0],
              borderRadius: [7, 7, 2, 2],
              opacity: 0.94,
            },
            label: {
              show: true,
              position: "top" as const,
              distance: 6,
              color: theme.mutedForeground,
              fontSize: 10,
              formatter: (params: { value?: unknown }) => {
                const value = Number(params.value ?? 0);
                return value > 0 ? axisFormatter.format(value) : "";
              },
            },
            emphasis: { focus: "series" as const, itemStyle: { opacity: 1 } },
            tooltip: {
              valueFormatter: (value: unknown) =>
                formatDZD(Number(value ?? 0), locale),
            },
          },
          {
            id: "expenses",
            name: expensesLabel,
            type: "bar" as const,
            data: data.map((entry) => entry.expenses),
            barMaxWidth: 34,
            barMinWidth: 6,
            itemStyle: {
              color: theme.chart[1],
              borderRadius: [7, 7, 2, 2],
              opacity: 0.88,
            },
            label: {
              show: true,
              position: "top" as const,
              distance: 6,
              color: theme.mutedForeground,
              fontSize: 10,
              formatter: (params: { value?: unknown }) => {
                const value = Number(params.value ?? 0);
                return value > 0 ? axisFormatter.format(value) : "";
              },
            },
            emphasis: { focus: "series" as const, itemStyle: { opacity: 1 } },
            tooltip: {
              valueFormatter: (value: unknown) =>
                formatDZD(Number(value ?? 0), locale),
            },
          },
          {
            id: "net",
            name: netLabel,
            type: "line" as const,
            data: netValues,
            smooth: 0.22,
            showSymbol: true,
            symbol: "circle",
            symbolSize: 6,
            z: 4,
            lineStyle: { color: theme.foreground, width: 2 },
            itemStyle: {
              color: theme.card,
              borderColor: theme.foreground,
              borderWidth: 2,
            },
            emphasis: {
              focus: "series" as const,
              scale: 1.2,
              lineStyle: { width: 2.75 },
            },
            markLine: {
              silent: true,
              symbol: ["none", "none"],
              label: { show: false },
              lineStyle: {
                color: theme.mutedForeground,
                width: 1,
                type: "dashed" as const,
                opacity: 0.45,
              },
              data: [{ yAxis: 0 }],
            },
            tooltip: {
              valueFormatter: (value: unknown) =>
                formatDZD(Number(value ?? 0), locale),
            },
          },
        ],
      };
    },
    [
      axisFormatter,
      data,
      dir,
      expensesLabel,
      locale,
      netLabel,
      netValues,
      revenueLabel,
      yMin,
    ],
  );

  if (!data.length) return null;

  return (
    <div
      className="flex min-w-0 flex-col"
      style={{ height: chartHeight }}
      data-chart-engine="echarts"
    >
      <div className="mb-1 flex flex-wrap items-center gap-x-5 gap-y-1 px-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span
            className="size-2 rounded-[3px]"
            style={{ background: "var(--color-chart-1)" }}
            aria-hidden="true"
          />
          {revenueLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="size-2 rounded-[3px]"
            style={{ background: "var(--color-chart-2)" }}
            aria-hidden="true"
          />
          {expensesLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="h-px w-3 bg-foreground"
            aria-hidden="true"
          />
          {netLabel}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <EChartSurface
          option={option}
          ariaLabel={`${revenueLabel} / ${expensesLabel} / ${netLabel}`}
          height="100%"
        />
      </div>
    </div>
  );
}
