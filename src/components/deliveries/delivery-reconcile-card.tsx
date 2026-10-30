"use client";

import { AlertTriangle } from "lucide-react";

import { DeliveryReconcileActions } from "@/components/deliveries/delivery-reconcile-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/hooks/use-i18n";

interface DeliveryReconcileCardProps {
  deliveryId: string;
  orderId: string;
  canManage: boolean;
  canonical: boolean;
}

/** The "Needs your decision" card on the delivery page. */
export function DeliveryReconcileCard({
  deliveryId,
  orderId,
  canManage,
  canonical,
}: DeliveryReconcileCardProps) {
  const { t } = useI18n();
  return (
    <Card className="border-warning/40" role="region" aria-label={t("deliveries.reconcile.needsDecision")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
          {t("deliveries.reconcile.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("deliveries.reconcile.description")}</p>
        {canManage ? (
          <DeliveryReconcileActions deliveryId={deliveryId} orderId={orderId} canonical={canonical} />
        ) : null}
      </CardContent>
    </Card>
  );
}
