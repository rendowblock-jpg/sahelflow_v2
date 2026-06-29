"use client";

/**
 * RiskBadge — compact risk indicator for table rows.
 *
 * Shows a colored dot + the risk score (0-100). Smaller than the full
 * RiskLevelBadge — designed to fit in a narrow table column.
 *
 * Clicking it links to the order detail page (where the full assessment
 * breakdown is shown).
 */
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import type { RiskLevel } from "@/lib/risk-engine";

interface RiskBadgeProps {
  level: RiskLevel;
  score: number;
  href?: string;
}

const DOT_COLORS: Record<RiskLevel, string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
};

const TEXT_COLORS: Record<RiskLevel, string> = {
  low: "text-emerald-700 dark:text-emerald-400",
  medium: "text-amber-700 dark:text-amber-400",
  high: "text-orange-700 dark:text-orange-400",
  critical: "text-red-700 dark:text-red-400",
};

export function RiskBadge({ level, score, href }: RiskBadgeProps) {
  const { t } = useI18n();

  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border/60 px-1.5 py-0.5 text-xs font-medium",
        TEXT_COLORS[level],
        "bg-muted/30",
        href && "transition-colors hover:bg-muted/60",
      )}
      title={`${t(`risk.level.${level}`)} · ${score}/100`}
    >
      <span className={cn("size-1.5 rounded-full", DOT_COLORS[level])} />
      <span className="tabular-nums">{score}</span>
    </span>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}
