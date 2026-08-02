"use client";

import Link from "next/link";
import { DollarSign } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { formatDZD } from "@/lib/utils";

interface CodControlsProps {
  orderId: string;
  orderNumber: string;
  amount: number;
  codCollected: boolean | null;
  codCollectedAt: string | null;
  codRemitted: boolean | null;
  codRemittedAt: string | null;
  codRemittanceRef: string | null;
}

/**
 * Read-only compatibility surface.
 *
 * Scalar order COD flags are no longer mutable authority. Collection,
 * remittance, fees, adjustments and discrepancies are managed in the
 * canonical accounting workspace through governed commands.
 */
export function CodControls({ orderNumber, amount }: CodControlsProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{t("orders.cod.title")}</p>
        <p className="text-xs text-muted-foreground">
          {formatDZD(amount)} · {orderNumber}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("codReconciliation.description")}
      </p>
      <Button size="sm" variant="outline" asChild>
        <Link href="/accounting/cod-reconciliation">
          <DollarSign className="me-1.5 h-3.5 w-3.5" />
          {t("codReconciliation.title")}
        </Link>
      </Button>
    </div>
  );
}
