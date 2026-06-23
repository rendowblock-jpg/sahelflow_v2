"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAllowedTransitions } from "@/lib/order-transitions";
import type { OrderStatus } from "@/types/domain";
import {
  CheckCircle2,
  Truck,
  PackageCheck,
  RotateCcw,
  XCircle,
  Ban,
  Loader2,
} from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

// Action config holds the i18n key (resolved at render time via t()).
const ACTION_CONFIG: Record<
  OrderStatus,
  { labelKey: string; icon: typeof CheckCircle2; variant: "default" | "destructive" | "outline" }
> = {
  confirmed: { labelKey: "orders.confirmOrder", icon: CheckCircle2, variant: "default" },
  shipped: { labelKey: "orders.shipOrder", icon: Truck, variant: "default" },
  delivered: { labelKey: "orders.statusActions.markDelivered", icon: PackageCheck, variant: "default" },
  returned: { labelKey: "orders.statusActions.returnButton", icon: RotateCcw, variant: "destructive" },
  refused: { labelKey: "orders.status.refused", icon: XCircle, variant: "destructive" },
  cancelled: { labelKey: "common.cancel", icon: Ban, variant: "destructive" },
  draft: { labelKey: "", icon: CheckCircle2, variant: "outline" },
  pending: { labelKey: "", icon: CheckCircle2, variant: "outline" },
};

interface OrderStatusActionsProps {
  orderId: string;
  currentStatus: OrderStatus;
}

export function OrderStatusActions({ orderId, currentStatus }: OrderStatusActionsProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allowed = getAllowedTransitions(currentStatus);

  async function handleTransition(to: OrderStatus) {
    setLoading(to);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? t("orders.statusActions.updateFailed"));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.somethingWrong"));
    } finally {
      setLoading(null);
    }
  }

  if (allowed.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{t("orders.statusActions.finalStatus")}</Badge>
        <span>{t("orders.statusActions.noActions")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">{t("orders.statusActions.actionsLabel")}</span>
        {allowed.map((target) => {
          const config = ACTION_CONFIG[target];
          if (!config || !config.labelKey) return null;
          const Icon = config.icon;
          const isLoading = loading === target;
          return (
            <Button
              key={target}
              variant={config.variant}
              size="sm"
              onClick={() => handleTransition(target)}
              disabled={loading !== null}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Icon className="h-4 w-4 mr-1.5" />
              )}
              {t(config.labelKey)}
            </Button>
          );
        })}
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
