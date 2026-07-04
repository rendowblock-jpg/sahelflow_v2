"use client";

/**
 * LineTrendChart — multi-series line chart (shadcn v4 pattern).
 * 
 * - CartesianGrid: horizontal only, dashed, var(--border)
 * - No axis lines (tickLine={false} axisLine={false})
 * - minTickGap={32} to prevent crowded labels
 * - type="natural" curve
 * - cursor={false} on tooltip
 * - indicator="dot"
 */
import { useI18n } from "@/hooks/use-i18n";
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { resolveFormatter, type ChartFormatter } from "./chart-primitives";

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
  height?: number;
  formatY?: ChartFormatter;
  emptyMessage?: string;
}

export function LineTrendChart({
  data,
  xKey,
  series,
  config,
  height = 300,
  formatY,
  emptyMessage,
}: LineTrendChartProps) {
  const { dir } = useI18n();
  const isRtl = dir === "rtl";
  const fmtY = resolveFormatter(formatY);
  if (!data.length) {
    return (
      <div className="flex w-full items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        {emptyMessage ?? "—"}
      </div>
    );
  }
  return (
    <ChartContainer role="img" aria-label="Line trend chart" config={config} style={{ height }} className="aspect-auto w-full">
      <LineChart data={data} margin={{ left: isRtl ? 12 : 4, right: isRtl ? 4 : 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          reversed={isRtl}
          className="text-xs fill-muted-foreground"
        
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}/>
        <YAxis
          width={56}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          tickFormatter={(v: number) => fmtY(v)}
          className="text-xs fill-muted-foreground"
          orientation={isRtl ? "right" : "left"}
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
          <Line
            key={s.key}
            dataKey={s.key}
            type="natural"
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
