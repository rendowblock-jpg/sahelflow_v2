"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Printer, XCircle } from "lucide-react";

import { DataTable, type BulkAction, type BulkControls } from "@/components/data-table/data-table";
import { OrdersEmptyState } from "@/components/shared/empty-states";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useUndoableDelete } from "@/hooks/use-undoable-delete";
import { useOrders } from "@/hooks/swr/use-orders";
import { useOrdersFilterParams } from "@/hooks/use-orders-filter-params";
import { useI18n } from "@/hooks/use-i18n";
import { useOnlineStatus } from "@/hooks/use-online-status";
import type { Locale } from "@/lib/i18n";
import {
  bulkNeedsConfirmation,
  ordersEmptyKind,
  readBulkOutcome,
  type BulkFailure,
} from "@/lib/orders/bulk-result";
import { mutatePrefix } from "@/lib/swr/mutate";
import { toast } from "@/lib/toast";
import type { OrderStatus } from "@/types/domain";
import type { OrdersWorkbenchResponse } from "@/types/workbench";
import {
  loadDeliverySlipsForOrders,
  useDeliverySlipPrinting,
} from "./delivery-slip";
import { ListErrorState, ListStatusBanner } from "./list-status-banner";
import { BulkConfirmDialog, BulkFailureNotice } from "./orders-bulk-ui";
import { OrdersFilterBar } from "./orders-filter-bar";
import { useOrdersShippingList } from "./shipping-list-print";
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

  const { data, error, isLoading, isRefreshing, mutate, pagination } = useOrders({
    status: statusFilter,
    fallback,
  });
  const online = useOnlineStatus();
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

  const shippingList = useOrdersShippingList(data?.orders ?? [], online);

  const columns = useOrdersColumns({
    locale,
    fieldAccess,
    riskData: data?.riskData,
    onDelete: (id) => deleteOrder(id),
    onPrintSlip: (order) => handlePrintSlips([order.id]),
  });

  const bulkMutation = useApiMutation();
  const orderNumberById = useMemo(
    () => new Map((data?.orders ?? []).map((order) => [order.id, order.orderNumber])),
    [data],
  );
  // The question before a bulk ship or cancel. The pending batch stays in state while the dialog closes, so its
  // wording does not change under the closing animation.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingBulk, setPendingBulk] = useState<{
    status: OrderStatus;
    ids: string[];
    controls: BulkControls;
  } | null>(null);
  // Which orders the last batch could not change. Cleared when the seller dismisses it or runs another batch.
  const [bulkFailures, setBulkFailures] = useState<{ failures: BulkFailure[]; total: number } | null>(null);
  const bulkInFlight = useRef(false);

  const runBulk = useCallback(
    async (status: OrderStatus, selectedIds: string[], controls: BulkControls) => {
      if (bulkInFlight.current) return;
      bulkInFlight.current = true;
      setBulkFailures(null);
      try {
        let result: unknown;
        try {
          result = await bulkMutation.submit("/api/orders/bulk", {
            method: "POST",
            body: JSON.stringify({ ids: selectedIds, status }),
          });
        } catch {
          // The mutation hook has already told the seller why; the selection stays so they can try again.
          return;
        }
        const outcome = readBulkOutcome(result, orderNumberById);
        if (!outcome) {
          toast.error(t("orders.workspace.bulk.unreadable"));
        } else if (outcome.failed.length === 0) {
          toast.success(t("orders.bulkSuccess", { count: outcome.succeeded }));
          controls.clear();
        } else {
          toast.warning(
            t("orders.bulkPartial", {
              ok: String(outcome.succeeded),
              fail: String(outcome.failed.length),
            }),
          );
          setBulkFailures({ failures: outcome.failed, total: selectedIds.length });
          // Keep only what still needs attention selected: the next move is "fix and retry", not "find them again".
          controls.select(outcome.failedIds);
        }
        // Reload the list in the background. Waiting for it here would keep the question open (the dialog closes when
        // this function returns) for as long as the reload takes, which is seconds on a slow PC, while the result
        // the seller is waiting for is already known and shown. A failed reload shows through the list's own error state.
        void Promise.all([mutate(), mutatePrefix("/api/orders"), router.refresh()]).catch(() => undefined);
      } finally {
        bulkInFlight.current = false;
      }
    },
    [bulkMutation, mutate, orderNumberById, router, t],
  );

  const handleBulk = useCallback(
    (status: OrderStatus, selectedIds: string[], controls: BulkControls) => {
      if (selectedIds.length === 0 || bulkMutation.isSubmitting || !data || !online) return;
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
      // Ship and cancel cannot be walked back (see lib/orders/bulk-result.ts), so they ask first; confirm does not.
      if (bulkNeedsConfirmation(status)) {
        setPendingBulk({ status, ids: selectedIds, controls });
        setConfirmOpen(true);
        return;
      }
      void runBulk(status, selectedIds, controls);
    },
    [bulkMutation, data, online, runBulk, t],
  );

  // Offline, every bulk action is off; the banner above the list says why.
  const bulkBlocked = bulkMutation.isSubmitting || !online;
  const bulkActions: BulkAction[] = [
    {
      label: t("orders.confirmSelected"),
      onClick: (ids, controls) => handleBulk("confirmed", ids, controls),
      icon: CheckCircle2,
      disabled: bulkBlocked,
    },
    {
      label: t("orders.shipSelected"),
      onClick: (ids, controls) => handleBulk("shipped", ids, controls),
      disabled: bulkBlocked,
    },
    {
      label: t("orders.cancelSelectedShort"),
      onClick: (ids, controls) => handleBulk("cancelled", ids, controls),
      variant: "destructive",
      icon: XCircle,
      disabled: bulkBlocked,
    },
    // R3-b: print one bon de livraison per selected order (contact-gated —
    // a slip without the delivery address is not worth paper).
    ...(fieldAccess.contact
      ? [
          {
            label: t("orders.slip.printSelected"),
            onClick: (ids: string[]) => handlePrintSlips(ids),
            icon: Printer,
            disabled: isPreparingSlips || !online,
          },
        ]
      : []),
    ...(fieldAccess.contact ? [shippingList.bulkAction] : []),
  ];

  const refetch = () => {
    void Promise.resolve(mutate()).catch(() => undefined);
  };

  if (error && !data) {
    return (
      <div className="space-y-3">
        <ListStatusBanner offline={!online} error={error} rows={undefined} onRefresh={refetch} />
        <ListErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  // Filtered-empty (nothing matched the active scope) stays distinct from the
  // first-use empty state: it offers to clear the filters instead of teaching.
  const emptyKind = ordersEmptyKind({ hasActiveFilters, statusFilter });
  const emptyState =
    emptyKind === "filtered" ? (
      <OrdersEmptyState filtered onClearFilters={clearFilters} />
    ) : emptyKind === "status" ? (
      <OrdersEmptyState statusView onShowAll={() => router.push("/orders")} />
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
      {fieldAccess.contact ? shippingList.button : null}
      <ListStatusBanner
        offline={!online}
        error={error}
        rows={data?.orders}
       
        onRefresh={refetch}
      />
      {bulkFailures ? (
        <BulkFailureNotice
          failures={bulkFailures.failures}
          total={bulkFailures.total}
          onDismiss={() => setBulkFailures(null)}
        />
      ) : null}
      <div aria-busy={isRefreshing}>
        <DataTable
          columns={columns}
          data={data?.orders ?? []}
          isLoading={isLoading}
          pagination={pagination}
          onRowClick={canOpenDetail ? (row) => router.push(`/orders/${row.id}`) : undefined}
          bulkActions={fieldAccess.update ? bulkActions : undefined}
          getRowId={(row) => row.id}
          refreshing={isRefreshing}
          getRowLabel={(row) => t("orders.workspace.selectOrder", { number: row.orderNumber })}
          emptyState={emptyState}
        />
      </div>
      {pendingBulk ? (
        <BulkConfirmDialog
          status={pendingBulk.status}
          count={pendingBulk.ids.length}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onConfirm={() => runBulk(pendingBulk.status, pendingBulk.ids, pendingBulk.controls)}
        />
      ) : null}
      {slipPrintRoot}
      {shippingList.printRoot}
    </div>
  );
}
