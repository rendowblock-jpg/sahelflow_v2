"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { selectColumn } from "@/components/data-table/data-table";
import { CustomersEmptyState } from "@/components/shared/empty-states";
import { useCustomers, type CustomerListItem, type CustomersResponse } from "@/hooks/swr/use-customers";
import { useI18n } from "@/hooks/use-i18n";
import { formatDZD, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Ban } from "lucide-react";
import type { Locale } from "@/lib/i18n";

interface CustomersDataTableProps {
  fallback: CustomersResponse;
  locale: Locale;
}

export function CustomersDataTable({ fallback, locale }: CustomersDataTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { data, isLoading, pagination } = useCustomers({ fallback });

  const columns: ColumnDef<CustomerListItem, unknown>[] = [
    selectColumn<CustomerListItem>(),
    {
      accessorKey: "name",
      header: () => t("customers.name"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.name}</span>
          {row.original.isBlacklisted && (
            <Badge variant="outline" className="border-red-500/20 bg-red-500/10 text-destructive gap-1">
              <Ban className="h-3 w-3" /> {t("customers.blacklisted")}
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "phone",
      header: () => t("customers.phone"),
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.phone}</span>,
    },
    {
      accessorKey: "wilaya",
      header: () => t("customers.wilaya"),
      cell: ({ row }) => <span className="text-sm">{row.original.wilaya ?? "—"}</span>,
      meta: { hideOn: "sm" },
    },
    {
      accessorKey: "orderCount",
      header: () => t("customers.orders"),
      cell: ({ row }) => <span className="tabular-nums">{row.original.orderCount}</span>,
      meta: { align: "end" },
    },
    {
      accessorKey: "totalSpent",
      header: () => t("customers.totalSpent"),
      cell: ({ row }) => (
        <span className="tabular-nums font-medium">
          {row.original.totalSpent === null
            ? "—"
            : formatDZD(row.original.totalSpent)}
        </span>
      ),
      meta: { align: "end" },
    },
    {
      accessorKey: "createdAt",
      header: () => t("customers.joined"),
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDate(row.original.createdAt, locale)}</span>,
      meta: { hideOn: "lg" },
    },
  ];

  const customers = data?.customers ?? fallback.customers;

  return (
    <DataTable
      columns={columns}
      data={customers}
      isLoading={isLoading}
      pagination={pagination}
      onRowClick={(row) => router.push(`/customers/${row.id}`)}
      getRowId={(row) => row.id}
      emptyState={<CustomersEmptyState />}
    />
  );
}
