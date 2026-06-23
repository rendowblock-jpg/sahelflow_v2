"use client";

/**
 * HorizontalBarChart — ranked horizontal bars for top products, top
 * wilayas, etc. Sorted descending by the caller, value labels on the
 * right, rounded bars, theme-aware colors.
 */
import { Bar, BarChart, XAxis, YAxis, Cell, LabelList } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface HBarDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
  displayValue?: string;
}

interface HorizontalBarChartProps {
  data: HBarDatum[];
  config: ChartConfig;
  height?: number;
  formatValue?: (v: number) => string;
  layout?: "horizontal" | "vertical";
}

export function HorizontalBarChart({
  data,
  config,
  height = 300,
  formatValue = (v) => String(v),
}: HorizontalBarChartProps) {
  if (!data.length) {
    return (
      <div className="flex w-full items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        No data
      </div>
    );
  }

  // Use the longest label to size the left axis
  const maxLabelLen = Math.max(...data.map((d) => d.label.length), 4);

  return (
    <ChartContainer config={config} style={{ height }} className="w-full">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 4, right: 28, top: 4, bottom: 4 }}
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
                return [formatValue(d?.value ?? 0), d?.label ?? name];
              }}
            />
          }
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive animationDuration={600}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.color ?? `var(--color-${d.key})`} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            className="fill-muted-foreground text-[10px] font-medium tabular-nums"
            formatter={(v: number) => formatValue(v)}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
