"use client";

/**
 * HorizontalBarChart — ranked horizontal bars for top products, top
 * wilayas, etc. Sorted descending by the caller, value labels on the
 * right, rounded bars, theme-aware colors.
 * Formatters are string keys (ChartFormatter) for RSC compatibility.
 */
import { Bar, BarChart, XAxis, YAxis, Cell, LabelList } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { resolveFormatter, type ChartFormatter } from "./chart-primitives";

export interface HBarDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
}

interface HorizontalBarChartProps {
  data: HBarDatum[];
  config: ChartConfig;
  height?: number;
  formatValue?: ChartFormatter;
}

export function HorizontalBarChart({
  data,
  config,
  height = 300,
  formatValue,
}: HorizontalBarChartProps) {
  const fmt = resolveFormatter(formatValue);
  if (!data.length) {
    return (
      <div className="flex w-full items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        No data
      </div>
    );
  }

  const maxLabelLen = Math.max(...data.map((d) => d.label.length), 4);

  return (
    <ChartContainer config={config} style={{ height }} className="w-full">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 4, right: 36, top: 4, bottom: 4 }}
        barCategoryGap={8}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={Math.min(maxLabelLen * 7 + 8, 120)}
          className="text-[11px]"
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={
            <ChartTooltipContent
              nameKey="key"
              hideLabel
              formatter={(_value, name) => {
                const d = data.find((x) => x.key === name);
                return [fmt(d?.value ?? 0), d?.label ?? name];
              }}
            />
          }
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive animationDuration={600}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.color ?? `var(--color-value, var(--color-chart-1))`} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            className="fill-muted-foreground text-[10px] font-medium tabular-nums"
            formatter={(v: number) => fmt(v)}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
