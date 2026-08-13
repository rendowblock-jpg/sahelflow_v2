"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";

import { Sparkline } from "@/components/charts/sparkline";
import { InfoHint } from "@/components/shared/info-hint";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

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
  spark?: Array<{ value: number }>;
  sparkColor?: string;
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
    surface: "border-primary/20 bg-primary/[0.025]",
    icon: "border-primary/20 bg-primary/10 text-primary",
  },
  success: {
    surface: "border-success/20 bg-success/[0.025]",
    icon: "border-success/20 bg-success/10 text-success",
  },
  warning: {
    surface: "border-warning/25 bg-warning/[0.035]",
    icon: "border-warning/25 bg-warning/10 text-warning",
  },
  danger: {
    surface: "border-destructive/20 bg-destructive/[0.025]",
    icon: "border-destructive/20 bg-destructive/10 text-destructive",
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
  className,
  style,
  tooltip,
  hint,
  emphasis = "standard",
  tone = "neutral",
  action,
  selected = false,
}: StatCardProps) {
  const { locale } = useI18n();
  const hasTrend =
    typeof trend === "number" && Number.isFinite(trend) && trend !== 0;
  const positive = hasTrend && trend > 0;
  const negative = hasTrend && trend < 0;
  const directionOnly =
    trendDirectionOnly ?? (hasTrend && Math.abs(trend) === 1);
  const actionable = action !== undefined && action !== null;
  const toneStyle = toneClasses[tone];
  const trendText =
    hasTrend && !directionOnly
      ? new Intl.NumberFormat(
          locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-DZ",
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
        "min-w-0 rounded-lg border border-border/80 bg-card",
        emphasis === "primary" ? "px-5 py-4" : "px-4 py-3.5",
        toneStyle.surface,
        actionable &&
          "transition-[background-color,border-color,box-shadow] duration-150 hover:border-primary/35 hover:bg-primary/[0.02] focus-within:border-primary/45 focus-within:ring-2 focus-within:ring-ring/25 motion-reduce:transition-none",
        selected &&
          "border-primary/45 bg-primary/[0.045] ring-1 ring-primary/15",
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
          <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium leading-5 text-muted-foreground">
            <span className="min-w-0 truncate">{label}</span>
            {tooltip ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
            {hint ? <InfoHint content={hint} size="sm" /> : null}
          </div>

          <div
            className={cn(
              "mt-1.5 font-semibold tracking-tight tabular-nums text-foreground rtl:tracking-normal",
              emphasis === "primary"
                ? "text-[2rem] leading-10"
                : emphasis === "supporting"
                  ? "text-2xl leading-8"
                  : "text-[1.75rem] leading-9",
            )}
          >
            {value}
          </div>

          {subtitle || trendLabel || hasTrend ? (
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

        <div className="flex shrink-0 items-start gap-2">
          {actionable ? <div data-stat-action="true">{action}</div> : null}
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-lg border [&_svg]:size-[18px]",
              emphasis === "primary" ? "size-10" : "size-9",
              toneStyle.icon,
            )}
          >
            {icon}
          </div>
        </div>
      </div>

      {spark && spark.length > 1 ? (
        <div className="mt-2.5 h-6 overflow-hidden opacity-80" aria-hidden="true">
          <Sparkline data={spark} color={sparkColor} height={24} />
        </div>
      ) : null}
    </section>
  );
}
