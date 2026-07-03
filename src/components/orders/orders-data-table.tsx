"use client";

/**
 * OrdersDataTable — the Phase 1 replacement for OrdersTableClient.
 *
 * Key upgrades over the old client:
 *   - Uses DataTable v2 (TanStack Table): pagination, URL-synced sort, density toggle, bulk
 *   - Uses SWR (useOrders hook) for data fetching — no more router.refresh()
 *   - Optimistic bulk status updates (instant UI feedback + rollback on error)
 *   - Receives first page as `fallback` from RSC (fast initial render, no loading flash)
 *   - Subsequent pages fetched client-side via SWR (paginated API)
 *
 * The RSC page renders this component with the first page of orders + risk data
 * as props. The component seeds SWR's fallback cache with that data, so the
 * first render is instant. When the user paginates, SWR fetches the next page.
 */
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Package } from "lucide-react";
import { DataTable, type BulkAction } from "@/components/data-table/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useOrders, type OrdersResponse } from "@/hooks/swr/use-orders";
import { useOrdersColumns } from "./orders-columns";
import { useI18n } from "@/hooks/use-i18n";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { mutatePrefix } from "@/lib/swr/mutate";
import { toast } from "@/lib/toast";
import type { OrderStatus } from "@/types/domain";
import type { Locale } from "@/lib/i18n";

interface OrdersDataTableProps {
  /** First page of orders from RSC (SWR fallback). */
  fallback: OrdersResponse;
  locale: Locale;
  /** Status filter (from URL searchParams). */
  statusFilter?: OrderStatus | "all";
  /** Risk assessments from RSC (orderId → {level, score}). */
  riskData?: Record<string, { level: string; score: number }>;
}

export function OrdersDataTable({
  fallback,
  locale,
  statusFilter = "all",
  riskData,
}: OrdersDataTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data, isLoading, mutate, pagination } = useOrders({
    status: statusFilter,
    fallback,
  });

  const columns = useOrdersColumns({
    locale,
    riskData,
    onDelete: (id) => setDeleteTarget(id),
  });

  // ── Optimistic bulk status update ──
  // The #1 mutation in the app. Instead of router.refresh() (which refetches
  // the whole RSC tree), we optimistically update the SWR cache: flip the
  // status of selected orders instantly, then call the API. On error, SWR
  // rolls back automatically.
  const bulkMutation = useApiMutation({
    onSuccess: async (result) => {
      const r = result as { succeeded?: string[]; failed?: string[] };
      const succeeded = r.succeeded?.length ?? 0;
      const failed = r.failed?.length ?? 0;
      if (failed === 0) {
        toast.success(t("orders.bulkSuccess", { n: String(succeeded) }));
      } else {
        toast.warning(t("orders.bulkPartial", { ok: String(succeeded), fail: String(failed) }));
      }
      // Revalidate orders + dashboard stats
      await Promise.all([
        mutatePrefix("/api/orders"),
        mutatePrefix("/api/dashboard"),
      ]);
    },
  });

  const handleBulk = useCallback(
    (status: OrderStatus, selectedIds: string[]) => {
      if (selectedIds.length === 0) return;

      // Optimistic update: immediately flip status in the SWR cache
      const optimisticData: OrdersResponse | undefined = data
        ? {
            ...data,
            orders: data.orders.map((o) =>
              selectedIds.includes(o.id) ? { ...o, status } : o,
            ),
          }
        : undefined;

      mutate(optimisticData, { revalidate: false });

      // Fire the mutation (rollbackOnError restores the real state on failure)
      bulkMutation.submit("/api/orders/bulk", {
        method: "POST",
        body: JSON.stringify({ ids: selectedIds, status }),
      }).catch(() => {
        // Error toast handled by useApiMutation. SWR auto-rolls back the
        // optimistic update because we passed revalidate: false + the
        // mutation threw — we need to revalidate to get the true state.
        mutate();
      });
    },
    [data, mutate, bulkMutation],
  );

  const bulkActions: BulkAction[] = [
    {
      label: t("orders.confirmSelected"),
      onClick: (ids) => handleBulk("confirmed", ids),
      icon: CheckCircle2,
    },
    {
      label: t("orders.shipSelected"),
      onClick: (ids) => handleBulk("shipped", ids),
    },
    {
      label: t("orders.cancelSelectedShort"),
      onClick: (ids) => handleBulk("cancelled", ids),
      variant: "destructive",
      icon: XCircle,
    },
  ];

  const orders = data?.orders ?? fallback.orders;

  return (
    <>
      <DataTable
        columns={columns}
        data={orders}
        isLoading={isLoading}
        pagination={pagination}
        onRowClick={(row) => router.push(`/orders/${row.id}`)}
        bulkActions={bulkActions}
        getRowId={(row) => row.id}
        emptyState={
          <EmptyState
            icon={Package}
            title={t("orders.empty.title")}
            description={t("orders.empty.description")}
          />
        }
      />

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
          await mutatePrefix("/api/orders");
        }}
      />
    </>
  );
}
