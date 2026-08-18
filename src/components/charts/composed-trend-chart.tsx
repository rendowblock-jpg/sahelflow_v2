"use client";

import * as React from "react";

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
  cartesianAxisStyle,
  chartDataZoom,
  chartTooltip,
  EChartSurface,
  resolveChartColor,
  type SahelChartTheme,
} from "./echarts-runtime";

interface BarSeries {
  kind: "bar";
  key: string;
  label: string;
  format?: ChartFormatter;
  yAxis?: "left" | "right";
}
interface LineSeries {
  kind: "line";
  key: string;
  label: string;
  format?: ChartFormatter;
  yAxis?: "left" | "right";
}
type ComposedSeries = BarSeries | LineSeries;

interface ComposedTrendChartProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: ComposedSeries[];
  config: ChartConfig;
  height?: ChartHeight;
  formatLeftY?: ChartFormatter;
  formatRightY?: ChartFormatter;
  emptyMessage?: string;
}

function isolate(value: unknown) {
  return `\u2068${String(value ?? "")}\u2069`;
}

function seriesColor(
  config: ChartConfig,
  key: string,
  theme: SahelChartTheme,
  index: number,
) {
  const entry = config[key];
  const requested = entry?.theme
    ? entry.theme[theme.dark ? "dark" : "light"]
    : entry?.color;
  return resolveChartColor(requested, theme, index);
}

export function ComposedTrendChart({
  data,
  xKey,
  series,
  config,
  height = DEFAULT_CHART_HEIGHT,
  formatLeftY,
  formatRightY,
  emptyMessage,
}: ComposedTrendChartProps) {
  const { t, locale, dir } = useI18n();
  const chartHeight = normalizeChartHeight(height);
  const fmtLeft = React.useMemo(
    () => resolveFormatter(formatLeftY, locale),
    [formatLeftY, locale],
  );
  const fmtRight = React.useMemo(
    () => resolveFormatter(formatRightY, locale),
    [formatRightY, locale],
  );
  const hasRight = series.some(
    (entry) =>
      entry.yAxis === "right" ||
      (entry.kind === "line" && entry.yAxis === undefined),
  );

  const option = React.useCallback(
    (theme: SahelChartTheme) => {
      const axis = cartesianAxisStyle(theme);
      const zoom = chartDataZoom(data.length, theme);
      return {
        color: series.map((current, index) =>
          seriesColor(config, current.key, theme, index),
        ),
        grid: {
          left: 8,
          right: hasRight ? 14 : 8,
          top: 16,
          bottom: zoom ? 45 : 12,
          containLabel: true,
        },
        tooltip: chartTooltip(theme, dir),
        axisPointer: {
          link: [{ xAxisIndex: "all" }],
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
          boundaryGap: true,
          data: data.map((row) => String(row[xKey] ?? "")),
          axisLine: { show: false },
          axisTick: { show: false },
          axisPointer: { show: true, snap: true },
          axisLabel: {
            color: theme.mutedForeground,
            fontSize: 12,
            hideOverlap: true,
            margin: 12,
            formatter: (value: string) => isolate(value),
          },
        },
        yAxis: [
          {
            type: "value",
            min: 0,
            position: "left",
            ...axis,
            axisLabel: {
              ...axis.axisLabel,
              formatter: (value: number) => isolate(fmtLeft(value)),
            },
          },
          ...(hasRight
            ? [
                {
                  type: "value" as const,
                  min: 0,
                  position: "right" as const,
                  ...axis,
                  splitLine: { show: false },
                  axisLabel: {
                    ...axis.axisLabel,
                    formatter: (value: number) => isolate(fmtRight(value)),
                  },
                },
              ]
            : []),
        ],
        dataZoom: zoom,
        series: series.map((current, index) => {
          const color = seriesColor(config, current.key, theme, index);
          const currentAxis =
            current.yAxis ?? (current.kind === "line" ? "right" : "left");
          const valueFormatter = current.format
            ? resolveFormatter(current.format, locale)
            : currentAxis === "right"
              ? fmtRight
              : fmtLeft;
          if (current.kind === "bar") {
            return {
              id: current.key,
              name: current.label,
              type: "bar" as const,
              yAxisIndex: currentAxis === "right" && hasRight ? 1 : 0,
              data: data.map((row) => Number(row[current.key] ?? 0)),
              barMaxWidth: 28,
              barMinWidth: 5,
              itemStyle: {
                color,
                borderRadius: [6, 6, 2, 2],
                opacity: 0.92,
              },
              emphasis: {
                focus: "series" as const,
                itemStyle: { opacity: 1 },
              },
              tooltip: {
                valueFormatter: (value: unknown) =>
                  valueFormatter(Number(value ?? 0)),
              },
            };
          }
          return {
            id: current.key,
            name: current.label,
            type: "line" as const,
            yAxisIndex: currentAxis === "right" && hasRight ? 1 : 0,
            data: data.map((row) => Number(row[current.key] ?? 0)),
            smooth: 0.26,
            showSymbol: false,
            symbol: "circle",
            symbolSize: 7,
            lineStyle: { color, width: 2.35 },
            itemStyle: { color, borderColor: theme.card, borderWidth: 2 },
            emphasis: {
              focus: "series" as const,
              scale: 1.15,
              lineStyle: { width: 3 },
            },
            tooltip: {
              valueFormatter: (value: unknown) =>
                valueFormatter(Number(value ?? 0)),
            },
          };
        }),
      };
    },
    [config, data, dir, fmtLeft, fmtRight, hasRight, locale, series, xKey],
  );

  if (!data.length || !series.length) {
    return (
      <div
        className="flex w-full items-center justify-center text-sm text-muted-foreground"
        style={{ height: chartHeight }}
      >
        {emptyMessage ?? "—"}
      </div>
    );
  }

  return (
    <EChartSurface
      option={option}
      ariaLabel={t("charts.composedTrend")}
      height={chartHeight}
      className="aspect-auto"
    />
  );
}
