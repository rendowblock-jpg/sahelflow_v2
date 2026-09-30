"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";

import Link from "next/link";

import { Sparkline, type SparklinePoint } from "@/components/charts/sparkline";
import { InfoHint } from "@/components/shared/info-hint";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/hooks/use-i18n";
import { cn, formatDZD, intlLocale } from "@/lib/utils";

export type StatCardEmphasis = "standard" | "primary" | "supporting";
export type StatCardTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger";

interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  icon: React.ReactNode;
  /** @deprecated Phase 5 owns metric surface color semantically. */
  accentBg?: string;
  /** @deprecated Phase 5 owns metric icon color semantically. */
  accentIcon?: string;
  trend?: number;
  /**
   * Explicit trend semantics. Legacy ±1 callers default to direction-only until
   * migrated; calculated trend callers should pass false so a real ±1% remains
   * visible rather than being mistaken for the legacy sentinel convention.
   */
  trendDirectionOnly?: boolean;
  trendLabel?: React.ReactNode;
  subtitle?: React.ReactNode;
  /**
   * Mini-trend points, oldest → latest. When every point carries its `date`,
   * the trend becomes explorable: hover or arrow keys read out that day and
   * the headline value follows it.
   */
  spark?: SparklinePoint[];
  /** How an explored spark value is written (the headline stays caller-owned). */
  sparkFormat?: "count" | "currency";
  sparkColor?: string;
  /**
   * Explicit period/context copy for the small operational trend. Sample count
   * is not time metadata, so callers that know the period must provide it.
   */
  sparkContext?: React.ReactNode;
  /** Opt in when zero is the honest floor for this metric's mini-trend. */
  sparkZeroBaseline?: boolean;
  className?: string;
  style?: React.CSSProperties;
  tooltip?: string;
  hint?: React.ReactNode;
  /** Metric hierarchy only; it never changes the underlying value authority. */
  emphasis?: StatCardEmphasis;
  /** Semantic presentation tone. Neutral remains the default. */
  tone?: StatCardTone;
  /**
   * Explicit executable control for an actionable metric. The card itself stays
   * a non-interactive section so tooltip/hint buttons never become nested inside
   * a link or button.
   */
  action?: React.ReactNode;
  /** Visual selected state for an action/filter that is selected by its caller. */
  selected?: boolean;
  /**
   * Destination behind the metric. The whole card becomes the link (a
   * stretched hit area under the card's own controls), with the same hover and
   * focus colour treatment as the Analytics KPIs.
   */
  href?: string;
  /** Accessible name for `href` (what opening the card shows). */
  hrefLabel?: string;
}

const toneClasses: Record<
  StatCardTone,
  { surface: string; icon: string }
> = {
  neutral: {
    surface: "",
    icon: "border-border/70 bg-muted/45 text-muted-foreground",
  },
  accent: {
    surface: "border-primary/20 bg-primary-subtle",
    icon: "border-primary/20 bg-primary-soft text-primary",
  },
  success: {
    surface: "border-success/20 bg-success-subtle",
    icon: "border-success/20 bg-success-soft text-success",
  },
  warning: {
    surface: "border-warning/25 bg-warning-subtle",
    icon: "border-warning/25 bg-warning-soft text-warning",
  },
  danger: {
    surface: "border-destructive/20 bg-destructive-subtle",
    icon: "border-destructive/20 bg-destructive-soft text-destructive",
  },
};

