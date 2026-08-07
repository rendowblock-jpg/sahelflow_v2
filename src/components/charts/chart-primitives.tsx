"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import {
  cn,
  formatDZD,
  formatDZDShort,
  type SupportedLocale,
} from "@/lib/utils";

export type ChartFormatter =
  | "currency"
  | "currencyShort"
  | "number"
  | "percent"
  | "identity";

export function resolveFormatter(
  formatter: ChartFormatter = "identity",
  locale: SupportedLocale = "fr",
): (value: number) => string {
  switch (formatter) {
    case "currency":
      return (value) => formatDZD(value, locale);
    case "currencyShort":
      return (value) => formatDZDShort(value, locale);
    case "number":
      return (value) =>
        new Intl.NumberFormat(
          locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-DZ",
          { maximumFractionDigits: 2 },
        ).format(value);
    case "percent":
      return (value) =>
        new Intl.NumberFormat(
          locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-DZ",
          { style: "percent", maximumFractionDigits: 0 },
        ).format(value / 100);
    default:
      return (value) => String(value);
  }
}

/** Compatibility registry for callers that have not yet passed route locale. */
export const chartFormatters: Record<ChartFormatter, (value: number) => string> = {
  currency: resolveFormatter("currency"),
  currencyShort: resolveFormatter("currencyShort"),
  number: resolveFormatter("number"),
  percent: resolveFormatter("percent"),
  identity: resolveFormatter("identity"),
};

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

export function buildChartConfig(
  series: Array<{ key: string; label: React.ReactNode }>,
  palette: readonly string[] = CHART_COLOR_ARRAY,
): ChartConfig {
  const config: ChartConfig = {};
  series.forEach((entry, index) => {
    config[entry.key] = {
      label: entry.label,
      color: palette[index % palette.length],
    };
  });
  return config;
}

interface ChartCardProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Human-readable summary exposed beside the graphic for assistive technology. */
  summary?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: string;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  config: ChartConfig;
  height?: number;
  children: React.ComponentProps<typeof ChartContainer>["children"];
}

/**
 * Governed SahelFlow analytical frame.
 *
 * The graphic is supplemental to a named analytical region. Callers may provide
 * a concise text summary of the insight/data so chart interpretation never
 * depends on color or pointer hover alone. Elevation and decorative hover motion
 * are intentionally absent inside the desktop workbench.
 */
export function ChartCard({
  title,
  description,
  summary,
  action,
  footer,
  className,
  config,
  height = 280,
  children,
}: ChartCardProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();

  return (
    <Card className={cn("border shadow-none", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 space-y-0.5">
          <CardTitle id={titleId} className="text-sm font-semibold">
            {title}
          </CardTitle>
          {description ? (
            <CardDescription id={descriptionId} className="text-xs">
              {description}
            </CardDescription>
          ) : null}
        </div>
        {action}
      </CardHeader>
      <CardContent className="pt-1">
        <div
          role="group"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
        >
          {summary ? <div className="sr-only">{summary}</div> : null}
          <ChartContainer
            config={config}
            className="aspect-auto w-full"
            style={{ height }}
          >
            {children}
          </ChartContainer>
        </div>
        {footer ? (
          <div className="mt-2 border-t border-border/70 pt-2 text-xs text-muted-foreground">
            {footer}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ChartEmpty({
  message,
  height = 280,
}: {
  message: string;
  height?: number;
}) {
  return (
    <div
      className="flex w-full items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/20 px-4 text-center text-sm text-muted-foreground"
      style={{ height }}
      role="status"
    >
      {message}
    </div>
  );
}

export function useGradientId(prefix: string) {
  const id = React.useId().replace(/:/g, "");
  return `${prefix}-${id}`;
}
