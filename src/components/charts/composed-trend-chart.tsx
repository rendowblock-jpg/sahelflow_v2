"use client";

/**
 * ComposedTrendChart — bars + line on dual axes. Ideal for
 * "orders (bar) × revenue (line)" or "volume × value" combos.
 */
import {
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

interface BarSeries {
  kind: "bar";
  key: string;
  label: string;
  format?: (v: number) => string;
  color?: string;
  yAxis?: "left" | "right";
}
interface LineSeries {
  kind: "line";
  key: string;
  label: string;
  format?: (v: number) => string;
  color?: string;
  yAxis?: "left" | "right";
}
type ComposedSeries = BarSeries | LineSeries;

interface ComposedTrendChartProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: ComposedSeries[];
  config: ChartConfig;
  height?: number;
  formatLeftY?: (v: number) => string;
  formatRightY?: (v: number) => string;
  formatX?: (v: string) => string;
}

export function ComposedTrendChart({
  data,
  xKey,
  series,
  config,
  height = 300,
  formatLeftY = (v) => String(v),
  formatRightY = (v) => String(v),
  formatX,
}: ComposedTrendChartProps) {
  if (!data.length) {
    return (
      <div className="flex w-full items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        No data
      </div>
    );
  }
  const hasRight = series.some((s) => s.yAxis === "right");
  return (
    <ChartContainer config={config} style={{ height }} className="w-full">
      <ComposedChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={20}
          tickFormatter={formatX}
          className="text-[11px]"
        />
        <YAxis
          yAxisId="left"
          width={44}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          tickFormatter={(v: number) => formatLeftY(v)}
          className="text-[11px]"
        />
        {hasRight && (
          <YAxis
            yAxisId="right"
            orientation="right"
            width={52}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            tickFormatter={(v: number) => formatRightY(v)}
            className="text-[11px]"
          />
        )}
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) => (formatX ? formatX(String(value)) : String(value))}
              formatter={(value, name) => {
                const s = series.find((x) => x.key === name);
                const num = Number(value);
                return [s?.format ? s.format(num) : String(num), s?.label ?? name];
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
              type="monotone"
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
