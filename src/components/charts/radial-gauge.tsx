"use client";

import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { useI18n } from "@/hooks/use-i18n";
import {
  normalizeChartHeight,
  type ChartHeight,
} from "./chart-primitives";

interface RadialGaugeProps {
  /** 0–100 */
  value: number;
  config: ChartConfig;
  dataKey?: string;
  height?: ChartHeight;
  centerLabel?: string;
  colorVar?: string;
}

export function RadialGauge({
  value,
  config,
  dataKey = "value",
  height = 220,
  centerLabel,
  colorVar,
}: RadialGaugeProps) {
  const { t } = useI18n();
  const chartHeight = normalizeChartHeight(height);
  const clamped = Math.max(0, Math.min(100, value));
  const data = [{ [dataKey]: clamped }];

  return (
    <div className="relative" style={{ height: chartHeight }}>
      <ChartContainer
        role="img"
        aria-label={t("charts.radialGauge")}
        config={config}
        style={{ height: chartHeight }}
        className="aspect-auto w-full"
      >
        <RadialBarChart
          data={data}
          startAngle={90}
          endAngle={-270}
          innerRadius="66%"
          outerRadius="90%"
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey={dataKey}
            background={{ fill: "var(--muted)", opacity: 0.4 }}
            cornerRadius={12}
            fill={colorVar ?? `var(--color-${dataKey})`}
            isAnimationActive
            animationDuration={700}
          />
        </RadialBarChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums tracking-tight">
          {Math.round(clamped)}%
        </span>
        {centerLabel ? (
          <span className="mt-1 text-xs text-muted-foreground">{centerLabel}</span>
        ) : null}
      </div>
    </div>
  );
}
