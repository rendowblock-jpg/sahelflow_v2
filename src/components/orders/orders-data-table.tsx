"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Printer, XCircle } from "lucide-react";

import { DataTable, type BulkAction } from "@/components/data-table/data-table";
import { OrdersEmptyState } from "@/components/shared/empty-states";
import { StateSurface } from "@/components/shared/state-surface";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useUndoableDelete } from "@/hooks/use-undoable-delete";
import { useOrders } from "@/hooks/swr/use-orders";
import { useOrdersFilterParams } from "@/hooks/use-orders-filter-params";
import { useI18n } from "@/hooks/use-i18n";
import type { Locale } from "@/lib/i18n";
import { mutatePrefix } from "@/lib/swr/mutate";
import { toast } from "@/lib/toast";
import type { OrderStatus } from "@/types/domain";
import type { OrdersWorkbenchResponse } from "@/types/workbench";
import {
  loadDeliverySlipsForOrders,
  useDeliverySlipPrinting,
} from "./delivery-slip";
import { OrdersFilterBar } from "./orders-filter-bar";
import { OrderFormDialog } from "./order-form-dialog";
import { useOrdersColumns } from "./orders-columns";

/** Minimal customer/product shapes the create-order dialog needs. */
interface EmptyStateCustomer {
  id: string;
  name: string;
  phone: string;
  wilaya: string | null;
  commune: string | null;
  address: string | null;
}

interface EmptyStateProduct {
  id: string;
  name: string;
  sku?: string | null;
  price: number | null;
  stock: number;
  lowStockThreshold?: number;
  isActive: boolean;
  productVariants?: Array<{
    id: string;
    name: string;
    sku: string | null;
    price: number | null;
    stock: number;
    isActive: boolean;
  }>;
}

interface OrdersDataTableProps {
  fallback: OrdersWorkbenchResponse;
  locale: Locale;
  statusFilter?: OrderStatus | "all";
  /**
   * When the actor may create orders, the first-use empty state mounts a real
   * create-order dialog trigger instead of a dead call-to-action.
   */
  canCreateOrder?: boolean;
  /** Catalog data for the empty-state create-order dialog. */
  customers?: EmptyStateCustomer[];
  products?: EmptyStateProduct[];
}

export function OrdersDataTable({
  fallback,
  locale,
  statusFilter = "all",
  canCreateOrder = false,
  customers,
  products,
}: OrdersDataTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { hasActiveFilters, clearFilters } = useOrdersFilterParams();

  const deleteOrder = useUndoableDelete({
    deleteUrl: (id) => `/api/orders/${id}`,
    restoreUrl: (id) => `/api/orders/${id}/restore`,
    entityLabel: t("orders.workspace.entity"),
    contextualLabel: (record) => {
      const order = record as { orderNumber?: string };
      return order.orderNumber
        ? t("orders.workspace.entityNumber", { number: order.orderNumber })
        : t("orders.workspace.entity");
    },
    onAfter: () => mutatePrefix("/api/orders"),
  });

  const { data, error, isLoading, mutate, pagination } = useOrders({
    status: statusFilter,
    fallback,
  });
  const fieldAccess = data?.fieldAccess ?? fallback.fieldAccess;
  const canOpenDetail = fieldAccess.contact && fieldAccess.financials;

  // R3-b: bon de livraison printing — one slip per order, details fetched
  // lazily through the permission-governed order endpoints.
  const {
    print: printSlips,
    isPreparing: isPreparingSlips,
    printRoot: slipPrintRoot,
  } = useDeliverySlipPrinting();

  const handlePrintSlips = useCallback(
    (orderIds: string[]) => {
      const rows = (data?.orders ?? []).filter((order) =>
        orderIds.includes(order.id),
      );
      if (rows.length === 0) return;
      void printSlips(async () => {
        const { slips, failed } = await loadDeliverySlipsForOrders(
          rows.map((row) => ({
            id: row.id,
            customerName: row.customer?.name ?? null,
          })),
        );
        if (failed.length > 0) {
          toast.warning(
            t("orders.slip.partialLoad", {
              ok: String(slips.length),
              total: String(rows.length),
            }),
          );
        }
        return slips;
      });
    },
    [data, printSlips, t],
  );

  const columns = useOrdersColumns({
    locale,
    fieldAccess,
    riskData: data?.riskData,
    onDelete: (id) => deleteOrder(id),
    onPrintSlip: (order) => handlePrintSlips([order.id]),
  });

  const bulkMutation = useApiMutation({
    onSuccess: async (result) => {
      const payload = result as { succeeded?: string[]; failed?: string[] };
      const succeeded = payload.succeeded?.length ?? 0;
      const failed = payload.failed?.length ?? 0;
      if (failed === 0) {
        toast.success(t("orders.bulkSuccess", { count: succeeded }));
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
        toast.error(t("orders.workspace.bulkGovernedBlocked"));
        return;
      }

      void bulkMutation
        .submit("/api/orders/bulk", {
          method: "POST",
          body: JSON.stringify({ ids: selectedIds, status }),
        })
        .catch(() => undefined);
    },
    [bulkMutation, data, t],
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
    // R3-b: print one bon de livraison per selected order (contact-gated —
    // a slip without the delivery address is not worth paper).
    ...(fieldAccess.contact
      ? [
          {
            label: t("orders.slip.printSelected"),
            onClick: (ids: string[]) => handlePrintSlips(ids),
            icon: Printer,
            disabled: isPreparingSlips,
          },
        ]
      : []),
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

  // Filtered-empty (nothing matched the active scope) stays distinct from the
  // first-use empty state: it offers to clear the filters instead of teaching.
  const emptyState = hasActiveFilters ? (
    <OrdersEmptyState filtered onClearFilters={clearFilters} />
  ) : canCreateOrder && customers && products ? (
    <OrdersEmptyState
      createAction={
        <OrderFormDialog customers={customers} products={products} />
      }
    />
  ) : (
    <OrdersEmptyState />
  );

  return (
    <div className="space-y-3">
      <OrdersFilterBar />
      <DataTable
        columns={columns}
        data={data?.orders ?? []}
        isLoading={isLoading}
        pagination={pagination}
        onRowClick={canOpenDetail ? (row) => router.push(`/orders/${row.id}`) : undefined}
        bulkActions={fieldAccess.update ? bulkActions : undefined}
        getRowId={(row) => row.id}
        emptyState={emptyState}
      />
      {slipPrintRoot}
    </div>
  );
}
