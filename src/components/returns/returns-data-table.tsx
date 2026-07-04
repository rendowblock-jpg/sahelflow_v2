"use client";

/**
 * ReturnsDataTable — DataTable v2 wrapper for the returns list page.
 */
import { useRouter } from "next/navigation";
import { DataTable, selectColumn } from "@/components/data-table/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { ReturnsEmptyState } from "@/components/shared/empty-states";
import { useReturns, type ReturnListItem, type ReturnsResponse } from "@/hooks/swr/use-returns";
import { useI18n } from "@/hooks/use-i18n";
import { formatDate } from "@/lib/utils";
import { ReturnStatusBadge } from "@/components/returns/return-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import Link from "next/link";
import type { Locale } from "@/lib/i18n";

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
  const { data, isLoading, pagination } = useReturns({ fallback });

  const columns: ColumnDef<ReturnListItem, unknown>[] = [
    selectColumn<ReturnListItem>(),
    {
      id: "order",
      accessorKey: "order.orderNumber",
      header: () => t("returns.table.order") || "Order",
      cell: ({ row }) => (
        <Link
          href={`/orders/${row.original.orderId}`}
          className="font-mono text-sm font-medium text-primary hover:underline"
        >
          {row.original.order?.orderNumber ?? "—"}
        </Link>
      ),
    },
    {
      id: "customer",
      header: () => t("returns.table.customer") || "Customer",
      cell: ({ row }) => row.original.order?.customer?.name ?? "—",
    },
    {
      accessorKey: "type",
      header: () => t("returns.table.type") || "Type",
      cell: ({ row }) => (
        <Badge variant="outline">{t(TYPE_I18N[row.original.type] ?? row.original.type)}</Badge>
      ),
    },
    {
      accessorKey: "reason",
      header: () => t("returns.table.reason") || "Reason",
      cell: ({ row }) => (
        <span className="text-muted-foreground max-w-xs truncate block">
          {row.original.reason}
        </span>
      ),
      meta: { hideOn: "md" },
    },
    {
      accessorKey: "status",
      header: () => t("returns.table.status") || "Status",
      cell: ({ row }) => (
        <ReturnStatusBadge
          returnId={row.original.id}
          status={row.original.status as "requested" | "approved" | "rejected" | "completed"}
          size="sm"
        />
      ),
      meta: { align: "center" },
    },
    {
      accessorKey: "createdAt",
      header: () => t("returns.table.date") || "Date",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.createdAt, locale)}
        </span>
      ),
      meta: { hideOn: "lg" },
    },
    {
      id: "actions",
      header: () => t("returns.table.action") || "Actions",
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/orders/${row.original.orderId}`}>{t("returns.view") || "View"}</Link>
        </Button>
      ),
      meta: { align: "end", width: "w-20" },
      enableSorting: false,
    },
  ];

  const returns = data?.returns ?? fallback.returns;

  return (
    <DataTable
      columns={columns}
      data={returns}
      isLoading={isLoading}
      pagination={pagination}
      onRowClick={(row) => router.push(`/orders/${row.orderId}`)}
      getRowId={(row) => row.id}
      emptyState={<ReturnsEmptyState />}
    />
  );
}
