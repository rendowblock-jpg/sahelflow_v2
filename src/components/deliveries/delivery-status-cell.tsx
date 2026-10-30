"use client";

import { DeliveryNeedsDecision } from "@/components/deliveries/delivery-needs-decision";
import { DeliveryStatusBadge } from "@/components/deliveries/delivery-status-badge";
import type { DeliveryListItem } from "@/hooks/swr/use-deliveries";
import {
  RECONCILIATION_STATUS,
  isStuckCreatingNow,
} from "@/lib/delivery/delivery-reconcile";

interface DeliveryStatusCellProps {
  delivery: DeliveryListItem;
  canManage: boolean;
}

/**
 * The status column of a delivery list row: the "Needs your decision" state
 * for a timed-out booking or one stuck in `creating`, the usual badge for
 * every other row (a young `creating` row included).
 */
export function DeliveryStatusCell({ delivery, canManage }: DeliveryStatusCellProps) {
  const stuckCreating = isStuckCreatingNow(delivery.status, delivery.updatedAt);
  if (delivery.status === RECONCILIATION_STATUS || stuckCreating) {
    return (
      <DeliveryNeedsDecision
        deliveryId={delivery.id}
        orderId={delivery.order?.id ?? null}
        canManage={canManage}
        stuckCreating={stuckCreating}
      />
    );
  }
  return (
    <DeliveryStatusBadge
      deliveryId={delivery.id}
      status={delivery.status}
      size="sm"
      disabled={!canManage}
    />
  );
}
