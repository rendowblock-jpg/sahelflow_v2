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
  innerRadius = "46%",
  outerRadius = "72%",
}: DonutChartProps) {
  const { t } = useI18n();
  const chartHeight = normalizeChartHeight(height);
  const total = data.reduce((sum, entry) => sum + entry.value, 0);

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
                  const percent =
                    total > 0 ? Math.round((numeric / total) * 100) : 0;
                  return [
                    `${numeric} (${percent}%)`,
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
            stroke="var(--background)"
            paddingAngle={2}
            isAnimationActive
            animationDuration={600}
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
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue ? (
            <bdi dir="ltr" className="text-2xl font-bold tabular-nums">
              {centerValue}
            </bdi>
          ) : null}
          {centerLabel ? (
            <span className="text-xs text-muted-foreground">{centerLabel}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
