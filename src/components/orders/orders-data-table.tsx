"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

import { DataTable, type BulkAction } from "@/components/data-table/data-table";
import { OrdersEmptyState } from "@/components/shared/empty-states";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useUndoableDelete } from "@/hooks/use-undoable-delete";
import { useOrders, type OrdersResponse } from "@/hooks/swr/use-orders";
import { useI18n } from "@/hooks/use-i18n";
import type { Locale } from "@/lib/i18n";
import { mutatePrefix } from "@/lib/swr/mutate";
import { toast } from "@/lib/toast";
import type { OrderStatus } from "@/types/domain";
import { useOrdersColumns } from "./orders-columns";

interface OrdersDataTableProps {
  /** Exact first page from the same server workbench contract as later pages. */
  fallback: OrdersResponse;
  locale: Locale;
  statusFilter?: OrderStatus | "all";
}

/**
 * Orders operational workbench.
 *
 * Field access and risk projections travel with every paginated response, so the
 * second page has the same permission/redaction semantics as the RSC first paint.
 * Bulk actions remain compatibility-only: governed canonical orders require their
 * dedicated command flow and cannot be flattened into legacy status mutation.
 */
export function OrdersDataTable({
  fallback,
  locale,
  statusFilter = "all",
}: OrdersDataTableProps) {
  const { t } = useI18n();
  const router = useRouter();

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

  const { data, isLoading, mutate, pagination } = useOrders({
    status: statusFilter,
    fallback,
  });
  const response = data ?? fallback;

  const columns = useOrdersColumns({
    locale,
    fieldAccess: response.fieldAccess,
    riskData: response.riskData,
    onDelete: (id) => deleteOrder(id),
  });

  const bulkMutation = useApiMutation({
    onSuccess: async (result) => {
      const response = result as { succeeded?: string[]; failed?: string[] };
      const succeeded = response.succeeded?.length ?? 0;
      const failed = response.failed?.length ?? 0;
      if (failed === 0) {
        toast.success(t("orders.bulkSuccess", { n: String(succeeded) }));
      } else {
        toast.warning(
          t("orders.bulkPartial", {
            ok: String(succeeded),
            fail: String(failed),
          }),
        );
      }
      await Promise.all([mutatePrefix("/api/orders"), router.refresh()]);
    },
  });

  const handleBulk = useCallback(
    (status: OrderStatus, selectedIds: string[]) => {
      if (selectedIds.length === 0) return;
      const governedSelected = response.orders.some(
        (order) =>
          selectedIds.includes(order.id) &&
          (order.mutationAuthority === "canonical_v1" ||
            order.mutationAuthority === "confirmation_blocked"),
      );
      if (governedSelected) {
        toast.error(
          locale === "ar"
            ? "تتطلب هذه الطلبيات معالجة فردية محكومة قبل تغيير حالتها."
            : locale === "fr"
              ? "Ces commandes exigent un traitement individuel gouverné avant tout changement d’état."
              : "These orders require an individual governed flow before status changes.",
        );
        return;
      }

      const optimisticData: OrdersResponse = {
        ...response,
        orders: response.orders.map((order) =>
          selectedIds.includes(order.id) ? { ...order, status } : order,
        ),
      };
      void mutate(optimisticData, { revalidate: false });

      void bulkMutation
        .submit("/api/orders/bulk", {
          method: "POST",
          body: JSON.stringify({ ids: selectedIds, status }),
        })
        .catch(() => {
          void mutate();
        });
    },
    [bulkMutation, locale, mutate, response],
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

  return (
    <DataTable
      columns={columns}
      data={response.orders}
      isLoading={isLoading}
      pagination={pagination}
      onRowClick={(row) => router.push(`/orders/${row.id}`)}
      bulkActions={response.fieldAccess.update ? bulkActions : undefined}
      getRowId={(row) => row.id}
      emptyState={<OrdersEmptyState />}
    />
  );
}
