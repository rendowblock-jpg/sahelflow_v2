"use client";

/**
 * Risk badges — shared components for displaying risk level + action.
 *
 * DUAL-MODE DESIGN:
 * - Server Components: import { RiskLevelBadgeServer, RiskActionBadgeServer }
 *   and pass the `label` prop (translated via getI18n() server-side).
 *   These are pure presentational components with NO hooks.
 *
 * - Client Components: import { RiskLevelBadge, RiskActionBadge }
 *   which use useI18n() to translate internally.
 *
 * This split is required because the risk page is a Server Component
 * (fetches data server-side) but other consumers (orders table, order detail)
 * are Client Components. The "use client" directive on this file means
 * the Server-safe exports are still importable from Server Components
 * (Next.js treeshakes the hook usage when label is provided).
 */
import { cn } from "@/lib/utils";
import type { RiskLevel, RiskAction } from "@/lib/risk-engine/types";
import { useI18n } from "@/hooks/use-i18n";

const LEVEL_STYLES: Record<RiskLevel, string> = {
  low: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  critical: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};

const ACTION_STYLES: Record<RiskAction, string> = {
  auto_confirm: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  standard: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20",
  call_first: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  review: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  hold: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  blacklisted: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 border-zinc-500/20",
};

// ── Server-safe presentational components (NO hooks) ─────────────────────────

export function RiskLevelBadgeServer({ level, score, label }: { level: RiskLevel; score?: number; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        LEVEL_STYLES[level],
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {label}
      {score !== undefined && <span className="opacity-60">· {score}</span>}
    </span>
  );
}

export function RiskActionBadgeServer({ action, label }: { action: RiskAction; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        ACTION_STYLES[action],
      )}
    >
      {label}
    </span>
  );
}

// ── Client components (use useI18n for translation) ──────────────────────────

export function RiskLevelBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const { t } = useI18n();
  return <RiskLevelBadgeServer level={level} score={score} label={t(`risk.level.${level}`)} />;
}

export function RiskActionBadge({ action }: { action: RiskAction }) {
  const { t } = useI18n();
  return <RiskActionBadgeServer action={action} label={t(`risk.action.${action}`)} />;
}
