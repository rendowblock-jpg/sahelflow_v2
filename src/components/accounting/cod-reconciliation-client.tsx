"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, DollarSign } from "lucide-react";
import { formatDZD, formatDate } from "@/lib/utils";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { mutatePrefix } from "@/lib/swr/mutate";
import { EmptyState } from "@/components/shared/empty-state";
import { useI18n } from "@/hooks/use-i18n";
import { CheckCircle } from "lucide-react";

interface PendingOrder {
  id: string;
  orderNumber: string;
  totalPrice: number;
  codCollectedAt: string | null;
  customerName: string | null;
}

interface CodReconciliationClientProps {
  pendingOrders: PendingOrder[];
  totalPending: number;
  totalCollected: number;
  totalRemitted: number;
}

export function CodReconciliationClient({
  pendingOrders, totalPending, totalCollected, totalRemitted,
}: CodReconciliationClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [remittanceRef, setRemittanceRef] = useState("");

  const bulkMutation = useApiMutation({
    successMessage: t("codReconciliation.success"),
    onSuccess: async () => {
      // The COD reconciliation page is a Server Component (no SWR for the
      // pending-orders list). mutatePrefix is a no-op here, but router.refresh()
      // revalidates the RSC tree so the list + stat cards refresh.
      void mutatePrefix("/api/orders");
      router.refresh();
      setSelected(new Set());
      setRemittanceRef("");
    },
  });

  const toggleAll = () => {
    if (selected.size === pendingOrders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingOrders.map((o) => o.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedTotal = pendingOrders
    .filter((o) => selected.has(o.id))
    .reduce((sum, o) => sum + o.totalPrice, 0);

  const handleBulkRemit = () => {
    if (!remittanceRef.trim() || selected.size === 0) return;
    bulkMutation.submit("/api/accounting/cod-reconciliation/bulk", {
      method: "POST",
      body: JSON.stringify({
        orderIds: Array.from(selected),
        remittanceRef,
      }),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{t("codReconciliation.pendingRemittance")} ({pendingOrders.length})</span>
          {selected.size > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              {t("dataTable.selected", { count: selected.size })} · {formatDZD(selectedTotal)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {pendingOrders.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title={t("codReconciliation.allReconciled")}
            description={t("codReconciliation.allReconciledDesc")}
          />
        ) : (
          <>
            {/* Bulk remittance bar */}
            {selected.size > 0 && (
              <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/50 p-3">
                <div className="flex-1 min-w-[200px] space-y-1.5">
                  <Label className="text-xs">{t("codReconciliation.remittanceRef")}</Label>
                  <Input
                    value={remittanceRef}
                    onChange={(e) => setRemittanceRef(e.target.value)}
                    placeholder="e.g. YAL-REM-2024-001"
                  />
                </div>
                <Button
                  onClick={handleBulkRemit}
                  disabled={!remittanceRef.trim() || bulkMutation.isSubmitting}
                >
                  {bulkMutation.isSubmitting ? (
                    <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
                  ) : (
                    <DollarSign className="h-4 w-4 me-1.5" />
                  )}
                  {t("codReconciliation.markRemitted", { count: selected.size })}
                </Button>
                <Button variant="ghost" onClick={() => setSelected(new Set())}>
                  {t("dataTable.clear")}
                </Button>
              </div>
            )}

            {/* Table */}
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full">
                <thead className="sticky top-0 border-b bg-muted/50">
                  <tr className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 w-10">
                      <Checkbox
                        checked={selected.size === pendingOrders.length && pendingOrders.length > 0}
                        onCheckedChange={toggleAll}
                        aria-label={t("dataTable.selectAll")}
                      />
                    </th>
                    <th className="px-4 py-3 text-start">Order</th>
                    <th className="px-4 py-3 text-start">Customer</th>
                    <th className="px-4 py-3 text-end">Amount</th>
                    <th className="px-4 py-3 text-start">Collected</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pendingOrders.map((o) => (
                    <tr
                      key={o.id}
                      className={`transition-colors hover:bg-muted/50 cursor-pointer ${selected.has(o.id) ? "bg-primary/5" : ""}`}
                      onClick={() => toggleOne(o.id)}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(o.id)}
                          onCheckedChange={() => toggleOne(o.id)}
                          aria-label={`Select ${o.orderNumber}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-sm font-medium">{o.orderNumber}</td>
                      <td className="px-4 py-3 text-sm">{o.customerName ?? "—"}</td>
                      <td className="px-4 py-3 text-end font-medium tabular-nums">{formatDZD(o.totalPrice)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {o.codCollectedAt ? formatDate(o.codCollectedAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30">
                  <tr className="text-sm font-medium">
                    <td colSpan={3} className="px-4 py-3 text-end">Total pending:</td>
                    <td className="px-4 py-3 text-end font-bold tabular-nums">{formatDZD(totalPending)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Summary line */}
            <div className="flex items-center justify-between rounded-lg bg-muted p-3 text-sm">
              <div className="flex gap-4">
                <span className="text-muted-foreground">{t("codReconciliation.collected")}: <span className="font-medium text-foreground">{formatDZD(totalCollected)}</span></span>
                <span className="text-muted-foreground">{t("codReconciliation.remitted")}: <span className="font-medium text-emerald-600">{formatDZD(totalRemitted)}</span></span>
                <span className="text-muted-foreground">Pending: <span className="font-medium text-amber-600">{formatDZD(totalPending)}</span></span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
