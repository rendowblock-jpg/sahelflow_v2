"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import { TechnicalValue } from "@/components/i18n/technical-value";
import { ReturnStatusBadge } from "@/components/returns/return-status-badge";
import { ReturnsEmptyState } from "@/components/shared/empty-states";
import { ListErrorState, ListStatusBanner } from "@/components/orders/list-status-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useReturns,
  type ReturnListItem,
  type ReturnsResponse,
} from "@/hooks/swr/use-returns";
import { useI18n } from "@/hooks/use-i18n";
import { useOnlineStatus } from "@/hooks/use-online-status";
import type { Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";

const TYPE_I18N: Record<string, string> = {
  return: "returns.type.return",
  exchange: "returns.type.exchange",
};

interface ReturnsDataTableProps {
  fallback: ReturnsResponse;
  locale: Locale;
}

export function ReturnsDataTable({ fallback, locale }: ReturnsDataTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { data, error, isLoading, mutate, pagination } = useReturns({ fallback });
  const online = useOnlineStatus();
  const access = data?.fieldAccess ?? fallback.fieldAccess;
  const canViewDetail = access.contact && access.financials;

  const columns: ColumnDef<ReturnListItem, unknown>[] = [
    {
      id: "order",
      accessorKey: "order.orderNumber",
      header: () => t("returns.table.order"),
      cell: ({ row }) =>
        canViewDetail ? (
          <Link
            href={`/orders/${row.original.orderId}`}
            className="text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <TechnicalValue data-order-number>
              {row.original.order?.orderNumber ?? "—"}
            </TechnicalValue>
          </Link>
        ) : (
          <TechnicalValue className="text-sm font-medium" data-order-number>
            {row.original.order?.orderNumber ?? "—"}
          </TechnicalValue>
        ),
      meta: { mobile: { slot: "title" } },
      enableSorting: false,
    },
    ...(access.contact
      ? [
          {
            id: "customer",
            header: () => t("returns.table.customer"),
            cell: ({ row }: { row: { original: ReturnListItem } }) =>
              row.original.order?.customer?.name ?? "—",
            meta: { mobile: { slot: "subtitle" as const } },
            enableSorting: false,
          } satisfies ColumnDef<ReturnListItem, unknown>,
        ]
      : []),
    {
      accessorKey: "type",
      header: () => t("returns.table.type"),
      cell: ({ row }) => (
        <Badge variant="outline">
          {t(TYPE_I18N[row.original.type] ?? row.original.type)}
        </Badge>
      ),
      meta: { mobile: { slot: "field" } },
      enableSorting: false,
    },
    {
      accessorKey: "reason",
      header: () => t("returns.table.reason"),
      cell: ({ row }) => <span>{row.original.reason}</span>,
      // Seller free-text — wrap it instead of silently clipping (F26).
      meta: { hideOn: "md", wrap: true, mobile: { slot: "field" } },
      enableSorting: false,
    },
    {
      accessorKey: "status",
      header: () => t("returns.table.status"),
      cell: ({ row }) => (
        <ReturnStatusBadge
          returnId={row.original.id}
          status={row.original.status as "requested" | "approved" | "rejected" | "completed"}
          size="sm"
          disabled={!access.manage || !online}
        />
      ),
      meta: { align: "center", mobile: { slot: "status" } },
      enableSorting: false,
    },
    {
      accessorKey: "createdAt",
      header: () => t("returns.table.date"),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.createdAt, locale)}
        </span>
      ),
      meta: { hideOn: "lg", mobile: { slot: "time" } },
      enableSorting: false,
    },
    ...(canViewDetail
      ? [
          {
            id: "actions",
            header: () => t("returns.table.action"),
            cell: ({ row }: { row: { original: ReturnListItem } }) => (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/orders/${row.original.orderId}`}>{t("returns.view")}</Link>
              </Button>
            ),
            meta: { align: "end" as const, width: "w-20", mobile: { slot: "actions" as const } },
            enableSorting: false,
          } satisfies ColumnDef<ReturnListItem, unknown>,
        ]
      : []),
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
        rows={data?.returns}
       
        onRefresh={refetch}
      />
      <DataTable
        columns={columns}
        data={data?.returns ?? []}
        isLoading={isLoading}
        pagination={pagination}
        onRowClick={canViewDetail ? (row) => router.push(`/orders/${row.orderId}`) : undefined}
        getRowId={(row) => row.id}
        emptyState={<ReturnsEmptyState />}
      />
    </div>
  );
}
