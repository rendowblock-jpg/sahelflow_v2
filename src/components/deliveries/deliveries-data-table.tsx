"use client";

/**
 * DeliveriesDataTable — DataTable v2 wrapper for the deliveries list page.
 *
 * Replaces the old PremiumTable + take:200 pattern. Paginated, skeleton
 * loading, density toggle, URL-synced sort/page. Row click navigates to the
 * delivery detail page.
 */
import { useRouter } from "next/navigation";
import { DataTable, selectColumn } from "@/components/data-table/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { DeliveriesEmptyState } from "@/components/shared/empty-states";
import { useDeliveries, type DeliveryListItem, type DeliveriesResponse } from "@/hooks/swr/use-deliveries";
import { useI18n } from "@/hooks/use-i18n";
import { formatDZD, formatDate } from "@/lib/utils";
import { DeliveryStatusBadge } from "@/components/deliveries/delivery-status-badge";
import { DeliveryRowActions } from "@/components/deliveries/delivery-row-actions";
import { getBrandIcon } from "@/components/brand/brand-icons";
import { deliveryProviderConfig } from "@/lib/shared";

import Link from "next/link";
import type { Locale } from "@/lib/i18n";

interface DeliveriesDataTableProps {
  fallback: DeliveriesResponse;
  status: string;
  locale: Locale;
}

export function DeliveriesDataTable({ fallback, status, locale }: DeliveriesDataTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { data, isLoading, pagination } = useDeliveries({ fallback, status });

  const columns: ColumnDef<DeliveryListItem, unknown>[] = [
    selectColumn<DeliveryListItem>(),
    {
      accessorKey: "trackingNumber",
      header: () => t("deliveries.table.tracking"),
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.trackingNumber ?? "—"}</span>
      ),
    },
    {
      id: "order",
      accessorKey: "order.orderNumber",
      header: () => t("deliveries.table.order"),
      cell: ({ row }) =>
        row.original.order ? (
          <Link
            href={`/orders/${row.original.order.id}`}
            className="font-mono text-sm font-medium text-primary hover:underline"
          >
            {row.original.order.orderNumber}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      id: "customer",
      header: () => t("deliveries.table.customer"),
      cell: ({ row }) => (
        <div>
          <div className="text-sm font-medium">{row.original.order?.customer?.name ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{row.original.order?.wilaya ?? "—"}</div>
        </div>
      ),
    },
    {
      accessorKey: "provider",
      header: () => t("deliveries.table.carrier"),
      cell: ({ row }) => {
        const config = deliveryProviderConfig[row.original.provider];
        const BrandIcon = getBrandIcon(row.original.provider);
        return config ? (
          <span className="inline-flex items-center gap-1.5 text-sm">
            {BrandIcon ? (
              <BrandIcon className="h-4 w-4 text-muted-foreground" />
            ) : (
              <span className={`size-2 rounded-full ${config.color}`} />
            )}
            {config.label}
          </span>
        ) : (
          <span className="text-sm">{row.original.provider}</span>
        );
      },
      meta: { hideOn: "sm" },
    },
    {
      accessorKey: "cost",
      header: () => t("deliveries.table.cost"),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.cost != null ? formatDZD(row.original.cost) : "—"}
        </span>
      ),
      meta: { align: "end", hideOn: "md" },
    },
    {
      accessorKey: "status",
      header: () => t("deliveries.table.status"),
      cell: ({ row }) => (
        <DeliveryStatusBadge deliveryId={row.original.id} status={row.original.status} size="sm" />
      ),
      meta: { align: "center" },
    },
    {
      accessorKey: "createdAt",
      header: () => t("deliveries.table.date"),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.createdAt, locale)}
        </span>
      ),
      meta: { hideOn: "lg" },
    },
    {
      id: "actions",
      header: () => t("deliveries.table.action"),
      cell: ({ row }) => (
        <DeliveryRowActions
          deliveryId={row.original.id}
          provider={row.original.provider}
          trackingNumber={row.original.trackingNumber}
          orderId={row.original.order?.id ?? null}
        />
      ),
      meta: { align: "end", width: "w-20" },
      enableSorting: false,
    },
  ];

  const deliveries = data?.deliveries ?? fallback.deliveries;

  return (
    <DataTable
      columns={columns}
      data={deliveries}
      isLoading={isLoading}
      pagination={pagination}
      onRowClick={(row) => router.push(`/deliveries/${row.id}`)}
      getRowId={(row) => row.id}
      emptyState={<DeliveriesEmptyState />}
    />
  );
}
