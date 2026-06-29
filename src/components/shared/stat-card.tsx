"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/charts/sparkline";

interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  icon: React.ReactNode;
  accentBg?: string;
  accentIcon?: string;
  trend?: number;
  trendLabel?: React.ReactNode;
  subtitle?: React.ReactNode;
  spark?: Array<{ value: number }>;
  sparkColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Parse a string value into prefix + number + suffix for count-up animation.
 * Handles: "75", "75 DA", "75%", "1,234 DA", "12.5%", "DA 75", etc.
 * Returns null if the value isn't a parseable numeric string.
 */
function parseNumeric(value: React.ReactNode): { prefix: string; num: number; suffix: string } | null {
  if (typeof value !== "string") return null;
  // Match: optional non-digit prefix + digits/commas/dots + optional non-digit suffix
  const match = value.match(/^([^0-9-]*)([0-9][0-9,.]*)([^0-9]*)$/);
  if (!match) return null;
  const prefix = match[1] ?? "";
  const suffix = match[3] ?? "";
  const num = parseFloat(match[2]!.replace(/[,\s]/g, ""));
  if (isNaN(num)) return null;
  return { prefix, num, suffix };
}

/**
 * Premium KPI stat card — shadcn v4 pattern.
 * 
 * Features:
 * - Gradient tint background (from-primary/5 to-card)
 * - Container-query responsive number sizing
 * - Count-up animation with cubic ease-out
 * - Trend badge in CardAction slot
 * - Optional sparkline with gradient fill
 * - Subtle hover elevation
 */
export function StatCard({
  label,
  value,
  icon,
  accentBg = "bg-primary/10 dark:bg-primary/15",
  accentIcon = "text-primary",
  trend,
  trendLabel,
  subtitle,
  spark,
  sparkColor,
  className,
  style,
}: StatCardProps) {
  const isPositive = (trend ?? 0) > 0;
  const isNegative = (trend ?? 0) < 0;
  const showTrend = trend !== undefined && trend !== 0;

  // Memoize parsed so the animation effect only restarts when the VALUE changes,
  // not on every parent re-render (the old code recreated `parsed` every render).
  const parsed = useMemo(() => parseNumeric(value), [value]);
  const [displayValue, setDisplayValue] = useState(value);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!parsed || parsed.num === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayValue(value);
      return;
    }

    const duration = 800;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(eased * parsed.num);
      setDisplayValue(
        `${parsed.prefix}${current.toLocaleString("fr-FR")}${parsed.suffix}`,
      );
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick) ?? undefined;
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, parsed]);

  return (
    <Card
      className={cn(
        "@container/card overflow-hidden border shadow-xs transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:shadow-md hover:-translate-y-0.5",
        // Gradient tint — shadcn v4 pattern
        "bg-gradient-to-t from-primary/5 to-card dark:from-primary/10 dark:to-card",
        className,
      )}
      style={style}
    >
      <CardHeader className="relative">
        {/* Accent icon — top end */}
        <div className={cn(
          "absolute end-4 top-4 flex size-9 items-center justify-center rounded-xl",
          accentBg,
          accentIcon,
          "[&>svg]:h-4 [&>svg]:w-4",
        )}>
          {icon}
        </div>

        <CardDescription className="text-[13px] font-medium text-muted-foreground">
          {label}
        </CardDescription>

        <CardTitle className="text-2xl font-semibold tabular-nums tracking-tight @[250px]/card:text-3xl">
          {displayValue}
        </CardTitle>

      </CardHeader>

      {(spark || trendLabel || subtitle || showTrend) && (
        <CardFooter className="flex-col items-start gap-2 border-t bg-muted/20 px-6 py-3">
          {spark && spark.length > 1 && (
            <div className="w-full -mx-1">
              <Sparkline data={spark} color={sparkColor} height={32} />
            </div>
          )}
          <div className="flex w-full items-center justify-between gap-2 text-[13px]">
            {trendLabel && (
              <span className="line-clamp-1 font-medium text-foreground/80">{trendLabel}</span>
            )}
            {subtitle && (
              <span className="text-muted-foreground">{subtitle}</span>
            )}
            {showTrend && (
              <Badge
                variant="outline"
                className={cn(
                  "gap-0.5 rounded-full px-1.5 py-0 text-[11px] font-medium shrink-0",
                  isPositive
                    ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                    : "border-red-500/20 bg-red-500/5 text-red-600 dark:text-red-400",
                )}
              >
                {isPositive && <ArrowUpRight className="size-2.5" />}
                {isNegative && <ArrowDownRight className="size-2.5" />}
                {Math.abs(trend!)}%
              </Badge>
            )}
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
