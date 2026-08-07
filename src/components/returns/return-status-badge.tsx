"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown, Loader2 } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import { mutatePrefix } from "@/lib/swr/mutate";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type ReturnStatus = "requested" | "approved" | "rejected" | "completed";

const STATUS_STYLES: Record<ReturnStatus, { i18nKey: string; dot: string; bg: string; text: string; border: string }> = {
  requested: { i18nKey: "returns.status.requested", dot: "bg-warning", bg: "bg-warning/10", text: "text-warning", border: "border-warning/25" },
  approved: { i18nKey: "returns.status.approved", dot: "bg-primary", bg: "bg-primary/10", text: "text-primary", border: "border-primary/25" },
  rejected: { i18nKey: "returns.status.rejected", dot: "bg-destructive", bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/25" },
  completed: { i18nKey: "returns.status.completed", dot: "bg-success", bg: "bg-success/10", text: "text-success", border: "border-success/25" },
};
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

/** Return status remains authoritative until the transition commits. */
export function ReturnStatusBadge({
  returnId,
  status,
  size = "default",
  disabled = false,
}: ReturnStatusBadgeProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const style = STATUS_STYLES[status];
  const allowed = ALLOWED_TRANSITIONS[status] ?? [];
  const hasTransitions = allowed.length > 0;

  async function handleChange(newStatus: ReturnStatus) {
    if (newStatus === status || disabled || isPending) return;
    startTransition(async () => {
      try {
        const response = await fetch(`/api/returns/${returnId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? t("returns.updateFailed"));
        }
        toast.success(t("returns.statusUpdated"));
        await mutatePrefix("/api/returns");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("returns.updateFailed"));
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || isPending || !hasTransitions}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            style.bg,
            style.text,
            style.border,
            size === "sm" && "px-1.5 py-0 text-xs",
            (disabled || isPending || !hasTransitions) && "cursor-not-allowed opacity-70",
            !disabled && !isPending && hasTransitions && "cursor-pointer hover:bg-muted/50",
          )}
        >
          {isPending ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden="true" />
          )}
          {t(style.i18nKey)}
          {hasTransitions && !disabled && !isPending ? <ChevronDown className="size-3 opacity-60" aria-hidden="true" /> : null}
        </button>
      </DropdownMenuTrigger>
      {hasTransitions && !disabled ? (
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{t("returns.changeStatus")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {allowed.map((candidate) => {
            const candidateStyle = STATUS_STYLES[candidate];
            return (
              <DropdownMenuItem
                key={candidate}
                onClick={() => handleChange(candidate)}
                className="gap-2"
              >
                <span className={cn("size-1.5 rounded-full", candidateStyle.dot)} aria-hidden="true" />
                <span className="flex-1">{t(candidateStyle.i18nKey)}</span>
                {candidate === status ? <Check className="size-3 opacity-60" aria-hidden="true" /> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  );
}
