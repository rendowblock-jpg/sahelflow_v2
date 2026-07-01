"use client";

/**
 * Shared chart primitives — premium, theme-aware, built on the shadcn
 * ChartContainer/ChartConfig wrapper so every chart inherits the OKLCH
 * design-system chart tokens (--chart-1..5) and a consistent tooltip.
 */
import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { cn, formatDZD, formatDZDShort } from "@/lib/utils";

/**
 * Serializable formatter registry. Server components pass a string key
 * (e.g. "currencyShort") instead of a function — functions cannot cross
 * the React Server Component boundary (hydration would break).
 */
export type ChartFormatter = "currency" | "currencyShort" | "number" | "percent" | "identity";

// TODO: chart formatters use default "fr" locale — pass locale from page for ar-DZ formatting
export const chartFormatters: Record<ChartFormatter, (v: number) => string> = {
  currency: (v) => formatDZD(v),
  currencyShort: (v) => formatDZDShort(v),
  number: (v) => String(v),
  percent: (v) => `${Math.round(v)}%`,
  identity: (v) => String(v),
};

export function resolveFormatter(f?: ChartFormatter): (v: number) => string {
  return f ? (chartFormatters[f] ?? chartFormatters.identity) : chartFormatters.identity;
}

/** Canonical chart palette — references the OKLCH design tokens. */
export const CHART_COLORS = {
  chart1: "var(--color-chart-1)",
  chart2: "var(--color-chart-2)",
  chart3: "var(--color-chart-3)",
  chart4: "var(--color-chart-4)",
  chart5: "var(--color-chart-5)",
} as const;

export const CHART_COLOR_ARRAY = [
  CHART_COLORS.chart1,
  CHART_COLORS.chart2,
  CHART_COLORS.chart3,
  CHART_COLORS.chart4,
  CHART_COLORS.chart5,
] as const;

/** Map a list of series names to a ChartConfig using the rotating palette. */
export function buildChartConfig(
  series: Array<{ key: string; label: React.ReactNode }>,
  palette: readonly string[] = CHART_COLOR_ARRAY,
): ChartConfig {
  const cfg: ChartConfig = {};
  series.forEach((s, i) => {
    cfg[s.key] = { label: s.label, color: palette[i % palette.length] };
  });
  return cfg;
}

interface ChartCardProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: string;
  action?: React.ReactNode;
  className?: string;
  config: ChartConfig;
  height?: number;
  children: React.ComponentProps<typeof ChartContainer>["children"];
}

/** A Card that wraps a ChartContainer — premium chart frame.
 * 
 * Pattern: shadcn v4 — compact header, no icon chip (title stands alone),
 * ChartContainer with aspect-auto, subtle hover elevation.
 */
export function ChartCard({
  title,
  description,
  action,
  className,
  config,
  height = 300,
  children,
}: ChartCardProps) {
  return (
    <Card className={cn(
      "border shadow-xs transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
      "hover:shadow-md",
      className,
    )}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="space-y-0.5">
          <CardTitle className="text-base font-semibold tracking-tight">{title}</CardTitle>
          {description && (
            <CardDescription className="text-xs text-muted-foreground">{description}</CardDescription>
          )}
        </div>
        {action}
      </CardHeader>
      <CardContent className="pt-2">
        <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
          {children}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/** Consistent empty-state for charts with no data. */
export function ChartEmpty({ message, height = 300 }: { message: string; height?: number }) {
  return (
    <div
      className="flex w-full items-center justify-center text-sm text-muted-foreground"
      style={{ height }}
    >
      {message}
    </div>
  );
}

/** A unique gradient id, stable per chart instance. */
export function useGradientId(prefix: string) {
  const id = React.useId().replace(/:/g, "");
  return `${prefix}-${id}`;
}
