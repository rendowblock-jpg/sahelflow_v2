"use client";

/**
 * The pieces the orders list draws around a bulk status change (P5 slice 1): the question before the two actions that
 * cannot be walked back, and the notice after a batch that did not fully go through. Logic lives in
 * `src/lib/orders/bulk-result.ts`; every string comes from the locale layer.
 */
import { AlertTriangle } from "lucide-react";

import { TechnicalValue } from "@/components/i18n/technical-value";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { bulkNeedsConfirmation, type BulkFailure } from "@/lib/orders/bulk-result";
import type { OrderStatus } from "@/types/domain";

interface BulkConfirmDialogProps {
  status: OrderStatus;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
}

/**
 * "Cancel" is never the safe button here: the safe one reads "Go back", so it cannot be mistaken for the action
 * "Cancel orders" that sits beside it.
 */
export function BulkConfirmDialog({ status, count, open, onOpenChange, onConfirm }: BulkConfirmDialogProps) {
  const { t } = useI18n();
  if (!bulkNeedsConfirmation(status)) return null;
  const cancelling = status === "cancelled";
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(cancelling ? "orders.workspace.bulk.cancelTitle" : "orders.workspace.bulk.shipTitle")}
      description={t(cancelling ? "orders.workspace.bulk.cancelBody" : "orders.workspace.bulk.shipBody", { count })}
      confirmLabel={t(cancelling ? "orders.workspace.bulk.cancelConfirm" : "orders.workspace.bulk.shipConfirm")}
      cancelLabel={t("orders.workspace.bulk.goBack")}
      destructive={cancelling}
      onConfirm={onConfirm}
    />
  );
}

const MAX_LISTED = 5;

interface BulkFailureNoticeProps {
  failures: readonly BulkFailure[];
  /** How many orders the batch covered. */
  total: number;
  onDismiss: () => void;
}

/**
 * Says which orders were not changed and why, and that they are still selected. A failure "names the recovery and
 * preserves what the user had selected" (INTERFACE_SYSTEM.md section 9). The reason is chosen from a stable code, so a
 * seller never reads raw English; an order that is not on the page is called "Order", never by its internal id.
 */
export function BulkFailureNotice({ failures, total, onDismiss }: BulkFailureNoticeProps) {
  const { t } = useI18n();
  if (failures.length === 0) return null;
  const shown = failures.slice(0, MAX_LISTED);
  const rest = failures.length - shown.length;
  return (
    <Alert data-testid="orders-bulk-failure-notice">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle className="line-clamp-none">
        {t("orders.workspace.bulk.failedTitle", { failed: failures.length, total })}
      </AlertTitle>
      <AlertDescription>
        <p>{t("orders.workspace.bulk.failedHint")}</p>
        <ul className="space-y-1">
          {shown.map((failure) => (
            <li key={failure.id} className="flex flex-wrap items-baseline gap-x-2">
              {failure.orderNumber ? (
                <TechnicalValue className="font-medium text-foreground">{failure.orderNumber}</TechnicalValue>
              ) : (
                <span className="font-medium text-foreground">{t("orders.workspace.entity")}</span>
              )}
              <span>{t(`orders.workspace.bulk.reason.${failure.reason}`)}</span>
            </li>
          ))}
        </ul>
        {rest > 0 ? <p>{t("orders.workspace.bulk.more", { count: rest })}</p> : null}
        <Button size="sm" variant="ghost" onClick={onDismiss} className="-ms-2">
          {t("common.dismiss")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
