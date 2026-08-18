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

function resolvedAxis(current: ComposedSeries) {
  return current.yAxis ?? (current.kind === "line" ? "right" : "left");
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
  const hasRight = series.some((entry) => resolvedAxis(entry) === "right");
  const hasLeft = series.some((entry) => resolvedAxis(entry) === "left");
  const splitUnits = hasLeft && hasRight;
  const resolvedHeight =
    splitUnits && height === DEFAULT_CHART_HEIGHT
      ? "clamp(19rem, 30vw, 22rem)"
      : chartHeight;

  const option = React.useCallback(
    (theme: SahelChartTheme) => {
      const axis = cartesianAxisStyle(theme);
      const zoom = chartDataZoom(data.length, theme);
      const categories = data.map((row) => String(row[xKey] ?? ""));
      const leftLabels = series
        .filter((entry) => resolvedAxis(entry) === "left")
        .map((entry) => entry.label)
        .join(" · ");
      const rightLabels = series
        .filter((entry) => resolvedAxis(entry) === "right")
        .map((entry) => entry.label)
        .join(" · ");

      const linkedZoom = splitUnits
        ? zoom?.map((entry) => ({ ...entry, xAxisIndex: [0, 1] }))
        : zoom;

      const xAxis = splitUnits
        ? [
            {
              type: "category" as const,
              gridIndex: 0,
              boundaryGap: false,
              data: categories,
              axisLine: { show: false },
              axisTick: { show: false },
              axisPointer: { show: true, snap: true },
              axisLabel: { show: false },
            },
            {
              type: "category" as const,
              gridIndex: 1,
              boundaryGap: true,
              data: categories,
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
          ]
        : {
            type: "category" as const,
            boundaryGap: series.some((entry) => entry.kind === "bar"),
            data: categories,
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
          };

      const yAxis = splitUnits
        ? [
            {
              type: "value" as const,
              gridIndex: 0,
              min: 0,
              name: rightLabels,
              nameLocation: "end" as const,
              nameGap: 7,
              nameTextStyle: {
                color: theme.mutedForeground,
                fontSize: 11,
                fontWeight: 500,
              },
              ...axis,
              axisLabel: {
                ...axis.axisLabel,
                formatter: (value: number) => isolate(fmtRight(value)),
              },
            },
            {
              type: "value" as const,
              gridIndex: 1,
              min: 0,
              name: leftLabels,
              nameLocation: "end" as const,
              nameGap: 7,
              nameTextStyle: {
                color: theme.mutedForeground,
                fontSize: 11,
                fontWeight: 500,
              },
              ...axis,
              axisLabel: {
                ...axis.axisLabel,
                formatter: (value: number) => isolate(fmtLeft(value)),
              },
            },
          ]
        : {
            type: "value" as const,
            min: 0,
            ...axis,
            axisLabel: {
              ...axis.axisLabel,
              formatter: (value: number) => isolate(fmtLeft(value)),
            },
          };

      return {
        color: series.map((current, index) =>
          seriesColor(config, current.key, theme, index),
        ),
        grid: splitUnits
          ? [
              {
                left: 8,
                right: 12,
                top: 20,
                height: "39%",
                containLabel: true,
              },
              {
                left: 8,
                right: 12,
                top: "57%",
                bottom: linkedZoom ? 45 : 10,
                containLabel: true,
              },
            ]
          : {
              left: 8,
              right: 8,
              top: 16,
              bottom: linkedZoom ? 45 : 12,
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
        xAxis,
        yAxis,
        dataZoom: linkedZoom,
        series: series.map((current, index) => {
          const color = seriesColor(config, current.key, theme, index);
          const currentAxis = resolvedAxis(current);
          const valueFormatter = current.format
            ? resolveFormatter(current.format, locale)
            : currentAxis === "right"
              ? fmtRight
              : fmtLeft;
          const axisIndex = splitUnits ? (currentAxis === "right" ? 0 : 1) : 0;
          if (current.kind === "bar") {
            return {
              id: current.key,
              name: current.label,
              type: "bar" as const,
              xAxisIndex: axisIndex,
              yAxisIndex: axisIndex,
              data: data.map((row) => Number(row[current.key] ?? 0)),
              barMaxWidth: 28,
              barMinWidth: 5,
              itemStyle: {
                color,
                borderRadius: [6, 6, 2, 2],
                opacity: 0.9,
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
            xAxisIndex: axisIndex,
            yAxisIndex: axisIndex,
            data: data.map((row) => Number(row[current.key] ?? 0)),
            smooth: 0.26,
            showSymbol: false,
            symbol: "circle",
            symbolSize: 7,
            lineStyle: { color, width: 2.35 },
            itemStyle: { color, borderColor: theme.card, borderWidth: 2 },
            areaStyle: splitUnits ? { color, opacity: 0.08 } : undefined,
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
    [
      config,
      data,
      dir,
      fmtLeft,
      fmtRight,
      locale,
      series,
      splitUnits,
      xKey,
    ],
  );

  if (!data.length || !series.length) {
    return (
      <div
        className="flex w-full items-center justify-center text-sm text-muted-foreground"
        style={{ height: resolvedHeight }}
      >
        {emptyMessage ?? "—"}
      </div>
    );
  }

  return (
    <EChartSurface
      option={option}
      ariaLabel={t("charts.composedTrend")}
      height={resolvedHeight}
      className="aspect-auto"
    />
  );
}
