"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { DataTable, type BulkAction } from "@/components/data-table/data-table";
import { OrdersEmptyState } from "@/components/shared/empty-states";
import { StateSurface } from "@/components/shared/state-surface";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useUndoableDelete } from "@/hooks/use-undoable-delete";
import { useOrders } from "@/hooks/swr/use-orders";
import { useI18n } from "@/hooks/use-i18n";
import type { Locale } from "@/lib/i18n";
import { mutatePrefix } from "@/lib/swr/mutate";
import { toast } from "@/lib/toast";
import type { OrderStatus } from "@/types/domain";
import type { OrdersWorkbenchResponse } from "@/types/workbench";
import { useOrdersColumns } from "./orders-columns";

interface OrdersDataTableProps {
  /** Exact server page matching the initial URL workbench state. */
  fallback: OrdersWorkbenchResponse;
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
 * Business status is never painted optimistically: the visible state changes only
 * after the authoritative server mutation succeeds and the workbench revalidates.
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

  const { data, error, isLoading, mutate, pagination } = useOrders({
    status: statusFilter,
    fallback,
  });
  const fieldAccess = data?.fieldAccess ?? fallback.fieldAccess;

  const columns = useOrdersColumns({
    locale,
    fieldAccess,
    riskData: data?.riskData,
    onDelete: (id) => deleteOrder(id),
  });

  const bulkMutation = useApiMutation({
    onSuccess: async (result) => {
      const payload = result as { succeeded?: string[]; failed?: string[] };
      const succeeded = payload.succeeded?.length ?? 0;
      const failed = payload.failed?.length ?? 0;
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
      await Promise.all([
        mutate(),
        mutatePrefix("/api/orders"),
        router.refresh(),
      ]);
    },
  });

  const handleBulk = useCallback(
    (status: OrderStatus, selectedIds: string[]) => {
      if (selectedIds.length === 0 || bulkMutation.isSubmitting || !data) return;
      const governedSelected = data.orders.some(
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

      void bulkMutation.submit("/api/orders/bulk", {
        method: "POST",
        body: JSON.stringify({ ids: selectedIds, status }),
      });
    },
    [bulkMutation, data, locale],
  );

  const bulkActions: BulkAction[] = [
    {
      label: t("orders.confirmSelected"),
      onClick: (ids) => handleBulk("confirmed", ids),
      icon: CheckCircle2,
      disabled: bulkMutation.isSubmitting,
    },
    {
      label: t("orders.shipSelected"),
      onClick: (ids) => handleBulk("shipped", ids),
      disabled: bulkMutation.isSubmitting,
    },
    {
      label: t("orders.cancelSelectedShort"),
      onClick: (ids) => handleBulk("cancelled", ids),
      variant: "destructive",
      icon: XCircle,
      disabled: bulkMutation.isSubmitting,
    },
  ];

  if (error && !data) {
    return (
      <StateSurface
        icon={AlertTriangle}
        title={t("error.requestFailed")}
        description={error.message}
        tone="danger"
        size="inline"
        role="alert"
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={data?.orders ?? []}
      isLoading={isLoading}
      pagination={pagination}
      onRowClick={(row) => router.push(`/orders/${row.id}`)}
      bulkActions={fieldAccess.update ? bulkActions : undefined}
      getRowId={(row) => row.id}
      emptyState={<OrdersEmptyState />}
    />
  );
}
