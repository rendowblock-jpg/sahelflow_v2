"use client";

/**
 * OrderStatusBadge — clickable status badge with inline status change dropdown.
 *
 * Used in:
 *   - Orders table (each row's status badge becomes editable)
 *   - Order detail page (status badge becomes editable)
 *   - Create order modal (initial status picker)
 *
 * Pattern: shadcn v4 Badge + DropdownMenu.
 * Status transitions are validated against getAllowedTransitions() — only
 * allowed transitions are shown in the dropdown. The current status is always
 * shown (disabled) for context.
 *
 * For the create order modal (no current status), set `currentStatus={null}`
 * and `allowAll={true}` — all statuses become selectable.
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
import { orderStatusStyles } from "@/lib/shared";
import { getAllowedTransitions } from "@/lib/order-transitions";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "sonner";
import type { OrderStatus } from "@/types/domain";

interface OrderStatusBadgeProps {
  /** Order ID (required for actual status changes). If null, no API call is made. */
  orderId?: string | null;
  /** Current status. If null, used as a picker (no current badge state). */
  status: OrderStatus | null;
  /** Called when user picks a new status. If orderId is set, the API call is made automatically. */
  onStatusChange?: (newStatus: OrderStatus) => void | Promise<void>;
  /** Allow all transitions (for create order modal — no state machine). */
  allowAll?: boolean;
  /** Size variant. */
  size?: "default" | "sm";
  /** Disable the badge (read-only mode). */
  disabled?: boolean;
  /** Show the chevron icon (default: true). */
  showChevron?: boolean;
}

const ALL_STATUSES: OrderStatus[] = [
  "draft",
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "returned",
  "refused",
  "cancelled",
];

export function OrderStatusBadge({
  orderId,
  status,
  onStatusChange,
  allowAll = false,
  size = "default",
  disabled = false,
  showChevron = true,
}: OrderStatusBadgeProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useState<OrderStatus | null>(status);

  const currentStatus = optimisticStatus ?? status;
  const style = currentStatus ? orderStatusStyles[currentStatus] : null;

  const allowedTransitions = allowAll
    ? ALL_STATUSES
    : currentStatus
      ? [...getAllowedTransitions(currentStatus), currentStatus]
      : ALL_STATUSES;

  async function handleChange(newStatus: OrderStatus) {
    if (newStatus === currentStatus) return;

    // Optimistic update
    setOptimisticStatus(newStatus);

    try {
      // If onStatusChange provided, call it
      if (onStatusChange) {
        await onStatusChange(newStatus);
      }

      // If orderId provided, make the API call
      if (orderId) {
        startTransition(async () => {
          const res = await fetch(`/api/orders/${orderId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error ?? t("orders.statusActions.updateFailed"));
          }
          toast.success(t("orders.statusActions.updated"));
          router.refresh();
        });
      }
    } catch (err) {
      // Revert on error
      setOptimisticStatus(currentStatus);
      toast.error(err instanceof Error ? err.message : t("orders.statusActions.updateFailed"));
    }
  }

  if (!style && !currentStatus) {
    // No status — render as a picker
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled || isPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-dashed px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors",
              size === "sm" && "text-[11px] px-1.5 py-0",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            {t("orders.form.selectStatus")}
            {showChevron && <ChevronDown className="h-3 w-3" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{t("orders.statusActions.selectStatus")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {ALL_STATUSES.map((s) => {
            const sStyle = orderStatusStyles[s];
            return (
              <DropdownMenuItem
                key={s}
                onClick={() => handleChange(s)}
                className="gap-2"
              >
                <span className={cn("size-1.5 rounded-full", sStyle.dot)} />
                {t(sStyle.i18nKey)}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || isPending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors hover:bg-muted/50",
            style?.bg,
            style?.text,
            style?.border,
            size === "sm" && "text-[11px] px-1.5 py-0",
            disabled && "opacity-50 cursor-not-allowed",
            !disabled && "cursor-pointer",
          )}
        >
          {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          {!isPending && style && <span className={cn("size-1.5 rounded-full", style.dot)} />}
          {currentStatus && style && t(style.i18nKey)}
          {showChevron && !disabled && <ChevronDown className="h-3 w-3 opacity-60" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{t("orders.statusActions.changeStatus")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {allowedTransitions.map((s) => {
          const sStyle = orderStatusStyles[s];
          const isCurrent = s === currentStatus;
          return (
            <DropdownMenuItem
              key={s}
              onClick={() => handleChange(s)}
              disabled={isCurrent && !allowAll}
              className="gap-2"
            >
              <span className={cn("size-1.5 rounded-full", sStyle.dot)} />
              <span className="flex-1">{t(sStyle.i18nKey)}</span>
              {isCurrent && <Check className="h-3 w-3 opacity-60" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
