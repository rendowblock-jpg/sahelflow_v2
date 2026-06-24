"use client";

/**
 * DonutChart — pie chart with an inner cutout and a centered total label.
 * Used for order-status distribution, delivery breakdowns, etc.
 */
import { Pie, PieChart, Cell } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface DonutDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
}

interface DonutChartProps {
  data: DonutDatum[];
  config: ChartConfig;
  height?: number;
  centerLabel?: string;
  centerValue?: string;
  innerRadius?: number;
  outerRadius?: number;
  emptyMessage?: string;
}

export function DonutChart({
  data,
  config,
  height = 300,
  centerLabel,
  centerValue,
  emptyMessage,
  innerRadius = 60,
  outerRadius = 90,
}: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (!total) {
    return (
      <div className="flex w-full items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        {emptyMessage ?? "—"}
      </div>
    );
  }

  return (
    <div className="relative" style={{ height }}>
      <ChartContainer config={config} style={{ height }} className="w-full">
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent
                nameKey="key"
                hideLabel
                formatter={(_value, name) => {
                  const d = data.find((x) => x.key === name);
                  const num = Number(d?.value ?? 0);
                  const pct = total > 0 ? Math.round((num / total) * 100) : 0;
                  return [`${num} (${pct}%)`, d?.label ?? name];
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
            {data.map((d) => (
              <Cell key={d.key} fill={d.color ?? `var(--color-${d.key})`} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      {(centerValue || centerLabel) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && (
            <span className="text-2xl font-bold tabular-nums">{centerValue}</span>
          )}
          {centerLabel && (
            <span className="text-xs text-muted-foreground">{centerLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
