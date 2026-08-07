"use client";

import { AlertTriangle, Ban } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import { EntityLink } from "@/components/shared/entity-link";
import { CustomersEmptyState } from "@/components/shared/empty-states";
import { StateSurface } from "@/components/shared/state-surface";
import { Badge } from "@/components/ui/badge";
import {
  useCustomers,
  type CustomerListItem,
  type CustomersResponse,
} from "@/hooks/swr/use-customers";
import { useI18n } from "@/hooks/use-i18n";
import type { Locale } from "@/lib/i18n";
import { formatDZD, formatDate } from "@/lib/utils";

interface CustomersDataTableProps {
  fallback: CustomersResponse;
  locale: Locale;
}

export function CustomersDataTable({ fallback, locale }: CustomersDataTableProps) {
  const { t } = useI18n();
  const { data, error, isLoading, pagination } = useCustomers({ fallback });
  const response = data ?? fallback;
  const access = response.fieldAccess;

  const columns: ColumnDef<CustomerListItem, unknown>[] = [
    {
      accessorKey: "name",
      header: () => t("customers.name"),
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <EntityLink href={`/customers/${row.original.id}`}>
            {row.original.name ?? t("inbox.restrictedContact")}
          </EntityLink>
          {access.risk && row.original.isBlacklisted ? (
            <Badge variant="outline" className="gap-1 border-destructive/20 bg-destructive/5 text-destructive">
              <Ban className="size-3" aria-hidden="true" />
              {t("customers.blacklisted")}
            </Badge>
          ) : null}
        </div>
      ),
    },
    ...(access.contact
      ? [
          {
            accessorKey: "phone",
            header: () => t("customers.phone"),
            enableSorting: false,
            cell: ({ row }: { row: { original: CustomerListItem } }) => (
              <span className="font-mono text-sm">{row.original.phone ?? "—"}</span>
            ),
          } satisfies ColumnDef<CustomerListItem, unknown>,
          {
            accessorKey: "wilaya",
            header: () => t("customers.wilaya"),
            enableSorting: false,
            cell: ({ row }: { row: { original: CustomerListItem } }) => (
              <span className="text-sm">{row.original.wilaya ?? "—"}</span>
            ),
            meta: { hideOn: "sm" as const },
          } satisfies ColumnDef<CustomerListItem, unknown>,
        ]
      : []),
    {
      accessorKey: "orderCount",
      header: () => t("customers.orders"),
      enableSorting: false,
      cell: ({ row }) => <span className="tabular-nums">{row.original.orderCount}</span>,
      meta: { align: "end" },
    },
    ...(access.financials
      ? [
          {
            accessorKey: "totalSpent",
            header: () => t("customers.totalSpent"),
            enableSorting: false,
            cell: ({ row }: { row: { original: CustomerListItem } }) => (
              <span className="tabular-nums font-medium">
                {formatDZD(row.original.totalSpent ?? 0, locale)}
              </span>
            ),
            meta: { align: "end" as const },
          } satisfies ColumnDef<CustomerListItem, unknown>,
        ]
      : []),
    {
      accessorKey: "createdAt",
      header: () => t("customers.joined"),
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.createdAt, locale)}
        </span>
      ),
      meta: { hideOn: "lg" },
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
      data={response.customers}
      isLoading={isLoading}
      pagination={pagination}
      getRowId={(row) => row.id}
      emptyState={<CustomersEmptyState />}
    />
  );
}
