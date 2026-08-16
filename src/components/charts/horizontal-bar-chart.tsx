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
import { useChartMotion } from "./chart-motion";

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

function compactCategoryLabel(value: string): string {
  return value.length > 27 ? `${value.slice(0, 26).trimEnd()}…` : value;
}

export function HorizontalBarChart({
  data,
  config,
  height = DEFAULT_CHART_HEIGHT,
  formatValue,
  emptyMessage,
}: HorizontalBarChartProps) {
  const { t, locale, dir } = useI18n();
  const { isAnimationActive, baseDuration } = useChartMotion();
  const chartHeight = normalizeChartHeight(height);
  const fmt = resolveFormatter(formatValue, locale);
  const rtl = dir === "rtl";

  if (!data.length) {
    return (
      <div
        dir={dir}
        className="flex w-full items-center justify-center text-sm text-muted-foreground"
        style={{ height: chartHeight }}
      >
        {emptyMessage ?? "—"}
      </div>
    );
  }

  const maxVisibleLabelLength = Math.max(
    ...data.map((entry) => compactCategoryLabel(entry.label).length),
    4,
  );
  const categoryWidth = Math.min(
    Math.max(maxVisibleLabelLength * (rtl ? 7.4 : 6.8) + 18, 104),
    rtl ? 210 : 190,
  );

  return (
    <ChartContainer
      dir={dir}
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
          left: rtl ? 58 : 8,
          right: rtl ? 8 : 58,
          top: 6,
          bottom: 6,
        }}
        barCategoryGap={10}
      >
        <XAxis type="number" hide domain={[0, "dataMax"]} reversed={rtl} />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={categoryWidth}
          orientation={rtl ? "right" : "left"}
          tickFormatter={compactCategoryLabel}
          tick={{
            fill: "var(--sf-chart-axis)",
            fontSize: rtl ? 13 : 12,
          }}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.26 }}
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
          radius={rtl ? [5, 1, 1, 5] : [1, 5, 5, 1]}
          maxBarSize={22}
          isAnimationActive={isAnimationActive}
          animationDuration={baseDuration}
          animationEasing="ease-out"
        >
          {data.map((entry) => (
            <Cell
              key={entry.key}
              fill={entry.color ?? "var(--color-value, var(--color-chart-1))"}
            />
          ))}
          <LabelList
            dataKey="value"
            position={rtl ? "left" : "right"}
            className="fill-muted-foreground text-xs font-medium tabular-nums"
            formatter={(value: number) => fmt(value)}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
