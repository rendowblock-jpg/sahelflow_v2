"use client";

import { Cell, Pie, PieChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useI18n } from "@/hooks/use-i18n";
import {
  DEFAULT_CHART_HEIGHT,
  normalizeChartHeight,
  type ChartHeight,
} from "./chart-primitives";
import { useChartMotion } from "./chart-motion";

export interface DonutDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
}

interface DonutChartProps {
  data: DonutDatum[];
  config: ChartConfig;
  height?: ChartHeight;
  centerLabel?: string;
  centerValue?: string;
  innerRadius?: number | string;
  outerRadius?: number | string;
  emptyMessage?: string;
}

export function DonutChart({
  data,
  config,
  height = DEFAULT_CHART_HEIGHT,
  centerLabel,
  centerValue,
  emptyMessage,
  innerRadius = "48%",
  outerRadius = "72%",
}: DonutChartProps) {
  const { t, locale } = useI18n();
  const { isAnimationActive, baseDuration } = useChartMotion();
  const chartHeight = normalizeChartHeight(height);
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  const localeTag = locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-DZ";
  const countFormatter = new Intl.NumberFormat(localeTag, {
    maximumFractionDigits: 2,
  });
  const percentFormatter = new Intl.NumberFormat(localeTag, {
    style: "percent",
    maximumFractionDigits: 0,
  });

  if (!total) {
    return (
      <div
        className="flex w-full items-center justify-center text-sm text-muted-foreground"
        style={{ height: chartHeight }}
      >
        {emptyMessage ?? "—"}
      </div>
    );
  }

  return (
    <div className="relative" style={{ height: chartHeight }}>
      <ChartContainer
        role="img"
        aria-label={t("charts.donut")}
        config={config}
        style={{ height: chartHeight }}
        className="aspect-auto w-full"
      >
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent
                nameKey="key"
                hideLabel
                formatter={(_value, name) => {
                  const entry = data.find((item) => item.key === name);
                  const numeric = Number(entry?.value ?? 0);
                  return [
                    `${countFormatter.format(numeric)} · ${percentFormatter.format(total > 0 ? numeric / total : 0)}`,
                    entry?.label ?? name,
                  ];
                }}
              />
            }
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="key"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            strokeWidth={2}
            stroke="var(--card)"
            paddingAngle={2.5}
            cornerRadius={3}
            isAnimationActive={isAnimationActive}
            animationDuration={baseDuration}
            animationEasing="ease-out"
          >
            {data.map((entry) => (
              <Cell
                key={entry.key}
                fill={entry.color ?? `var(--color-${entry.key})`}
              />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      {centerValue || centerLabel ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue ? (
            <bdi dir="auto" className="text-2xl font-semibold tabular-nums tracking-tight">
              {centerValue}
            </bdi>
          ) : null}
          {centerLabel ? (
            <span className="mt-0.5 max-w-24 text-xs leading-4 text-muted-foreground">
              {centerLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
