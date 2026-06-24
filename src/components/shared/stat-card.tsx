"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
  spark?: Array<{ value: number }>;
  sparkColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Parse a value string into {prefix, num, suffix} for count-up animation.
 * E.g. "45 100 DA" → {prefix: "", num: 45100, suffix: " DA"}
 */
function parseNumeric(value: React.ReactNode): { prefix: string; num: number; suffix: string } | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^([^0-9]*)([0-9,.]+)([^0-9]*)$/);
  if (!match) return null;
  if (!match[1] || !match[3]) return null;
  const num = parseFloat(match[2]!.replace(/[,\s]/g, ""));
  return { prefix: match[1]!, num: isNaN(num) ? 0 : num, suffix: match[3]! };
}

/**
 * Premium KPI stat card with count-up animation (inspired by v2's
 * AnimatedStatCard). Accent icon chip, animated tabular value, trend
 * arrow with delta, optional inline sparkline.
 */
export function StatCard({
  label,
  value,
  icon,
  accentBg = "bg-primary/10 dark:bg-primary/15",
  accentIcon = "text-primary",
  trend,
  trendLabel,
  spark,
  sparkColor,
  className,
  style,
}: StatCardProps) {
  const isPositive = (trend ?? 0) > 0;
  const isNegative = (trend ?? 0) < 0;
  const showTrend = trend !== undefined && trend !== 0;

  // Count-up animation for numeric string values
  const parsed = parseNumeric(value);
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
      const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Card className={cn("card-hover animate-fade-up overflow-hidden", className)} style={style}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <div className="text-2xl font-bold tabular-nums">{displayValue}</div>
            {showTrend && (
              <div className="flex items-center gap-1 text-xs">
                {isPositive && <ArrowUpRight className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />}
                {isNegative && <ArrowDownRight className="h-3 w-3 text-red-600 dark:text-red-400" />}
                <span className={isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                  {Math.abs(trend!)}%
                </span>
                {trendLabel && <span className="text-muted-foreground">{trendLabel}</span>}
              </div>
            )}
          </div>
          <div className={cn("flex size-9 items-center justify-center rounded-lg", accentBg, accentIcon, "[&>svg]:h-4 [&>svg]:w-4")}>
            {icon}
          </div>
        </div>
        {spark && spark.length > 1 && (
          <div className="mt-3 -mx-1">
            <Sparkline data={spark} color={sparkColor} height={36} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
