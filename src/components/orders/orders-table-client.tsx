"use client";

/**
 * OrdersTableClient — premium data table with checkbox selection + bulk actions.
 * 
 * Pattern: shadcn v4 data table
 * - Rounded border wrapper
 * - Sticky bg-muted header
 * - hover:bg-muted/50 rows
 * - Proper empty row (h-24 text-center)
 * - Row actions dropdown (View/Edit/Delete)
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, MoreVertical, Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { formatDZD, formatDate } from "@/lib/utils";
import type { OrderStatus } from "@/types/domain";
import { useI18n } from "@/hooks/use-i18n";
import { OrderStatusBadge } from "./order-status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { RiskBadge } from "@/components/risk/risk-badge";
import type { RiskLevel } from "@/lib/risk-engine";

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  totalPrice: number;
  wilaya: string;
  phone: string;
  createdAt: Date | string;
  items: Array<{ id: string }>;
  customer: { name: string | null; phone: string | null } | null;
}

interface OrdersTableClientProps {
  orders: OrderRow[];
  locale: "ar" | "fr" | "en";
  /** Optional risk assessments: orderId → { level, score }. When present, a Risk column is shown. */
  riskData?: Record<string, { level: string; score: number }>;
}

export function OrdersTableClient({ orders, locale, riskData }: OrdersTableClientProps) {
  const resolvedOrders = orders;
  const { t } = useI18n();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allSelected = resolvedOrders.length > 0 && selected.size === resolvedOrders.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(resolvedOrders.map((o) => o.id)));
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

  const handleBulk = (status: OrderStatus) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    startTransition(async () => {
      try {
        const res = await fetch("/api/orders/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, status }),
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error ?? "Bulk operation failed");

        const succeeded = data.succeeded?.length ?? 0;
        const failed = data.failed?.length ?? 0;

        if (failed === 0) {
          toast.success(t("orders.bulkSuccess").replace("{n}", String(succeeded)));
        } else {
          toast.warning(
            t("orders.bulkPartial").replace("{ok}", String(succeeded)).replace("{fail}", String(failed)),
          );
        }

        setSelected(new Set());
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk operation failed");
      }
    });
  };

  return (
    <>
      {/* Bulk action toolbar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-2.5 animate-fade-up">
          <span className="text-sm font-medium">
            {t("orders.selected").replace("{n}", String(selected.size))}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => handleBulk("confirmed")} disabled={isPending}>
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {t("orders.confirmSelected")}
            </Button>
            <Button size="sm" onClick={() => handleBulk("shipped")} disabled={isPending}>
              {t("orders.shipSelected")}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => handleBulk("cancelled")} disabled={isPending}>
              <XCircle className="h-3.5 w-3.5" />
              {t("orders.cancelSelectedShort")}
            </Button>
          </div>
        </div>
      )}

      {/* Table — rounded border wrapper, sticky header */}
      <div className="overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 border-b bg-muted/50">
              <tr className="text-start text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-3 w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-4 py-3">{t("orders.orderNumber")}</th>
                <th className="px-4 py-3">{t("orders.customer")}</th>
                <th className="px-4 py-3 hidden md:table-cell">{t("orders.items")}</th>
                <th className="px-4 py-3 hidden sm:table-cell">{t("orders.wilaya")}</th>
                <th className="px-4 py-3 text-end">{t("orders.total")}</th>
                <th className="px-4 py-3">{t("orders.status")}</th>
                {riskData && <th className="px-4 py-3 hidden md:table-cell">{t("risk.assessment.score")}</th>}
                <th className="px-4 py-3 hidden lg:table-cell">{t("orders.date")}</th>
                <th className="px-4 py-3 text-end w-12">{t("orders.action")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {resolvedOrders.length === 0 ? (
                <tr>
                  <td colSpan={riskData ? 10 : 9} className="h-24 text-center text-muted-foreground">
                    {t("orders.empty.title")}
                  </td>
                </tr>
              ) : (
                resolvedOrders.map((order) => {
                  const status = order.status as OrderStatus;
                  const isSelected = selected.has(order.id);
                  const itemCount = order.items.length;
                  const itemLabel = itemCount > 1
                    ? t("orders.itemsCount").replace("{n}", String(itemCount))
                    : t("orders.itemsCountSingular").replace("{n}", String(itemCount));
                  return (
                    <tr
                      key={order.id}
                      className={`transition-colors hover:bg-muted/50 ${isSelected ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleOne(order.id)}
                          aria-label={`Select ${order.orderNumber}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-sm font-medium">{order.orderNumber}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium">{order.customer?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{order.phone}</div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-sm text-muted-foreground">{itemLabel}</td>
                      <td className="px-4 py-3 hidden sm:table-cell text-sm">{order.wilaya}</td>
                      <td className="px-4 py-3 text-end font-medium text-sm tabular-nums">{formatDZD(order.totalPrice)}</td>
                      <td className="px-4 py-3">
                        <OrderStatusBadge
                          orderId={order.id}
                          status={status}
                          size="sm"
                        />
                      </td>
                      {riskData && (
                        <td className="px-4 py-3 hidden md:table-cell">
                          {riskData[order.id] ? (
                            <RiskBadge
                              level={riskData[order.id]!.level as RiskLevel}
                              score={riskData[order.id]!.score}
                              href={`/orders/${order.id}`}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">{formatDate(order.createdAt, locale)}</td>
                      <td className="px-4 py-3 text-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">{t("orders.actions")}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="shadow-dropdown">
                            <DropdownMenuItem asChild>
                              <Link href={`/orders/${order.id}`}>
                                <Eye className="me-2 h-4 w-4" />
                                {t("orders.viewDetails")}
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/orders/${order.id}?edit=true`}>
                                <Pencil className="me-2 h-4 w-4" />
                                {t("orders.edit")}
                              </Link>
                            </DropdownMenuItem>
                            {(order.status === "draft" || order.status === "cancelled") && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget(order.id)}
                                >
                                  <Trash2 className="me-2 h-4 w-4" />
                                  {t("orders.delete")}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("orders.confirmDelete")}
        description={t("orders.confirmDeleteDesc")}
        destructive
        onConfirm={async () => {
          if (!deleteTarget) return;
          await fetch(`/api/orders/${deleteTarget}`, { method: "DELETE" });
          setDeleteTarget(null);
          router.refresh();
        }}
      />
    </>
  );
}
