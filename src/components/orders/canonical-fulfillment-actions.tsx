"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, PackageCheck, Truck } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CanonicalCodActions } from "@/components/orders/canonical-cod-actions";
import { CanonicalCourierActions } from "@/components/orders/canonical-courier-actions";
import { CanonicalCustomerReturnActions } from "@/components/orders/canonical-customer-return-actions";
import { CanonicalOrderRecoveryActions } from "@/components/orders/canonical-order-recovery-actions";
import { useI18n } from "@/hooks/use-i18n";
import type {
  CanonicalDeliveryState,
  CodFinancialState,
  FulfillmentState,
  OrderInventoryState,
} from "@/lib/business-truth/contracts";
import { mutatePrefix } from "@/lib/swr/mutate";
import type { OrderStatus } from "@/types/domain";

type FulfillmentAction = "pack" | "ship" | "deliver";

const ACTION_KEYS: Record<
  FulfillmentAction,
  { label: string; title: string; body: string }
> = {
  pack: {
    label: "orders.workspace.fulfillment.action.pack",
    title: "orders.workspace.fulfillment.confirm.pack.title",
    body: "orders.workspace.fulfillment.confirm.pack.body",
  },
  ship: {
    label: "orders.workspace.fulfillment.action.ship",
    title: "orders.workspace.fulfillment.confirm.ship.title",
    body: "orders.workspace.fulfillment.confirm.ship.body",
  },
  deliver: {
    label: "orders.workspace.fulfillment.action.deliver",
    title: "orders.workspace.fulfillment.confirm.deliver.title",
    body: "orders.workspace.fulfillment.confirm.deliver.body",
  },
};

const STATE_LABEL_KEYS: Readonly<Record<string, string>> = {
  unfulfilled: "orders.workspace.fulfillment.state.unfulfilled",
  ready: "orders.workspace.fulfillment.state.ready",
  shipped: "orders.workspace.fulfillment.state.shipped",
  closed: "orders.workspace.fulfillment.state.closed",
  not_created: "orders.workspace.fulfillment.state.not_created",
  pending: "orders.workspace.fulfillment.state.pending",
  picked_up: "orders.workspace.fulfillment.state.picked_up",
  in_transit: "orders.workspace.fulfillment.state.in_transit",
  out_for_delivery: "orders.workspace.fulfillment.state.out_for_delivery",
  delivered: "orders.workspace.fulfillment.state.delivered",
  failed: "orders.workspace.fulfillment.state.failed",
  refused: "orders.workspace.fulfillment.state.refused",
  return_in_transit: "orders.workspace.fulfillment.state.return_in_transit",
  returned: "orders.workspace.fulfillment.state.returned",
  unreserved: "orders.workspace.fulfillment.state.unreserved",
  reserved: "orders.workspace.fulfillment.state.reserved",
  outbound: "orders.workspace.fulfillment.state.outbound",
  return_pending_receipt:
    "orders.workspace.fulfillment.state.return_pending_receipt",
  return_pending_inspection:
    "orders.workspace.fulfillment.state.return_pending_inspection",
  settled: "orders.workspace.fulfillment.state.settled",
  not_expected: "orders.workspace.fulfillment.state.not_expected",
  receivable: "orders.workspace.fulfillment.state.receivable",
  collected: "orders.workspace.fulfillment.state.collected",
  partially_remitted: "orders.workspace.fulfillment.state.partially_remitted",
  remitted: "orders.workspace.fulfillment.state.remitted",
  disputed: "orders.workspace.fulfillment.state.disputed",
  corrected: "orders.workspace.fulfillment.state.corrected",
};

interface CanonicalFulfillmentActionsProps {
  orderId: string;
  currentStatus: OrderStatus;
  currentVersion: number;
  fulfillmentState: FulfillmentState | null;
  deliveryState: CanonicalDeliveryState | null;
  inventoryState: OrderInventoryState | null;
  codState: CodFinancialState | null;
}

function availableAction(
  status: OrderStatus,
  fulfillment: FulfillmentState | null,
  delivery: CanonicalDeliveryState | null,
): FulfillmentAction | null {
  if (
    status === "confirmed" &&
    (fulfillment === null || fulfillment === "unfulfilled")
  ) {
    return "pack";
  }
  if (
    status === "confirmed" &&
    fulfillment === "ready" &&
    delivery === "not_created"
  ) {
    return "ship";
  }
  if (
    status === "shipped" &&
    fulfillment === "shipped" &&
    delivery === "in_transit"
  ) {
    return "deliver";
  }
  return null;
}

