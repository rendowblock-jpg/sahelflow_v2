"use client";

import { useState } from "react";
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
import { getAllowedTransitions } from "@/lib/order-transitions";
import { translateManualOrderError } from "@/lib/orders/manual-order-error";
import { orderStatusStyles } from "@/lib/shared";
import { mutatePrefix } from "@/lib/swr/mutate";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types/domain";

interface OrderStatusBadgeProps {
  orderId?: string | null;
  status: OrderStatus | null;
  orderVersion?: number;
  onStatusChange?: (newStatus: OrderStatus) => void | Promise<void>;
  allowAll?: boolean;
  size?: "default" | "sm";
  disabled?: boolean;
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
  const { t, locale } = useI18n();
  const [submitting, setSubmitting] = useState(false);

  const currentStatus = status;
  const style = currentStatus ? orderStatusStyles[currentStatus] : null;
  const allowedTransitions = allowAll
    ? ALL_STATUSES
    : currentStatus === "pending"
      ? [currentStatus]
      : currentStatus
        ? [...getAllowedTransitions(currentStatus), currentStatus]
        : ALL_STATUSES;

  async function handleChange(newStatus: OrderStatus) {
    if (submitting || newStatus === currentStatus) return;
    setSubmitting(true);

    try {
      if (orderId) {
        const response = await fetch(`/api/orders/${orderId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            translateManualOrderError(
              body.code,
              body.error?.message ?? body.error,
              locale,
              t("orders.statusActions.updateFailed"),
            ),
          );
        }
      }

      if (onStatusChange) await onStatusChange(newStatus);
      toast.success(t("orders.statusActions.updated"));
      router.refresh();
      void mutatePrefix("/api/orders");
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : t("orders.statusActions.updateFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!style && !currentStatus) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled || submitting}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-dashed px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors",
              size === "sm" && "text-xs px-1.5 py-0",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
            {t("orders.form.selectStatus")}
            {showChevron && <ChevronDown className="h-3 w-3" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>
            {t("orders.statusActions.selectStatus")}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {ALL_STATUSES.map((candidate) => {
            const candidateStyle = orderStatusStyles[candidate];
            return (
              <DropdownMenuItem
                key={candidate}
                onClick={() => void handleChange(candidate)}
                disabled={submitting}
                className="gap-2"
              >
                <span className={cn("size-1.5 rounded-full", candidateStyle.dot)} />
                {t(candidateStyle.i18nKey)}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const readOnly = disabled || submitting || allowedTransitions.length <= 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={readOnly}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
            !readOnly && "hover:bg-muted/50 cursor-pointer",
            style?.bg,
            style?.text,
            style?.border,
            size === "sm" && "text-xs px-1.5 py-0",
            readOnly && "cursor-default",
          )}
        >
          {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
          {!submitting && style && (
            <span className={cn("size-1.5 rounded-full", style.dot)} />
          )}
          {currentStatus && style && t(style.i18nKey)}
          {showChevron && !readOnly && (
            <ChevronDown className="h-3 w-3 opacity-60" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>
          {t("orders.statusActions.changeStatus")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {allowedTransitions.map((candidate) => {
          const candidateStyle = orderStatusStyles[candidate];
          const isCurrent = candidate === currentStatus;
          return (
            <DropdownMenuItem
              key={candidate}
              onClick={() => void handleChange(candidate)}
              disabled={isCurrent || submitting}
              className="gap-2"
            >
              <span className={cn("size-1.5 rounded-full", candidateStyle.dot)} />
              <span className="flex-1">{t(candidateStyle.i18nKey)}</span>
              {isCurrent && <Check className="h-3 w-3 opacity-60" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
