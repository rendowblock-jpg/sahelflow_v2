"use client";

/**
 * DeliveryStatusBadge — clickable status badge with inline status change dropdown.
 *
 * Unlike orders (state machine), delivery statuses can be set manually for
 * offline providers or corrected after a sync. All statuses are selectable.
 *
 * Calls PATCH /api/delivery/[id] to update the status.
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
import { toast } from "sonner";

const STATUS_STYLES: Record<string, { i18nKey: string; dot: string; bg: string; text: string; border: string }> = {
  pending: { i18nKey: "deliveries.status.pending", dot: "bg-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800/50" },
  created: { i18nKey: "deliveries.status.created", dot: "bg-sky-500", bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-700 dark:text-sky-400", border: "border-sky-200 dark:border-sky-800/50" },
  picked_up: { i18nKey: "deliveries.status.pickedUp", dot: "bg-sky-500", bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-700 dark:text-sky-400", border: "border-sky-200 dark:border-sky-800/50" },
  in_transit: { i18nKey: "deliveries.status.inTransit", dot: "bg-violet-500", bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-700 dark:text-violet-400", border: "border-violet-200 dark:border-violet-800/50" },
  at_hub: { i18nKey: "deliveries.status.atHub", dot: "bg-violet-500", bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-700 dark:text-violet-400", border: "border-violet-200 dark:border-violet-800/50" },
  out_for_delivery: { i18nKey: "deliveries.status.outForDelivery", dot: "bg-sky-500", bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-700 dark:text-sky-400", border: "border-sky-200 dark:border-sky-800/50" },
  delivered: { i18nKey: "deliveries.status.delivered", dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800/50" },
  returned: { i18nKey: "deliveries.status.returned", dot: "bg-red-500", bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-400", border: "border-red-200 dark:border-red-800/50" },
  refused: { i18nKey: "deliveries.status.refused", dot: "bg-rose-500", bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-400", border: "border-rose-200 dark:border-rose-800/50" },
  failed: { i18nKey: "deliveries.status.failed", dot: "bg-red-500", bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-400", border: "border-red-200 dark:border-red-800/50" },
};

const ALL_STATUSES = Object.keys(STATUS_STYLES);

interface DeliveryStatusBadgeProps {
  deliveryId: string;
  status: string;
  size?: "default" | "sm";
  disabled?: boolean;
}

export function DeliveryStatusBadge({
  deliveryId,
  status,
  size = "default",
  disabled = false,
}: DeliveryStatusBadgeProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useState(status);

  const currentStatus = optimisticStatus;
  const style = STATUS_STYLES[currentStatus] ?? STATUS_STYLES["pending"]!;

  async function handleChange(newStatus: string) {
    if (newStatus === currentStatus) return;
    setOptimisticStatus(newStatus);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/delivery/${deliveryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? t("deliveries.updateFailed"));
        }
        toast.success(t("deliveries.statusUpdated"));
        router.refresh();
      } catch (err) {
        setOptimisticStatus(currentStatus);
        toast.error(err instanceof Error ? err.message : t("deliveries.updateFailed"));
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || isPending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
            style.bg,
            style.text,
            style.border,
            size === "sm" && "text-[11px] px-1.5 py-0",
            (disabled || isPending) && "opacity-70 cursor-not-allowed",
            !disabled && "hover:bg-muted/50 cursor-pointer",
          )}
        >
          {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          {!isPending && <span className={cn("size-1.5 rounded-full", style.dot)} />}
          {t(style.i18nKey)}
          {!disabled && <ChevronDown className="h-3 w-3 opacity-60" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{t("deliveries.changeStatus")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ALL_STATUSES.map((s) => {
          const sStyle = STATUS_STYLES[s]!;
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
    </DropdownMenu>
  );
}