export function CanonicalFulfillmentActions({
  orderId,
  currentStatus,
  currentVersion,
  fulfillmentState,
  deliveryState,
  inventoryState,
  codState,
}: CanonicalFulfillmentActionsProps) {
  const router = useRouter();
  const { t } = useI18n();
  const action = availableAction(
    currentStatus,
    fulfillmentState,
    deliveryState,
  );
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function storageKey(selected: FulfillmentAction): string {
    return `sf-order-fulfillment:${orderId}:${currentVersion}:${selected}`;
  }

  function commandKey(selected: FulfillmentAction): string {
    const key = storageKey(selected);
    const prior = window.localStorage.getItem(key);
    if (prior && prior.length >= 8) return prior;
    const created = crypto.randomUUID();
    window.localStorage.setItem(key, created);
    return created;
  }

  function stateLabel(value: string | null): string {
    if (!value) return t("orders.workspace.fulfillment.legacy");
    const key = STATE_LABEL_KEYS[value];
    return key ? t(key) : value;
  }

  async function commit(): Promise<void> {
    if (!action) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    const idempotencyKey = commandKey(action);
    try {
      const response = await fetch(`/api/orders/${orderId}/fulfillment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          expectedVersion: currentVersion,
          idempotencyKey,
          correlationId: `manual-fulfillment-ui:${idempotencyKey}`,
        }),
      });
      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        const messageKey =
          responseBody.code === "CONFLICT"
            ? "orders.workspace.fulfillment.error.conflict"
            : responseBody.code === "VALIDATION_ERROR"
              ? "orders.workspace.fulfillment.error.invalid"
              : responseBody.code === "NOT_FOUND"
                ? "orders.workspace.fulfillment.error.notFound"
                : "orders.workspace.fulfillment.error.failed";
        throw new Error(t(messageKey));
      }
      window.localStorage.removeItem(storageKey(action));
      setNotice(
        t(
          responseBody.command?.replayed
            ? "orders.workspace.fulfillment.replayed"
            : "orders.workspace.fulfillment.committed",
        ),
      );
      setConfirming(false);
      await mutatePrefix("/api/orders");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("orders.workspace.fulfillment.error.failed"),
      );
    } finally {
      setLoading(false);
    }
  }

  const Icon =
    action === "ship"
      ? Truck
      : action === "deliver"
        ? CheckCircle2
        : PackageCheck;
  const actionKeys = action ? ACTION_KEYS[action] : null;
  const title = actionKeys ? t(actionKeys.title) : "";
  const description = actionKeys ? t(actionKeys.body) : "";
  const showCodAuthority =
    currentStatus === "delivered" &&
    deliveryState === "delivered" &&
    codState !== null &&
    codState !== "not_expected";

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">
              {t("orders.workspace.fulfillment.heading")}
            </p>
            <Badge variant="outline" className="mt-1">
              {t("orders.workspace.fulfillment.authority")}
            </Badge>
          </div>
          {action && actionKeys ? (
            <Button
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={loading}
            >
              <Icon className="me-1.5 h-4 w-4" />
              {t(actionKeys.label)}
            </Button>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          {[
            [
              t("orders.workspace.fulfillment.axis.fulfillment"),
              fulfillmentState,
            ],
            [t("orders.workspace.fulfillment.axis.delivery"), deliveryState],
            [t("orders.workspace.fulfillment.axis.inventory"), inventoryState],
            [t("orders.workspace.fulfillment.axis.cod"), codState],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="truncate font-medium" dir="auto">
                {stateLabel(value ?? null)}
              </dd>
            </div>
          ))}
        </dl>

        {!action && !showCodAuthority ? (
          <p className="text-sm text-muted-foreground">
            {t("orders.workspace.fulfillment.noAction")}
          </p>
        ) : null}
        {notice ? (
          <p className="text-sm text-success" role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <CanonicalCourierActions orderId={orderId} />

      {showCodAuthority ? (
        <div className="border-t pt-5">
          <CanonicalCodActions orderId={orderId} />
        </div>
      ) : null}

      <CanonicalOrderRecoveryActions orderId={orderId} />
      <CanonicalCustomerReturnActions orderId={orderId} />

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => !loading && setConfirming(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={loading}
              onClick={(event) => {
                event.preventDefault();
                void commit();
              }}
            >
              {loading ? (
                <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
              ) : null}
              {t("orders.workspace.fulfillment.commit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
