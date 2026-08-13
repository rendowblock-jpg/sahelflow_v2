"use client";

import { useI18n } from "@/hooks/use-i18n";
import {
  CartesianGrid,
  Line,
  LineChart,
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

interface LineSeries {
  key: string;
  label: string;
  format?: ChartFormatter;
}
interface LineTrendChartProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: LineSeries[];
  config: ChartConfig;
  height?: ChartHeight;
  formatY?: ChartFormatter;
  emptyMessage?: string;
}

export function LineTrendChart({
  data,
  xKey,
  series,
  config,
  height = DEFAULT_CHART_HEIGHT,
  formatY,
  emptyMessage,
}: LineTrendChartProps) {
  const { dir, t, locale } = useI18n();
  const isRtl = dir === "rtl";
  const chartHeight = normalizeChartHeight(height);
  const fmtY = resolveFormatter(formatY, locale);

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
      aria-label={t("charts.lineTrend")}
      config={config}
      style={{ height: chartHeight }}
      className="aspect-auto w-full"
    >
      <LineChart
        data={data}
        margin={{
          left: isRtl ? 12 : 4,
          right: isRtl ? 4 : 12,
          top: 8,
          bottom: 0,
        }}
      >
        <CartesianGrid
          vertical={false}
          strokeDasharray="3 3"
          stroke="var(--border)"
        />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          reversed={isRtl}
          className="text-xs fill-muted-foreground"
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
        />
        <YAxis
          width={56}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          tickFormatter={(value: number) => fmtY(value)}
          className="text-xs fill-muted-foreground"
          orientation={isRtl ? "right" : "left"}
        />
        <ChartTooltip
          cursor={false}
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
          <Line
            key={current.key}
            dataKey={current.key}
            type="natural"
            stroke={`var(--color-${current.key})`}
            strokeWidth={2}
            dot={false}
            activeDot={{
              r: 4,
              strokeWidth: 2,
              stroke: "var(--background)",
            }}
            isAnimationActive
            animationDuration={600}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
