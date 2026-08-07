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

const STATUS_STYLES: Record<string, { i18nKey: string; dot: string; bg: string; text: string; border: string }> = {
  pending: { i18nKey: "deliveries.status.pending", dot: "bg-warning", bg: "bg-warning/10", text: "text-warning", border: "border-warning/25" },
  created: { i18nKey: "deliveries.status.created", dot: "bg-primary", bg: "bg-primary/10", text: "text-primary", border: "border-primary/25" },
  picked_up: { i18nKey: "deliveries.status.pickedUp", dot: "bg-primary", bg: "bg-primary/10", text: "text-primary", border: "border-primary/25" },
  in_transit: { i18nKey: "deliveries.status.inTransit", dot: "bg-primary", bg: "bg-primary/10", text: "text-primary", border: "border-primary/25" },
  at_hub: { i18nKey: "deliveries.status.atHub", dot: "bg-primary", bg: "bg-primary/10", text: "text-primary", border: "border-primary/25" },
  out_for_delivery: { i18nKey: "deliveries.status.outForDelivery", dot: "bg-primary", bg: "bg-primary/10", text: "text-primary", border: "border-primary/25" },
  delivered: { i18nKey: "deliveries.status.delivered", dot: "bg-success", bg: "bg-success/10", text: "text-success", border: "border-success/25" },
  returned: { i18nKey: "deliveries.status.returned", dot: "bg-destructive", bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/25" },
  refused: { i18nKey: "deliveries.status.refused", dot: "bg-destructive", bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/25" },
  failed: { i18nKey: "deliveries.status.failed", dot: "bg-destructive", bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/25" },
};

const ALL_STATUSES = Object.keys(STATUS_STYLES);

interface DeliveryStatusBadgeProps {
  deliveryId: string;
  status: string;
  size?: "default" | "sm";
  disabled?: boolean;
}

/**
 * Delivery status command surface.
 *
 * The badge never paints a target business status before the server commits it.
 * While a command is pending the current authoritative status remains visible
 * with a progress indicator; success revalidates the workbench and RSC state.
 */
export function DeliveryStatusBadge({
  deliveryId,
  status,
  size = "default",
  disabled = false,
}: DeliveryStatusBadgeProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending!;

  async function handleChange(newStatus: string) {
    if (newStatus === status || disabled || isPending) return;

    startTransition(async () => {
      try {
        const response = await fetch(`/api/delivery/${deliveryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? t("deliveries.updateFailed"));
        }
        toast.success(t("deliveries.statusUpdated"));
        await mutatePrefix("/api/delivery");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("deliveries.updateFailed"));
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
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            style.bg,
            style.text,
            style.border,
            size === "sm" && "px-1.5 py-0 text-xs",
            (disabled || isPending) && "cursor-not-allowed opacity-70",
            !disabled && !isPending && "cursor-pointer hover:bg-muted/50",
          )}
        >
          {isPending ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden="true" />
          )}
          {t(style.i18nKey)}
          {!disabled && !isPending ? <ChevronDown className="size-3 opacity-60" aria-hidden="true" /> : null}
        </button>
      </DropdownMenuTrigger>
      {!disabled ? (
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{t("deliveries.changeStatus")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {ALL_STATUSES.map((candidate) => {
            const candidateStyle = STATUS_STYLES[candidate]!;
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
