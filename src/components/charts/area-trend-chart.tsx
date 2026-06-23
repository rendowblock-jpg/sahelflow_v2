"use client";

/**
 * AreaTrendChart — premium gradient-filled area chart for time-series
 * (revenue, orders, AOV). Supports one or more series, smooth monotone
 * curves, custom currency/number formatting, and a shared design-system
 * tooltip. Theme-aware via the OKLCH chart tokens.
 */
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

interface AreaTrendChartProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: Array<{ key: string; label: string; format?: (v: number) => string }>;
  config: ChartConfig;
  height?: number;
  formatY?: (v: number) => string;
  formatX?: (v: string) => string;
  showGrid?: boolean;
  curve?: "monotone" | "linear" | "step";
}

export function AreaTrendChart({
  data,
  xKey,
  series,
  config,
  height = 300,
  formatY = (v) => String(v),
  formatX,
  showGrid = true,
  curve = "monotone",
}: AreaTrendChartProps) {
  if (!data.length) {
    return (
      <div className="flex h-[var(--chart-height,300px)] items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        No data
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
                <stop offset="0%" stopColor={`var(--color-${s.key})`} stopOpacity={0.35} />
                <stop offset="100%" stopColor={`var(--color-${s.key})`} stopOpacity={0.02} />
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
          tickFormatter={formatX}
          className="text-[11px]"
        />
        <YAxis
          width={48}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          tickFormatter={(v: number) => formatY(v)}
          className="text-[11px]"
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) => (formatX ? formatX(String(value)) : String(value))}
              formatter={(value, name) => {
                const s = series.find((x) => x.key === name);
                const num = Number(value);
                return [s?.format ? s.format(num) : formatY(num), s?.label ?? name];
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

