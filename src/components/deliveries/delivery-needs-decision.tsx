"use client";

import { useState } from "react";

import { DeliveryReconcileActions } from "@/components/deliveries/delivery-reconcile-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/hooks/use-i18n";

interface DeliveryNeedsDecisionProps {
  deliveryId: string;
  orderId: string | null;
  canManage: boolean;
  /** Stuck in `creating` (not timed out): the dialog says the booking never finished. */
  stuckCreating?: boolean;
}

const BADGE =
  "inline-flex items-center gap-1.5 rounded-control border border-warning/25 bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning";

/** The status cell of a delivery list row whose courier booking is stuck. */
export function DeliveryNeedsDecision({ deliveryId, orderId, canManage, stuckCreating = false }: DeliveryNeedsDecisionProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const label = t("deliveries.reconcile.needsDecision");

  if (!canManage) {
    return (
      <span className={BADGE}>
        <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
        {label}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${BADGE} min-h-8 outline-none hover:bg-warning/15 focus-visible:ring-2 focus-visible:ring-ring`}
        aria-haspopup="dialog"
      >
        <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
        {label}
        <span className="sr-only">{t("deliveries.reconcile.decide")}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deliveries.reconcile.title")}</DialogTitle>
            {stuckCreating ? (
              <p className="text-sm font-medium">{t("deliveries.reconcile.stuckCreating")}</p>
            ) : null}
            <DialogDescription>{t("deliveries.reconcile.description")}</DialogDescription>
          </DialogHeader>
          <DeliveryReconcileActions deliveryId={deliveryId} orderId={orderId} />
        </DialogContent>
      </Dialog>
    </>
  );
}
