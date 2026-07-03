"use client";

/**
 * ComposedTrendChart — bars + line on dual axes (shadcn v4 pattern).
 * 
 * - CartesianGrid: horizontal only, dashed, var(--border)
 * - No axis lines
 * - cursor={false} on tooltip
 * - indicator="dot"
 * - type="natural" for line
 * - Rounded bar tops: radius [4, 4, 0, 0]
 */
import { useI18n } from "@/hooks/use-i18n";
import {
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { resolveFormatter, type ChartFormatter } from "./chart-primitives";

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
  height?: number;
  formatLeftY?: ChartFormatter;
  formatRightY?: ChartFormatter;
  emptyMessage?: string;
}

export function ComposedTrendChart({
  data,
  xKey,
  series,
  config,
  height = 300,
  formatLeftY,
  formatRightY,
  emptyMessage,
}: ComposedTrendChartProps) {
  const { dir } = useI18n();
  const isRtl = dir === "rtl";
  const fmtLeft = resolveFormatter(formatLeftY);
  const fmtRight = resolveFormatter(formatRightY);
  if (!data.length) {
    return (
      <div className="flex w-full items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        {emptyMessage ?? "—"}
      </div>
    );
  }
  const hasRight = series.some((s) => s.yAxis === "right");
  return (
    <ChartContainer config={config} style={{ height }} className="aspect-auto w-full">
      <ComposedChart data={data} margin={{ left: isRtl ? 12 : 4, right: isRtl ? 4 : 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          reversed={isRtl}
          className="text-xs fill-muted-foreground"
        
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}/>
        <YAxis
          yAxisId="left"
          width={48}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          tickFormatter={(v: number) => fmtLeft(v)}
          className="text-xs fill-muted-foreground"
          orientation={isRtl ? "right" : "left"}
        />
        {hasRight && (
          <YAxis
            yAxisId="right"
            orientation={isRtl ? "left" : "right"}
            width={56}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            tickFormatter={(v: number) => fmtRight(v)}
            className="text-xs fill-muted-foreground"
          />
        )}
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              formatter={(value, name) => {
                const s = series.find((x) => x.key === name);
                const num = Number(value);
                const fmt = s?.format ? resolveFormatter(s.format) : fmtLeft;
                return [fmt(num), s?.label ?? name];
              }}
            />
          }
        />
        {series.map((s) =>
          s.kind === "bar" ? (
            <Bar
              key={s.key}
              dataKey={s.key}
              yAxisId={s.yAxis ?? "left"}
              fill={`var(--color-${s.key})`}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive
              animationDuration={500}
            />
          ) : (
            <Line
              key={s.key}
              dataKey={s.key}
              yAxisId={s.yAxis ?? "right"}
              type="natural"
              stroke={`var(--color-${s.key})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
              isAnimationActive
              animationDuration={600}
            />
          ),
        )}
      </ComposedChart>
    </ChartContainer>
  );
}
