"use client";

import { useI18n } from "@/hooks/use-i18n";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  DEFAULT_CHART_HEIGHT,
  normalizeChartHeight,
  resolveFormatter,
  type ChartFormatter,
  type ChartHeight,
} from "./chart-primitives";
import { useChartMotion } from "./chart-motion";

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
  const { dir, t, locale } = useI18n();
  const { isAnimationActive, fastDuration, baseDuration } = useChartMotion();
  const isRtl = dir === "rtl";
  const chartHeight = normalizeChartHeight(height);
  const fmtLeft = resolveFormatter(formatLeftY, locale);
  const fmtRight = resolveFormatter(formatRightY, locale);

  if (!data.length) {
    return (
      <div
        className="flex w-full items-center justify-center text-sm text-muted-foreground"
        style={{ height: chartHeight }}
      >
        {emptyMessage ?? "—"}
      </div>
    );
  }

  const hasRight = series.some(
    (entry) =>
      entry.yAxis === "right" ||
      (entry.kind === "line" && entry.yAxis === undefined),
  );

  return (
    <ChartContainer
      role="img"
      aria-label={t("charts.composedTrend")}
      config={config}
      style={{ height: chartHeight }}
      className="aspect-auto w-full"
    >
      <ComposedChart
        data={data}
        margin={{
          left: isRtl ? 12 : 4,
          right: isRtl ? 4 : 12,
          top: 8,
          bottom: 0,
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          minTickGap={24}
          reversed={isRtl}
          className="text-xs fill-muted-foreground"
          tick={{ fill: "var(--sf-chart-axis)", fontSize: 12 }}
        />
        <YAxis
          yAxisId="left"
          width={60}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          tickFormatter={(value: number) => fmtLeft(value)}
          className="text-xs fill-muted-foreground"
          orientation={isRtl ? "right" : "left"}
          tick={{ fill: "var(--sf-chart-axis)", fontSize: 12 }}
        />
        {hasRight ? (
          <YAxis
            yAxisId="right"
            orientation={isRtl ? "left" : "right"}
            width={60}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            tickFormatter={(value: number) => fmtRight(value)}
            className="text-xs fill-muted-foreground"
            tick={{ fill: "var(--sf-chart-axis)", fontSize: 12 }}
          />
        ) : null}
        <ChartTooltip
          cursor={{ stroke: "var(--sf-chart-grid)", strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              indicator="dot"
              formatter={(value, name) => {
                const current = series.find((entry) => entry.key === name);
                const numeric = Number(value);
                const currentAxis =
                  current?.yAxis ??
                  (current?.kind === "line" ? "right" : "left");
                const format = current?.format
                  ? resolveFormatter(current.format, locale)
                  : currentAxis === "right"
                    ? fmtRight
                    : fmtLeft;
                return [format(numeric), current?.label ?? name];
              }}
            />
          }
        />
        {series.map((current) =>
          current.kind === "bar" ? (
            <Bar
              key={current.key}
              dataKey={current.key}
              yAxisId={current.yAxis ?? "left"}
              fill={`var(--color-${current.key})`}
              radius={[5, 5, 1, 1]}
              maxBarSize={28}
              isAnimationActive={isAnimationActive}
              animationDuration={fastDuration}
              animationEasing="ease-out"
            />
          ) : (
            <Line
              key={current.key}
              dataKey={current.key}
              yAxisId={current.yAxis ?? "right"}
              type="monotone"
              stroke={`var(--color-${current.key})`}
              strokeWidth={2.25}
              dot={false}
              activeDot={{
                r: 4,
                strokeWidth: 2,
                stroke: "var(--background)",
              }}
              isAnimationActive={isAnimationActive}
              animationDuration={baseDuration}
              animationEasing="ease-out"
            />
          ),
        )}
      </ComposedChart>
    </ChartContainer>
  );
}
