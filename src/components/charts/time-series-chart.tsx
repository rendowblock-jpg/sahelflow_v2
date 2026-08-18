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
import type {
  ChartConfig,
  ChartReferenceBand,
  ChartReferenceLine,
} from "./chart-types";
import {
  cartesianAxisStyle,
  chartDataZoom,
  chartLegend,
  chartTooltip,
  EChartSurface,
  resolveChartColor,
  type SahelChartTheme,
} from "./echarts-runtime";

export interface TimeSeriesDefinition {
  key: string;
  label: string;
  format?: ChartFormatter;
}

interface TimeSeriesChartProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: TimeSeriesDefinition[];
  config: ChartConfig;
  height?: ChartHeight;
  formatY?: ChartFormatter;
  emptyMessage?: string;
  mode: "line" | "area";
  ariaLabel: string;
  showGrid?: boolean;
  curve?: "monotone" | "linear" | "step" | "natural";
  referenceLines?: ChartReferenceLine[];
  referenceBands?: ChartReferenceBand[];
  yDomain?: [number, number];
  /**
   * Long additive series with only a few non-zero observations are easier to
   * read as discrete activity bars than as a mostly-flat interpolated area.
   * Area charts opt in by default; bounded/reference-band charts never switch.
   */
  adaptiveSparseBars?: boolean;
}

function isolate(value: unknown): string {
  return `\u2068${String(value ?? "")}\u2069`;
}

function curveOptions(curve: TimeSeriesChartProps["curve"]) {
  if (curve === "step") return { smooth: false, step: "middle" as const };
  if (curve === "linear") return { smooth: false };
  if (curve === "natural") return { smooth: 0.42 };
  return { smooth: 0.26 };
}

