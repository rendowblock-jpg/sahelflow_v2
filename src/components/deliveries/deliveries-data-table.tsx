"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";

import { getBrandIcon } from "@/components/brand/brand-icons";
import { DataTable } from "@/components/data-table/data-table";
import { DeliveryRowActions } from "@/components/deliveries/delivery-row-actions";
import { DeliveryStatusCell } from "@/components/deliveries/delivery-status-cell";
import { TechnicalValue } from "@/components/i18n/technical-value";
import { DeliveriesEmptyState } from "@/components/shared/empty-states";
import { ListErrorState, ListStatusBanner } from "@/components/orders/list-status-banner";
import {
  useDeliveries,
  type DeliveryListItem,
  type DeliveriesResponse,
} from "@/hooks/swr/use-deliveries";
import { useI18n } from "@/hooks/use-i18n";
import { useOnlineStatus } from "@/hooks/use-online-status";
import type { Locale } from "@/lib/i18n";
import { deliveryProviderConfig, deliveryProviderLabel } from "@/lib/shared";
import { formatDZD, formatDate } from "@/lib/utils";
import { displayWilaya } from "@/lib/wilaya-display";

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
  const { data, error, isLoading, mutate, pagination } = useDeliveries({ fallback, status });
  const online = useOnlineStatus();
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
            className="text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {row.original.trackingNumber ? (
              <TechnicalValue data-tracking-number>{row.original.trackingNumber}</TechnicalValue>
            ) : (
              <span className="text-muted-foreground">{t("deliveries.noTracking")}</span>
            )}
          </Link>
        ) : (
          row.original.trackingNumber ? (
            <TechnicalValue className="text-xs" data-tracking-number>
              {row.original.trackingNumber}
            </TechnicalValue>
          ) : (
            <span className="text-xs text-muted-foreground">{t("deliveries.noTracking")}</span>
          )
        ),
      meta: { mobile: { slot: "title" } },
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
              className="text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              <TechnicalValue data-order-number>
                {row.original.order.orderNumber}
              </TechnicalValue>
            </Link>
          ) : (
            <TechnicalValue className="text-sm font-medium" data-order-number>
              {row.original.order.orderNumber}
            </TechnicalValue>
          )
        ) : (
          "—"
        ),
      meta: { mobile: { slot: "subtitle" } },
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
                  {displayWilaya(row.original.order?.wilaya, locale) || "—"}
                </div>
              </div>
            ),
            meta: { mobile: { slot: "field" as const } },
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
          <span className="text-sm">{deliveryProviderLabel(row.original.provider, t)}</span>
        );
      },
      meta: { hideOn: "sm", mobile: { slot: "field" } },
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
            meta: { align: "end" as const, hideOn: "md" as const, mobile: { slot: "amount" as const } },
            enableSorting: false,
          } satisfies ColumnDef<DeliveryListItem, unknown>,
        ]
      : []),
    {
      accessorKey: "status",
      header: () => t("deliveries.table.status"),
      cell: ({ row }) => <DeliveryStatusCell delivery={row.original} canManage={access.manage} />,
      meta: { align: "center", mobile: { slot: "status" } },
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
      meta: { hideOn: "2xl", mobile: { slot: "time" } },
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
      meta: { align: "end", width: "w-20", mobile: { slot: "actions" } },
      enableSorting: false,
    },
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

  return (
    <div className="space-y-3">
      <ListStatusBanner
        offline={!online}
        error={error}
        rows={data?.deliveries}
       
        onRefresh={refetch}
      />
      <DataTable
        columns={columns}
        data={data?.deliveries ?? []}
        isLoading={isLoading}
        pagination={pagination}
        onRowClick={canViewDetail ? (row) => router.push(`/deliveries/${row.id}`) : undefined}
        getRowId={(row) => row.id}
        emptyState={<DeliveriesEmptyState />}
      />
    </div>
  );
}
