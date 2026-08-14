"use client";

import { useI18n } from "@/hooks/use-i18n";
import {
  Area,
  AreaChart,
  CartesianGrid,
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
  useGradientId,
} from "./chart-primitives";
import { useChartMotion } from "./chart-motion";

interface AreaSeries {
  key: string;
  label: string;
  format?: ChartFormatter;
}
interface AreaTrendChartProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: AreaSeries[];
  config: ChartConfig;
  height?: ChartHeight;
  formatY?: ChartFormatter;
  showGrid?: boolean;
  curve?: "monotone" | "linear" | "step" | "natural";
  emptyMessage?: string;
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
}: AreaTrendChartProps) {
  const { dir, t, locale } = useI18n();
  const { isAnimationActive, baseDuration } = useChartMotion();
  const isRtl = dir === "rtl";
  const chartHeight = normalizeChartHeight(height);
  const fmtY = resolveFormatter(formatY, locale);
  const gradientId = useGradientId("area");

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

  return (
    <ChartContainer
      role="img"
      aria-label={t("charts.areaTrend")}
      config={config}
      style={{ height: chartHeight }}
      className="aspect-auto w-full"
    >
      <AreaChart
        data={data}
        margin={{
          left: isRtl ? 12 : 4,
          right: isRtl ? 4 : 12,
          top: 8,
          bottom: 0,
        }}
      >
        <defs>
          {series.map((s) => (
            <linearGradient
              key={s.key}
              id={`${gradientId}-${s.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="5%"
                stopColor={`var(--color-${s.key})`}
                stopOpacity={0.56}
              />
              <stop
                offset="95%"
                stopColor={`var(--color-${s.key})`}
                stopOpacity={0.025}
              />
            </linearGradient>
          ))}
        </defs>
        {showGrid && (
          <CartesianGrid vertical={false} />
        )}
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          minTickGap={32}
          reversed={isRtl}
          className="text-xs fill-muted-foreground"
          tick={{ fill: "var(--sf-chart-axis)", fontSize: 12 }}
        />
        <YAxis
          width={60}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          tickFormatter={(value: number) => fmtY(value)}
          className="text-xs fill-muted-foreground"
          orientation={isRtl ? "right" : "left"}
          tick={{ fill: "var(--sf-chart-axis)", fontSize: 12 }}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--sf-chart-grid)", strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              indicator="dot"
              formatter={(value, name) => {
                const current = series.find((entry) => entry.key === name);
                const numeric = Number(value);
                return [
                  current?.format
                    ? resolveFormatter(current.format, locale)(numeric)
                    : fmtY(numeric),
                  current?.label ?? name,
                ];
              }}
            />
          }
        />
        {series.map((current) => (
          <Area
            key={current.key}
            dataKey={current.key}
            type={curve}
            stroke={`var(--color-${current.key})`}
            strokeWidth={2.25}
            fill={`url(#${gradientId}-${current.key})`}
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
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