function configuredColor(
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

export function TimeSeriesChart({
  data,
  xKey,
  series,
  config,
  height = DEFAULT_CHART_HEIGHT,
  formatY,
  emptyMessage,
  mode,
  ariaLabel,
  showGrid = true,
  curve = "monotone",
  referenceLines = [],
  referenceBands = [],
  yDomain,
  adaptiveSparseBars,
}: TimeSeriesChartProps) {
  const { locale, dir } = useI18n();
  const chartHeight = normalizeChartHeight(height);
  const fmtY = React.useMemo(
    () => resolveFormatter(formatY, locale),
    [formatY, locale],
  );
  const meaningfulPointCount = React.useMemo(
    () =>
      data.filter((row) =>
        series.some((current) => {
          const value = Number(row[current.key] ?? 0);
          return Number.isFinite(value) && Math.abs(value) > 0;
        }),
      ).length,
    [data, series],
  );
  const allowSparseBars = adaptiveSparseBars ?? mode === "area";
  const useSparseBars =
    allowSparseBars &&
    mode === "area" &&
    series.length === 1 &&
    referenceLines.length === 0 &&
    referenceBands.length === 0 &&
    yDomain === undefined &&
    data.length >= 14 &&
    meaningfulPointCount > 0 &&
    meaningfulPointCount <= Math.max(4, Math.ceil(data.length * 0.16));
  const preserveZeroBaseline = mode === "area" && yDomain === undefined;

  const option = React.useCallback(
    (theme: SahelChartTheme) => {
      // Long periods remain fully visible by default so keyboard users can
      // traverse the complete selected range. The controls still allow an
      // intentional zoom after first render.
      const zoom = chartDataZoom(data.length, theme)?.map((control) => ({
        ...control,
        start: 0,
        end: 100,
      }));
      const axis = cartesianAxisStyle(theme);
      const hasLegend = series.length > 1;
      const hasEndLabel =
        !useSparseBars &&
        series.length === 1 &&
        data.length > 1 &&
        meaningfulPointCount > 0;
      const chartSeries = series.map((current, index) => {
        const format = current.format
          ? resolveFormatter(current.format, locale)
          : fmtY;
        const color = configuredColor(config, current.key, theme, index);
        const values = data.map((row) => {
          const value = Number(row[current.key] ?? 0);
          return Number.isFinite(value) ? value : 0;
        });
        const markLine =
          index === 0 && referenceLines.length
            ? {
                silent: true,
                symbol: ["none", "none"],
                label: {
                  show: true,
                  color: theme.mutedForeground,
                  fontSize: 11,
                  position: "insideEndTop",
                  formatter: (params: { name?: string }) => params.name ?? "",
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  borderWidth: 1,
                  borderRadius: 5,
                  padding: [3, 6],
                },
                lineStyle: { width: 1, opacity: 0.75 },
                data: referenceLines.map((reference) => ({
                  name: reference.label,
                  yAxis: reference.value,
                  lineStyle: {
                    color: resolveChartColor(reference.color, theme, index),
                    type: reference.lineStyle ?? "dashed",
                    width: 1,
                    opacity: 0.72,
                  },
                })),
              }
            : undefined;
        const markArea =
          index === 0 && referenceBands.length
            ? {
                silent: true,
                label: {
                  show: true,
                  color: theme.mutedForeground,
                  fontSize: 10,
                  position: "insideTopLeft",
                },
                data: referenceBands.map((band) => [
                  {
                    name: band.label,
                    yAxis: band.from,
                    itemStyle: {
                      color: resolveChartColor(band.color, theme, index),
                      opacity: 0.055,
                    },
                  },
                  { yAxis: band.to },
                ]),
              }
            : undefined;
        const tooltip = {
          valueFormatter: (value: unknown) => format(Number(value ?? 0)),
        };

        if (useSparseBars) {
          return {
            id: current.key,
            name: current.label,
            type: "bar" as const,
            data: values,
            barMaxWidth: 30,
            barMinWidth: 4,
            barMinHeight: 2,
            itemStyle: {
              color,
              borderRadius: [6, 6, 2, 2],
              opacity: 0.9,
            },
            emphasis: {
              focus: "series" as const,
              itemStyle: { opacity: 1 },
            },
            tooltip,
            markLine,
            markArea,
          };
        }

        return {
          id: current.key,
          name: current.label,
          type: "line" as const,
          data: values,
          ...curveOptions(curve),
          showSymbol: data.length <= 12,
          symbol: "circle",
          symbolSize: 7,
          connectNulls: false,
          sampling: data.length > 120 ? ("lttb" as const) : undefined,
          lineStyle: {
            color,
            width: mode === "area" ? 2.4 : 2.25,
            cap: "round" as const,
          },
          itemStyle: { color, borderColor: theme.card, borderWidth: 2 },
          areaStyle:
            mode === "area"
              ? {
                  color,
                  opacity: theme.dark ? 0.12 : 0.1,
                }
              : undefined,
          emphasis: {
            focus: "series" as const,
            scale: 1.15,
            lineStyle: { width: 3 },
          },
          endLabel: hasEndLabel
            ? {
                show: true,
                formatter: (params: { value?: unknown }) =>
                  format(Number(params.value ?? 0)),
                color,
                fontSize: 11,
                fontWeight: 600,
                distance: 8,
                backgroundColor: theme.card,
                borderColor: theme.border,
                borderWidth: 1,
                borderRadius: 6,
                padding: [3, 6],
              }
            : undefined,
          tooltip,
          markLine,
          markArea,
        };
      });

      return {
        color: series.map((entry, index) =>
          configuredColor(config, entry.key, theme, index),
        ),
        legend: hasLegend ? chartLegend(theme, dir) : undefined,
        grid: {
          left: 8,
          right: hasEndLabel ? 82 : 18,
          top: hasLegend ? 38 : 14,
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
          boundaryGap: useSparseBars,
          data: data.map((row) => String(row[xKey] ?? "")),
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            color: theme.mutedForeground,
            fontSize: 12,
            hideOverlap: true,
            margin: 12,
            formatter: (value: string) => isolate(value),
          },
          axisPointer: { show: true, snap: true },
        },
        yAxis: {
          type: "value",
          min: yDomain?.[0] ?? (preserveZeroBaseline ? 0 : undefined),
          max: yDomain?.[1],
          scale: yDomain === undefined && !preserveZeroBaseline,
          ...axis,
          splitLine: showGrid ? axis.splitLine : { show: false },
          axisLabel: {
            ...axis.axisLabel,
            formatter: (value: number) => isolate(fmtY(value)),
          },
        },
        dataZoom: zoom,
        series: chartSeries,
      };
    },
    [
      config,
      curve,
      data,
      dir,
      fmtY,
      locale,
      meaningfulPointCount,
      mode,
      preserveZeroBaseline,
      referenceBands,
      referenceLines,
      series,
      showGrid,
      useSparseBars,
      xKey,
      yDomain,
    ],
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
      ariaLabel={ariaLabel}
      height={chartHeight}
      className="aspect-auto"
    />
  );
}
