"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { getBrandIcon } from "@/components/brand/brand-icons";
import { DataTable } from "@/components/data-table/data-table";
import { DeliveryRowActions } from "@/components/deliveries/delivery-row-actions";
import { DeliveryStatusBadge } from "@/components/deliveries/delivery-status-badge";
import { DeliveriesEmptyState } from "@/components/shared/empty-states";
import { StateSurface } from "@/components/shared/state-surface";
import {
  useDeliveries,
  type DeliveryListItem,
  type DeliveriesResponse,
} from "@/hooks/swr/use-deliveries";
import { useI18n } from "@/hooks/use-i18n";
import type { Locale } from "@/lib/i18n";
import { deliveryProviderConfig } from "@/lib/shared";
import { formatDZD, formatDate } from "@/lib/utils";

interface DeliveriesDataTableProps {
  fallback: DeliveriesResponse;
  status: string;
  locale: Locale;
}

export function DeliveriesDataTable({
  fallback,
  status,
  locale,
}: DeliveriesDataTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { data, error, isLoading, pagination } = useDeliveries({ fallback, status });
  const access = data?.fieldAccess ?? fallback.fieldAccess;
  const canViewDetail = access.contact && access.financials;

  const columns: ColumnDef<DeliveryListItem, unknown>[] = [
    {
      accessorKey: "trackingNumber",
      header: () => t("deliveries.table.tracking"),
      cell: ({ row }) =>
        canViewDetail ? (
          <Link
            href={`/deliveries/${row.original.id}`}
            className="font-mono text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {row.original.trackingNumber ?? row.original.id}
          </Link>
        ) : (
          <span className="font-mono text-xs">
            {row.original.trackingNumber ?? row.original.id}
          </span>
        ),
    },
    {
      id: "order",
      accessorKey: "order.orderNumber",
      header: () => t("deliveries.table.order"),
      cell: ({ row }) =>
        row.original.order ? (
          canViewDetail ? (
            <Link
              href={`/orders/${row.original.order.id}`}
              className="font-mono text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.original.order.orderNumber}
            </Link>
          ) : (
            <span className="font-mono text-sm font-medium">
              {row.original.order.orderNumber}
            </span>
          )
        ) : (
          "—"
        ),
      enableSorting: false,
    },
    ...(access.contact
      ? [
          {
            id: "customer",
            header: () => t("deliveries.table.customer"),
            cell: ({ row }: { row: { original: DeliveryListItem } }) => (
              <div>
                <div className="text-sm font-medium">
                  {row.original.order?.customer?.name ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {row.original.order?.wilaya ?? "—"}
                </div>
              </div>
            ),
            enableSorting: false,
          } satisfies ColumnDef<DeliveryListItem, unknown>,
        ]
      : []),
    {
      accessorKey: "provider",
      header: () => t("deliveries.table.carrier"),
      cell: ({ row }) => {
        const config = deliveryProviderConfig[row.original.provider];
        const BrandIcon = getBrandIcon(row.original.provider);
        return config ? (
          <span className="inline-flex items-center gap-1.5 text-sm">
            {BrandIcon ? (
              <BrandIcon className="size-4 text-muted-foreground" />
            ) : (
              <span className="size-2 rounded-full bg-muted-foreground" aria-hidden="true" />
            )}
            {config.label}
          </span>
        ) : (
          <span className="text-sm">{row.original.provider}</span>
        );
      },
      meta: { hideOn: "sm" },
      enableSorting: false,
    },
    ...(access.financials
      ? [
          {
            accessorKey: "cost",
            header: () => t("deliveries.table.cost"),
            cell: ({ row }: { row: { original: DeliveryListItem } }) => (
              <span className="tabular-nums">
                {row.original.cost != null ? formatDZD(row.original.cost, locale) : "—"}
              </span>
            ),
            meta: { align: "end" as const, hideOn: "md" as const },
            enableSorting: false,
          } satisfies ColumnDef<DeliveryListItem, unknown>,
        ]
      : []),
    {
      accessorKey: "status",
      header: () => t("deliveries.table.status"),
      cell: ({ row }) => (
        <DeliveryStatusBadge
          deliveryId={row.original.id}
          status={row.original.status}
          size="sm"
          disabled={!access.manage}
        />
      ),
      meta: { align: "center" },
      enableSorting: false,
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
      enableSorting: false,
    },
    {
      id: "actions",
      header: () => t("deliveries.table.action"),
      cell: ({ row }) => (
        <DeliveryRowActions
          deliveryId={row.original.id}
          provider={row.original.provider}
          trackingNumber={row.original.trackingNumber}
          canManage={access.manage}
          canViewDetail={canViewDetail}
        />
      ),
      meta: { align: "end", width: "w-20" },
      enableSorting: false,
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
      data={data?.deliveries ?? []}
      isLoading={isLoading}
      pagination={pagination}
      onRowClick={canViewDetail ? (row) => router.push(`/deliveries/${row.id}`) : undefined}
      getRowId={(row) => row.id}
      emptyState={<DeliveriesEmptyState />}
    />
  );
}
