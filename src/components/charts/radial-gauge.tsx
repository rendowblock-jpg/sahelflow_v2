"use client";

import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { useI18n } from "@/hooks/use-i18n";
import {
  normalizeChartHeight,
  type ChartHeight,
} from "./chart-primitives";
import { useChartMotion } from "./chart-motion";

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
  const { t, locale } = useI18n();
  const { isAnimationActive, baseDuration } = useChartMotion();
  const chartHeight = normalizeChartHeight(height);
  const clamped = Math.max(0, Math.min(100, value));
  const data = [{ [dataKey]: clamped }];
  const localeTag = locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-DZ";
  const percent = new Intl.NumberFormat(localeTag, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(clamped / 100);

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
          innerRadius="68%"
          outerRadius="88%"
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey={dataKey}
            background={{ fill: "var(--muted)", opacity: 0.46 }}
            cornerRadius={12}
            fill={colorVar ?? `var(--color-${dataKey})`}
            isAnimationActive={isAnimationActive}
            animationDuration={baseDuration}
            animationEasing="ease-out"
          />
        </RadialBarChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <bdi dir="auto" className="text-3xl font-semibold tabular-nums tracking-tight">
          {percent}
        </bdi>
        {centerLabel ? (
          <span className="mt-1 max-w-28 text-xs leading-4 text-muted-foreground">
            {centerLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
