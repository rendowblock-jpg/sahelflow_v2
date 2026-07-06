"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DollarSign, CheckCircle2, Loader2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { mutatePrefix } from "@/lib/swr/mutate";
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

export function CodControls({
  orderId, orderNumber, amount,
  codCollected,
  codRemitted, codRemittedAt, codRemittanceRef,
}: CodControlsProps) {
  const { t } = useI18n();
  const [remittanceRef, setRemittanceRef] = useState("");
  const [showRemitInput, setShowRemitInput] = useState(false);

  const collectMutation = useApiMutation({
    successMessage: t("orders.cod.collected"),
    onSuccess: async () => { await mutatePrefix("/api/orders"); },
  });

  const remitMutation = useApiMutation({
    successMessage: t("orders.cod.remitted"),
    onSuccess: async () => {
      await mutatePrefix("/api/orders");
      setShowRemitInput(false);
      setRemittanceRef("");
    },
  });

  const handleCollect = () => {
    collectMutation.submit(`/api/orders/${orderId}/cod`, {
      method: "PATCH",
      body: JSON.stringify({ action: "mark_collected" }),
    });
  };

  const handleRemit = () => {
    if (!remittanceRef.trim()) return;
    remitMutation.submit(`/api/orders/${orderId}/cod`, {
      method: "PATCH",
      body: JSON.stringify({ action: "mark_remitted", remittanceRef }),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{t("orders.cod.title")}</p>
          <p className="text-xs text-muted-foreground">{formatDZD(amount)} · {orderNumber}</p>
        </div>
        <div className="flex gap-1.5">
          {codCollected ? (
            <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1">
              <CheckCircle2 className="h-3 w-3" /> {t("orders.cod.collectedStatus")}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">{t("orders.cod.uncollected")}</Badge>
          )}
          {codRemitted ? (
            <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1">
              <CheckCircle2 className="h-3 w-3" /> {t("orders.cod.remittedStatus")}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">{t("orders.cod.pendingRemittance")}</Badge>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {!codCollected && (
          <Button size="sm" variant="outline" onClick={handleCollect} disabled={collectMutation.isSubmitting}>
            {collectMutation.isSubmitting ? <Loader2 className="h-3.5 w-3.5 me-1 animate-spin" /> : <DollarSign className="h-3.5 w-3.5 me-1" />}
            {t("orders.cod.markCollected")}
          </Button>
        )}
        {codCollected && !codRemitted && !showRemitInput && (
          <Button size="sm" variant="outline" onClick={() => setShowRemitInput(true)}>
            <DollarSign className="h-3.5 w-3.5 me-1" />
            {t("orders.cod.markRemitted")}
          </Button>
        )}
      </div>

      {/* Remittance input */}
      {showRemitInput && codCollected && !codRemitted && (
        <div className="flex items-end gap-2 rounded-lg border p-3">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">{t("orders.cod.remittanceRef")}</Label>
            <Input
              value={remittanceRef}
              onChange={(e) => setRemittanceRef(e.target.value)}
              placeholder="e.g. YAL-REM-2024-001"
            />
          </div>
          <Button size="sm" onClick={handleRemit} disabled={!remittanceRef.trim() || remitMutation.isSubmitting}>
            {remitMutation.isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("common.confirm")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowRemitInput(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      )}

      {/* Remittance info */}
      {codRemitted && codRemittanceRef && (
        <p className="text-xs text-muted-foreground">
          {t("orders.cod.remittanceRef")}: <span className="font-mono">{codRemittanceRef}</span>
          {codRemittedAt && ` · ${new Date(codRemittedAt).toLocaleDateString()}`}
        </p>
      )}
    </div>
  );
}
