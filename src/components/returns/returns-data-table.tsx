"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import { TechnicalValue } from "@/components/i18n/technical-value";
import { ReturnStatusBadge } from "@/components/returns/return-status-badge";
import { ReturnsEmptyState } from "@/components/shared/empty-states";
import { StateSurface } from "@/components/shared/state-surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useReturns,
  type ReturnListItem,
  type ReturnsResponse,
} from "@/hooks/swr/use-returns";
import { useI18n } from "@/hooks/use-i18n";
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
  const { data, error, isLoading, pagination } = useReturns({ fallback });
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
      enableSorting: false,
    },
    ...(access.contact
      ? [
          {
            id: "customer",
            header: () => t("returns.table.customer"),
            cell: ({ row }: { row: { original: ReturnListItem } }) =>
              row.original.order?.customer?.name ?? "—",
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
      enableSorting: false,
    },
    {
      accessorKey: "reason",
      header: () => t("returns.table.reason"),
      cell: ({ row }) => (
        <span className="block max-w-xs truncate text-muted-foreground">
          {row.original.reason}
        </span>
      ),
      meta: { hideOn: "md" },
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
          disabled={!access.manage}
        />
      ),
      meta: { align: "center" },
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
      meta: { hideOn: "lg" },
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
            meta: { align: "end" as const, width: "w-20" },
            enableSorting: false,
          } satisfies ColumnDef<ReturnListItem, unknown>,
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

  return (
    <DataTable
      columns={columns}
      data={data?.returns ?? []}
      isLoading={isLoading}
      pagination={pagination}
      onRowClick={canViewDetail ? (row) => router.push(`/orders/${row.orderId}`) : undefined}
      getRowId={(row) => row.id}
      emptyState={<ReturnsEmptyState />}
    />
  );
}
