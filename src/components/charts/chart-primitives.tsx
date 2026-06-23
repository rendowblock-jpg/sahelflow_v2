"use client";

/**
 * Shared chart primitives — premium, theme-aware, built on the shadcn
 * ChartContainer/ChartConfig wrapper so every chart inherits the OKLCH
 * design-system chart tokens (--chart-1..5) and a consistent tooltip.
 */
import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

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
  icon?: React.ComponentType<{ className?: string }>;
  accent?: string;
  action?: React.ReactNode;
  className?: string;
  config: ChartConfig;
  height?: number;
  children: React.ComponentProps<typeof ChartContainer>["children"];
}

/** A Card that wraps a ChartContainer — gives every chart a consistent
 *  header (icon + title + description + action slot) and theme-aware frame. */
export function ChartCard({
  title,
  description,
  icon: Icon,
  accent = "bg-primary/10 dark:bg-primary/15",
  action,
  className,
  config,
  height = 300,
  children,
}: ChartCardProps) {
  return (
    <Card className={cn("card-hover animate-fade-up", className)}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div className={cn("flex size-8 items-center justify-center rounded-lg", accent)}>
              <Icon className="h-4 w-4" />
            </div>
          )}
          <div className="space-y-0.5">
            <CardTitle className="text-base">{title}</CardTitle>
            {description && (
              <CardDescription className="text-xs">{description}</CardDescription>
            )}
          </div>
        </div>
        {action}
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="w-full" style={{ height }}>
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
