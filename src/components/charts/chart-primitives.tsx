"use client";

import * as React from "react";
import { renderBidiText } from "@/components/shared/bidi-text";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
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

export type ChartHeight = React.CSSProperties["height"];
export const DEFAULT_CHART_HEIGHT: ChartHeight =
  "var(--sf-chart-card-height, var(--sf-chart-height, clamp(14rem, 25vw, 18rem)))";
export const DEFAULT_CHART_EMPTY_HEIGHT: ChartHeight =
  "var(--sf-chart-empty-height, clamp(12rem, 22vw, 17.5rem))";

/**
 * Wave 2 compatibility bridge for legacy analytical callers that still pass
 * 300/320px numeric canvases. Large numeric heights converge to the governed
 * fluid desktop range; deliberately compact visuals (for example 220px gauges)
 * and explicit CSS lengths remain exact.
 */
export function normalizeChartHeight(
  height: ChartHeight = DEFAULT_CHART_HEIGHT,
): ChartHeight {
  return typeof height === "number" && height >= 260
    ? DEFAULT_CHART_HEIGHT
    : height;
}

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
  /** Concise decision context or key comparison shown above the plot. */
  summary?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: string;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Retained as the analytical-series contract; the child owns ChartContainer. */
  config: ChartConfig;
  height?: ChartHeight;
  children: React.ReactNode;
}

/**
 * Governed SahelFlow analytical frame.
 *
 * A chart is not a decorative rectangle: it carries a readable title, optional
 * business context, visible summary, plot, and optional footer/action. ChartCard
 * intentionally does not create a ChartContainer/ResponsiveContainer: every
 * chart primitive owns exactly one responsive plot authority. This avoids nested
 * measurement canvases and keeps tooltips, legends and accessibility bound to the
 * chart that actually renders them.
 */
export function ChartCard({
  title,
  description,
  summary,
  icon,
  accent,
  action,
  footer,
  className,
  config,
  height = DEFAULT_CHART_HEIGHT,
  children,
}: ChartCardProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const summaryId = React.useId();
  const accessibleSummary = summary ?? description ?? title;
  const normalizedHeight = normalizeChartHeight(height);
  const plotStyle =
    normalizedHeight === DEFAULT_CHART_HEIGHT
      ? undefined
      : ({
          "--sf-chart-card-height":
            typeof normalizedHeight === "number"
              ? `${normalizedHeight}px`
              : normalizedHeight,
        } as React.CSSProperties);

  return (
    <Card
      className={cn("overflow-hidden border shadow-none", className)}
      data-chart-card="true"
      data-chart-series-count={Object.keys(config).length}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 px-5 pb-3 pt-4">
        <div className="min-w-0 space-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon ? (
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/45 text-muted-foreground",
                  accent,
                )}
              >
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              <CardTitle id={titleId} className="text-base font-semibold leading-6">
                {title}
              </CardTitle>
              {description ? (
                <CardDescription id={descriptionId} className="mt-0.5 text-sm leading-5">
                  {renderBidiText(description)}
                </CardDescription>
              ) : null}
            </div>
          </div>
          {summary ? (
            <div
              className="text-sm leading-5 text-muted-foreground"
              aria-hidden="true"
            >
              {renderBidiText(summary)}
            </div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div
          role="group"
          aria-labelledby={titleId}
          aria-describedby={summaryId}
          data-chart-plot="true"
          className="min-w-0"
          style={plotStyle}
        >
          <div id={summaryId} className="sr-only">
            {accessibleSummary}
          </div>
          {children}
        </div>
        {footer ? (
          <div className="mt-3 border-t border-border/70 pt-3 text-sm leading-5 text-muted-foreground">
            {renderBidiText(footer)}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ChartEmpty({
  message,
  height = DEFAULT_CHART_EMPTY_HEIGHT,
}: {
  message: string;
  height?: ChartHeight;
}) {
  return (
    <div
      className="flex w-full items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/20 px-4 text-center text-sm text-muted-foreground"
      style={{ height: normalizeChartHeight(height) }}
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
