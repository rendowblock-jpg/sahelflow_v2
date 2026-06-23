"use client";

/**
 * LineTrendChart — multi-series line chart for comparing trends
 * (e.g. revenue vs. last period, AOV across weeks). Dots appear on hover.
 */
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

interface LineTrendChartProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: Array<{ key: string; label: string; format?: (v: number) => string }>;
  config: ChartConfig;
  height?: number;
  formatY?: (v: number) => string;
  formatX?: (v: string) => string;
}

export function LineTrendChart({
  data,
  xKey,
  series,
  config,
  height = 300,
  formatY = (v) => String(v),
  formatX,
}: LineTrendChartProps) {
  if (!data.length) {
    return (
      <div className="flex w-full items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        No data
      </div>
    );
  }
  return (
    <ChartContainer config={config} style={{ height }} className="w-full">
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
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
          <Line
            key={s.key}
            dataKey={s.key}
            type="monotone"
            stroke={`var(--color-${s.key})`}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
            isAnimationActive
            animationDuration={600}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
