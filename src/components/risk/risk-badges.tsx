/**
 * Risk badges — shared components for displaying risk level + action.
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
  standard: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
  call_first: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  review: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  hold: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  blacklisted: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 border-zinc-500/20",
};

export function RiskLevelBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        LEVEL_STYLES[level],
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {t(`risk.level.${level}`)}
      {score !== undefined && <span className="opacity-60">· {score}</span>}
    </span>
  );
}

export function RiskActionBadge({ action }: { action: RiskAction }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        ACTION_STYLES[action],
      )}
    >
      {t(`risk.action.${action}`)}
    </span>
  );
}
