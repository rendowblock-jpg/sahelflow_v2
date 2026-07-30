"use client";

import { Ban, Truck } from "lucide-react";
import { useRouter } from "next/navigation";

import { DataTable } from "@/components/data-table/data-table";
import { OrdersEmptyState } from "@/components/shared/empty-states";
import { useI18n } from "@/hooks/use-i18n";
import { useUndoableDelete } from "@/hooks/use-undoable-delete";
import { useOrders, type OrdersResponse } from "@/hooks/swr/use-orders";
import type { Locale } from "@/lib/i18n";
import { mutatePrefix } from "@/lib/swr/mutate";
import { toast } from "@/lib/toast";
import type { OrderStatus } from "@/types/domain";
import { useOrdersColumns } from "./orders-columns";

interface OrdersDataTableProps {
  fallback: OrdersResponse;
  locale: Locale;
  statusFilter?: OrderStatus | "all";
  riskData?: Record<string, { level: string; score: number }>;
}

interface BulkResult {
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

export function OrdersDataTable({
  fallback,
  locale,
  statusFilter = "all",
  riskData,
}: OrdersDataTableProps) {
  const router = useRouter();
  const { t } = useI18n();
  const deleteOrder = useUndoableDelete({
    deleteUrl: (id) => `/api/orders/${id}`,
    restoreUrl: (id) => `/api/orders/${id}/restore`,
    entityLabel: "Order",
    contextualLabel: (record) => {
      const order = record as { orderNumber?: string };
      return order.orderNumber ? `Order ${order.orderNumber}` : "Order";
    },
    onAfter: () => mutatePrefix("/api/orders"),
  });

  const { data, isLoading, pagination } = useOrders({
    status: statusFilter,
    fallback,
  });
  const columns = useOrdersColumns({
    locale,
    riskData,
    onDelete: (id) => deleteOrder(id),
  });
  const orders = data?.orders ?? fallback.orders;

  async function bulkTransition(
    selectedIds: string[],
    target: "shipped" | "cancelled",
    allowedStatuses: readonly string[],
  ): Promise<void> {
    const selected = new Set(selectedIds);
    const eligibleIds = orders
      .filter(
        (order) =>
          selected.has(order.id) &&
          order.mutationAuthority === "legacy_compatibility" &&
          allowedStatuses.includes(order.status),
      )
      .map((order) => order.id);

    if (eligibleIds.length === 0) {
      toast.error(t("orders.statusActions.noActions"));
      return;
    }

    try {
      const response = await fetch("/api/orders/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: eligibleIds, status: target }),
      });
      if (!response.ok) {
        throw new Error(t("orders.statusActions.updateFailed"));
      }
      const result = (await response.json()) as BulkResult;
      if (result.succeeded.length > 0) {
        toast.success(t("orders.statusActions.updated"));
      }
      if (
        result.failed.length > 0 ||
        eligibleIds.length < selectedIds.length
      ) {
        toast.error(t("orders.statusActions.updateFailed"));
      }
      router.refresh();
      void mutatePrefix("/api/orders");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("orders.statusActions.updateFailed"),
      );
    }
  }

  return (
    <DataTable
      columns={columns}
      data={orders}
      isLoading={isLoading}
      pagination={pagination}
      onRowClick={(row) => router.push(`/orders/${row.id}`)}
      bulkActions={[
        {
          label: t("orders.shipOrder"),
          icon: Truck,
          onClick: (selectedIds) => {
            void bulkTransition(selectedIds, "shipped", ["confirmed"]);
          },
        },
        {
          label: t("common.cancel"),
          icon: Ban,
          variant: "destructive",
          onClick: (selectedIds) => {
            void bulkTransition(selectedIds, "cancelled", [
              "draft",
              "pending",
              "confirmed",
            ]);
          },
        },
      ]}
      getRowId={(row) => row.id}
      emptyState={<OrdersEmptyState />}
    />
  );
}
