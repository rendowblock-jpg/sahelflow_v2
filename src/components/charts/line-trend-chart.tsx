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
import { useChartMotion } from "./chart-motion";

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
  const { t, locale, dir } = useI18n();
  const { isAnimationActive, baseDuration } = useChartMotion();
  const chartHeight = normalizeChartHeight(height);
  const fmtY = resolveFormatter(formatY, locale);
  const rtl = dir === "rtl";

  if (!data.length) {
    return (
      <div
        dir={dir}
        className="flex w-full items-center justify-center text-sm text-muted-foreground"
        style={{ height: chartHeight }}
      >
        {emptyMessage ?? "—"}
      </div>
    );
  }

  return (
    <ChartContainer
      dir={dir}
      role="img"
      aria-label={t("charts.lineTrend")}
      config={config}
      style={{ height: chartHeight }}
      className="aspect-auto w-full"
    >
      <LineChart
        data={data}
        margin={{
          left: rtl ? 12 : 4,
          right: rtl ? 4 : 12,
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
          minTickGap={32}
          className="text-xs fill-muted-foreground"
          tick={{
            fill: "var(--sf-chart-axis)",
            fontSize: rtl ? 13 : 12,
          }}
        />
        <YAxis
          width={rtl ? 68 : 60}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value: number) => fmtY(value)}
          className="text-xs fill-muted-foreground"
          orientation={rtl ? "right" : "left"}
          tick={{
            fill: "var(--sf-chart-axis)",
            fontSize: rtl ? 13 : 12,
          }}
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
          <Line
            key={current.key}
            dataKey={current.key}
            type="monotone"
            stroke={`var(--color-${current.key})`}
            strokeWidth={2.5}
            dot={false}
            activeDot={{
              r: 4.5,
              strokeWidth: 2,
              stroke: "var(--background)",
            }}
            isAnimationActive={isAnimationActive}
            animationDuration={baseDuration}
            animationEasing="ease-out"
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
