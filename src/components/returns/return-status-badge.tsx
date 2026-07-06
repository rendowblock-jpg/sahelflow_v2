"use client";

/**
 * ReturnStatusBadge — clickable status badge with inline status change dropdown.
 *
 * Pattern: same as OrderStatusBadge — dropdown of allowed transitions,
 * optimistic update + toast + API call to PATCH /api/returns/[id].
 *
 * Return status flow: requested → approved → completed
 *                     requested → rejected
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";
import { mutatePrefix } from "@/lib/swr/mutate";

type ReturnStatus = "requested" | "approved" | "rejected" | "completed";

const STATUS_STYLES: Record<ReturnStatus, { i18nKey: string; dot: string; bg: string; text: string; border: string }> = {
  requested: { i18nKey: "returns.status.requested", dot: "bg-warning", bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-warning dark:text-amber-400", border: "border-amber-200 dark:border-amber-800/50" },
  approved: { i18nKey: "returns.status.approved", dot: "bg-teal-500", bg: "bg-teal-50 dark:bg-teal-950/40", text: "text-teal-700 dark:text-teal-400", border: "border-teal-200 dark:border-teal-800/50" },
  rejected: { i18nKey: "returns.status.rejected", dot: "bg-destructive", bg: "bg-red-50 dark:bg-red-950/40", text: "text-destructive dark:text-red-400", border: "border-red-200 dark:border-red-800/50" },
  completed: { i18nKey: "returns.status.completed", dot: "bg-success", bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-success dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800/50" },
};

// Allowed transitions for returns
const ALLOWED_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["completed", "rejected"],
  rejected: [],
  completed: [],
};

interface ReturnStatusBadgeProps {
  returnId: string;
  status: ReturnStatus;
  size?: "default" | "sm";
  disabled?: boolean;
}

export function ReturnStatusBadge({
  returnId,
  status,
  size = "default",
  disabled = false,
}: ReturnStatusBadgeProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useState<ReturnStatus>(status);

  const currentStatus = optimisticStatus;
  const style = STATUS_STYLES[currentStatus];
  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];

  async function handleChange(newStatus: ReturnStatus) {
    if (newStatus === currentStatus) return;

    setOptimisticStatus(newStatus);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/returns/${returnId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? t("returns.updateFailed"));
        }
        toast.success(t("returns.statusUpdated"));
        router.refresh();
        // Invalidate SWR cache for /api/returns* keys so the ReturnsDataTable
        // reflects the new status without waiting for the dedup window.
        void mutatePrefix("/api/returns");
      } catch (err) {
        setOptimisticStatus(currentStatus);
        toast.error(err instanceof Error ? err.message : t("returns.updateFailed"));
      }
    });
  }

  const hasTransitions = allowed.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || isPending || !hasTransitions}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
            style.bg,
            style.text,
            style.border,
            size === "sm" && "text-xs px-1.5 py-0",
            (disabled || isPending || !hasTransitions) && "opacity-70 cursor-not-allowed",
            !disabled && hasTransitions && "hover:bg-muted/50 cursor-pointer",
          )}
        >
          {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          {!isPending && <span className={cn("size-1.5 rounded-full", style.dot)} />}
          {t(style.i18nKey)}
          {hasTransitions && !disabled && <ChevronDown className="h-3 w-3 opacity-60" />}
        </button>
      </DropdownMenuTrigger>
      {hasTransitions && (
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{t("returns.changeStatus")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {allowed.map((s) => {
            const sStyle = STATUS_STYLES[s];
            return (
              <DropdownMenuItem
                key={s}
                onClick={() => handleChange(s)}
                className="gap-2"
              >
                <span className={cn("size-1.5 rounded-full", sStyle.dot)} />
                <span className="flex-1">{t(sStyle.i18nKey)}</span>
                {s === currentStatus && <Check className="h-3 w-3 opacity-60" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
