"use client";

/**
 * AreaTrendChart — premium gradient-filled area chart (shadcn v4 pattern).
 * 
 * - Gradient fill: 1.0 → 0.1 opacity
 * - No axis lines (tickLine={false} axisLine={false})
 * - minTickGap={32} to prevent crowded labels
 * - CartesianGrid: horizontal only, dashed, border color
 * - type="natural" curve (smoother than monotone)
 */
import { useI18n } from "@/hooks/use-i18n";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { resolveFormatter, type ChartFormatter, useGradientId } from "./chart-primitives";

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
  curve?: "monotone" | "linear" | "step" | "natural";
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
  curve = "natural",
  emptyMessage,
}: AreaTrendChartProps) {
  const { dir } = useI18n();
  const isRtl = dir === "rtl";
  const fmtY = resolveFormatter(formatY);
  const gradientId = useGradientId("area");

  if (!data.length) {
    return (
      <div className="flex w-full items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        {emptyMessage ?? "—"}
      </div>
    );
  }

  return (
    <ChartContainer config={config} style={{ height }} className="aspect-auto w-full">
      <AreaChart data={data} margin={{ left: isRtl ? 12 : 4, right: isRtl ? 4 : 12, top: 8, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${gradientId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${s.key})`} stopOpacity={0.8} />
              <stop offset="95%" stopColor={`var(--color-${s.key})`} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        {showGrid && <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />}
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
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
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
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
            fill={`url(#${gradientId}-${s.key})`}
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
