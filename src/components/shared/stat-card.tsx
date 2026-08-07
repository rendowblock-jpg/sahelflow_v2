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
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  icon: React.ReactNode;
  /** @deprecated Phase 5 owns metric surface color semantically. */
  accentBg?: string;
  /** @deprecated Phase 5 owns metric icon color semantically. */
  accentIcon?: string;
  trend?: number;
  trendLabel?: React.ReactNode;
  subtitle?: React.ReactNode;
  spark?: Array<{ value: number }>;
  sparkColor?: string;
  className?: string;
  style?: React.CSSProperties;
  tooltip?: string;
  hint?: React.ReactNode;
}

/**
 * SahelFlow operational metric.
 *
 * Values render immediately and never count up: financial, stock and queue truth
 * must not look provisional while animation catches up. Page-local accent colors
 * are retained only as deprecated input compatibility and deliberately ignored.
 * Trend and spark context remain when they carry real data, but the surface stays
 * restrained and desktop-software-like.
 */
export function StatCard({
  label,
  value,
  icon,
  accentBg: _accentBg,
  accentIcon: _accentIcon,
  trend,
  trendLabel,
  subtitle,
  spark,
  sparkColor = "var(--color-chart-1)",
  className,
  style,
  tooltip,
  hint,
}: StatCardProps) {
  const hasTrend =
    typeof trend === "number" && Number.isFinite(trend) && trend !== 0;
  const positive = hasTrend && trend > 0;
  const negative = hasTrend && trend < 0;

  return (
    <section
      className={cn(
        "min-w-0 rounded-md border border-border/80 bg-background px-3 py-3",
        className,
      )}
      style={style}
      data-slot="operational-metric"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="min-w-0 truncate">{label}</span>
            {tooltip ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={tooltip}
                  >
                    <Info className="size-3.5" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {hint ? <InfoHint content={hint} size="sm" /> : null}
          </div>

          <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-foreground rtl:tracking-normal">
            {value}
          </div>

          {subtitle || trendLabel || hasTrend ? (
            <div className="mt-1.5 flex min-h-4 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              {hasTrend ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 font-medium tabular-nums",
                    positive && "text-success",
                    negative && "text-destructive",
                  )}
                >
                  {positive ? (
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  ) : (
                    <ArrowDownRight className="size-3" aria-hidden="true" />
                  )}
                  {trend > 0 ? "+" : ""}
                  {trend.toFixed(1)}%
                </span>
              ) : null}
              {trendLabel ? <span>{trendLabel}</span> : null}
              {subtitle ? <span>{subtitle}</span> : null}
            </div>
          ) : null}
        </div>

        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/35 text-muted-foreground [&_svg]:size-4">
          {icon}
        </div>
      </div>

      {spark && spark.length > 1 ? (
        <div className="mt-2 h-5 overflow-hidden opacity-75" aria-hidden="true">
          <Sparkline data={spark} color={sparkColor} height={20} />
        </div>
      ) : null}
    </section>
  );
}
