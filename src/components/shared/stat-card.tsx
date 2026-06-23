import * as React from "react";
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
 * Premium KPI stat card — accent icon chip, tabular value, trend arrow
 * with delta, and an optional inline sparkline for trend-at-a-glance.
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

  return (
    <Card className={cn("card-hover animate-fade-up overflow-hidden", className)} style={style}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <div className="text-2xl font-bold tabular-nums">{value}</div>
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
