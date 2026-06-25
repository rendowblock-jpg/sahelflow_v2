"use client";

/**
 * AreaTrendChart — premium gradient-filled area chart for time-series
 * (revenue, orders, AOV). Supports one or more series, smooth monotone
 * curves, and a shared design-system tooltip. Theme-aware via the OKLCH
 * chart tokens.
 *
 * Formatters are passed as STRING keys (ChartFormatter) — not functions —
 * because functions cannot cross the React Server Component boundary.
 */
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { resolveFormatter, type ChartFormatter } from "./chart-primitives";

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
  height?: number;
  formatY?: ChartFormatter;
  showGrid?: boolean;
  curve?: "monotone" | "linear" | "step";
  emptyMessage?: string;
}

export function AreaTrendChart({
  data,
  xKey,
  series,
  config,
  height = 300,
  formatY,
  showGrid = true,
  curve = "monotone",
  emptyMessage,
}: AreaTrendChartProps) {
  const fmtY = resolveFormatter(formatY);
  if (!data.length) {
    return (
      <div className="flex w-full items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        {emptyMessage ?? "—"}
      </div>
    );
  }

  return (
    <ChartContainer config={config} style={{ height }} className="w-full">
      <AreaChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <defs>
          {series.map((s) => {
            const id = `grad-${s.key}`;
            return (
              <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`var(--color-${s.key})`} stopOpacity={0.5} />
                <stop offset="100%" stopColor={`var(--color-${s.key})`} stopOpacity={0.05} />
              </linearGradient>
            );
          })}
        </defs>
        {showGrid && <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />}
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          className="text-xs fill-muted-foreground"
        />
        <YAxis
          width={56}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          tickFormatter={(v: number) => fmtY(v)}
          className="text-xs fill-muted-foreground"
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => {
                const s = series.find((x) => x.key === name);
                const num = Number(value);
                return [s?.format ? resolveFormatter(s.format)(num) : fmtY(num), s?.label ?? name];
              }}
            />
          }
        />
        {series.map((s) => (
          <Area
            key={s.key}
            dataKey={s.key}
            type={curve}
            stroke={`var(--color-${s.key})`}
            strokeWidth={2}
            fill={`url(#grad-${s.key})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
            isAnimationActive
            animationDuration={600}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