export function StatCard({
  label,
  value,
  icon,
  accentBg: _accentBg,
  accentIcon: _accentIcon,
  trend,
  trendDirectionOnly,
  trendLabel,
  subtitle,
  spark,
  sparkColor = "var(--color-chart-1)",
  sparkContext,
  sparkZeroBaseline = false,
  className,
  style,
  tooltip,
  hint,
  emphasis = "standard",
  tone = "neutral",
  action,
  selected = false,
  href,
  hrefLabel,
  sparkFormat = "count",
}: StatCardProps) {
  const { locale } = useI18n();
  const [activeSpark, setActiveSpark] = React.useState<number | null>(null);
  const sparkDated =
    Boolean(spark && spark.length > 1) &&
    (spark ?? []).every((point) => typeof point.date === "string");
  const dayFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale(locale), {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
    [locale],
  );
  const rangeFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short" }),
    [locale],
  );
  const formatDay = (value: string | undefined, formatter: Intl.DateTimeFormat) => {
    if (!value) return "";
    const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
    return Number.isNaN(date.getTime()) ? "" : formatter.format(date);
  };
  const formatSparkValue = (value: number) =>
    sparkFormat === "currency"
      ? formatDZD(value, locale)
      : new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value);
  const explored =
    sparkDated && activeSpark !== null ? spark?.[activeSpark] ?? null : null;
  const exploredDay = explored ? formatDay(explored.date, dayFormatter) : "";
  const hasTrend =
    typeof trend === "number" && Number.isFinite(trend) && trend !== 0;
  const positive = hasTrend && trend > 0;
  const negative = hasTrend && trend < 0;
  const directionOnly =
    trendDirectionOnly ?? (hasTrend && Math.abs(trend) === 1);
  const actionable = (action !== undefined && action !== null) || Boolean(href);
  const toneStyle = toneClasses[tone];
  const trendText =
    hasTrend && !directionOnly
      ? new Intl.NumberFormat(
          intlLocale(locale),
          {
            style: "percent",
            signDisplay: "exceptZero",
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          },
        ).format(trend / 100)
      : null;

  return (
    <section
      className={cn(
        "relative min-w-0 rounded-surface border border-border/80 bg-card",
        emphasis === "primary" ? "px-5 py-4" : "px-4 py-3.5",
        toneStyle.surface,
        actionable &&
          "group/stat transition-[background-color,border-color,box-shadow] duration-150 hover:border-primary/35 hover:bg-primary-subtle focus-within:border-primary/45 focus-within:ring-2 focus-within:ring-ring/25 motion-reduce:transition-none",
        selected &&
          "border-primary/45 bg-primary-subtle ring-1 ring-primary/15",
        className,
      )}
      style={style}
      data-slot="operational-metric"
      data-stat-emphasis={emphasis}
      data-stat-tone={tone}
      data-stat-interaction={actionable ? "actionable" : "passive"}
      data-selected={selected ? "true" : undefined}
    >
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-h-9 min-w-0 items-center gap-1.5 text-sm font-medium leading-5 text-muted-foreground">
            <span className="line-clamp-2 min-w-0 break-words">{label}</span>
            {tooltip ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="relative z-10 inline-flex size-6 shrink-0 items-center justify-center rounded-control text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={tooltip}
                  >
                    <Info className="size-3.5" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-sm">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {hint ? (
              <span className="relative z-10 inline-flex">
                <InfoHint content={hint} size="sm" />
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-2">
          {action ? (
            <div data-stat-action="true" className="relative z-10">
              {action}
            </div>
          ) : null}
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-surface border [&_svg]:size-[18px]",
              emphasis === "primary" ? "size-10" : "size-9",
              toneStyle.icon,
              actionable &&
                "transition-colors group-hover/stat:border-primary/30 group-hover/stat:bg-primary-soft group-hover/stat:text-primary",
            )}
          >
            {icon}
          </div>
        </div>
      </div>

      {/* The figure spans the full card width: it never shares a row
          with the action and icon, so amounts stay on one line. */}
      <div className="min-w-0">
        <div
          className={cn(
            "mt-1 whitespace-nowrap font-semibold tracking-tight tabular-nums text-foreground rtl:tracking-normal",
            emphasis === "primary"
              ? "text-[2rem] leading-10"
              : emphasis === "supporting"
                ? "text-2xl leading-8"
                : "text-[1.75rem] leading-9",
          )}
        >
          {explored ? formatSparkValue(explored.value) : value}
        </div>

        {explored ? (
          <div
            className="mt-1.5 flex min-h-5 items-center text-xs leading-5 text-muted-foreground"
            aria-live="polite"
            data-stat-explored-day="true"
          >
            {exploredDay}
          </div>
        ) : subtitle || trendLabel || hasTrend ? (
          <div className="mt-1.5 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-muted-foreground">
            {hasTrend ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-medium tabular-nums",
                  positive && "text-success",
                  negative && "text-destructive",
                )}
              >
                {positive ? (
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                ) : (
                  <ArrowDownRight className="size-3.5" aria-hidden="true" />
                )}
                {trendText}
              </span>
            ) : null}
            {trendLabel ? <span>{trendLabel}</span> : null}
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
        ) : null}
      </div>

      {spark && spark.length > 1 ? (
        <div className="relative z-10 mt-2.5" data-stat-sparkline="true">
          {sparkDated ? (
            <Sparkline
              data={spark}
              color={sparkColor}
              height={28}
              zeroBaseline={sparkZeroBaseline}
              interactive
              activeIndex={activeSpark}
              onActiveIndexChange={setActiveSpark}
              label={typeof label === "string" ? label : undefined}
              // The card itself is the visual read-out (headline value + day
              // line above), so no floating tooltip competes with it.
              valueText={
                explored ? `${exploredDay}: ${formatSparkValue(explored.value)}` : undefined
              }
            />
          ) : (
            <div className="h-7 overflow-hidden opacity-90" aria-hidden="true">
              <Sparkline
                data={spark}
                color={sparkColor}
                height={28}
                zeroBaseline={sparkZeroBaseline}
              />
            </div>
          )}
          {sparkContext ? (
            <div
              className="mt-1 flex items-center justify-between gap-2 text-caption leading-4 text-muted-foreground"
              data-stat-sparkline-context="true"
            >
              <span>{sparkContext}</span>
              {/* Oldest → latest, stated as the real dates rather than an
                  abstract dot-and-line glyph. */}
              <span
                className="inline-flex shrink-0 items-center gap-1 tabular-nums"
                dir="ltr"
                data-stat-sparkline-direction="oldest-to-latest"
              >
                {sparkDated ? (
                  <>
                    {formatDay(spark[0]?.date, rangeFormatter)}
                    <span aria-hidden="true">–</span>
                    {formatDay(spark.at(-1)?.date, rangeFormatter)}
                  </>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      {href ? (
        <>
          {/* The whole card is the link: a transparent layer over the card's
              text, beneath its own controls (tooltip, hint, trend, action),
              which sit on a raised layer so they stay independently usable. */}
          <Link
            href={href}
            aria-label={hrefLabel ?? (typeof label === "string" ? label : undefined)}
            data-stat-link="true"
            className="absolute inset-0 rounded-surface outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </>
      ) : null}
    </section>
  );
}
