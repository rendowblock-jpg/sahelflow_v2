"use client";

import { useI18n } from "@/hooks/use-i18n";
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";
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

export interface HBarDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
}

interface HorizontalBarChartProps {
  data: HBarDatum[];
  config: ChartConfig;
  height?: ChartHeight;
  formatValue?: ChartFormatter;
  emptyMessage?: string;
}

export function HorizontalBarChart({
  data,
  config,
  height = DEFAULT_CHART_HEIGHT,
  formatValue,
  emptyMessage,
}: HorizontalBarChartProps) {
  const { dir, t, locale } = useI18n();
  const isRtl = dir === "rtl";
  const chartHeight = normalizeChartHeight(height);
  const fmt = resolveFormatter(formatValue, locale);

  if (!data.length) {
    return (
      <div
        className="flex w-full items-center justify-center text-sm text-muted-foreground"
        style={{ height: chartHeight }}
      >
        {emptyMessage ?? "—"}
      </div>
    );
  }

  const maxLabelLen = Math.max(...data.map((entry) => entry.label.length), 4);

  return (
    <ChartContainer
      role="img"
      aria-label={t("charts.horizontalBar")}
      config={config}
      style={{ height: chartHeight }}
      className="aspect-auto w-full"
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{
          left: isRtl ? 36 : 4,
          right: isRtl ? 4 : 36,
          top: 4,
          bottom: 4,
        }}
        barCategoryGap={8}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={Math.min(maxLabelLen * 7 + 8, 120)}
          className="text-xs fill-muted-foreground"
          orientation={isRtl ? "right" : "left"}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={
            <ChartTooltipContent
              nameKey="key"
              indicator="dot"
              hideLabel
              formatter={(_value, name) => {
                const entry = data.find((item) => item.key === name);
                return [fmt(entry?.value ?? 0), entry?.label ?? name];
              }}
            />
          }
        />
        <Bar
          dataKey="value"
          radius={isRtl ? [4, 0, 0, 4] : [0, 4, 4, 0]}
          maxBarSize={22}
          isAnimationActive
          animationDuration={600}
        >
          {data.map((entry) => (
            <Cell
              key={entry.key}
              fill={entry.color ?? "var(--color-value, var(--color-chart-1))"}
            />
          ))}
          <LabelList
            dataKey="value"
            position={isRtl ? "left" : "right"}
            className="fill-muted-foreground text-xs font-medium tabular-nums"
            formatter={(value: number) => fmt(value)}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
