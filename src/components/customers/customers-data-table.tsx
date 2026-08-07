"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Ban } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
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
  const router = useRouter();
  const { data, error, isLoading, pagination } = useCustomers({ fallback });

  const columns: ColumnDef<CustomerListItem, unknown>[] = [
    {
      accessorKey: "name",
      header: () => t("customers.name"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Link
            href={`/customers/${row.original.id}`}
            className="font-medium text-primary hover:underline"
          >
            {row.original.name ?? t("inbox.restrictedContact")}
          </Link>
          {row.original.isBlacklisted === true ? (
            <Badge
              variant="outline"
              className="gap-1 border-destructive/20 bg-destructive/10 text-destructive"
            >
              <Ban className="size-3" aria-hidden="true" />
              {t("customers.blacklisted")}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "phone",
      header: () => t("customers.phone"),
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.phone ?? "—"}</span>
      ),
    },
    {
      accessorKey: "wilaya",
      header: () => t("customers.wilaya"),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.wilaya ?? "—"}</span>
      ),
      meta: { hideOn: "sm" },
    },
    {
      accessorKey: "orderCount",
      header: () => t("customers.orders"),
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.orderCount}</span>
      ),
      meta: { align: "end" },
    },
    {
      accessorKey: "totalSpent",
      header: () => t("customers.totalSpent"),
      cell: ({ row }) => (
        <span className="tabular-nums font-medium">
          {row.original.totalSpent === null
            ? "—"
            : formatDZD(row.original.totalSpent, locale)}
        </span>
      ),
      meta: { align: "end" },
    },
    {
      accessorKey: "createdAt",
      header: () => t("customers.joined"),
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
      data={data?.customers ?? []}
      isLoading={isLoading}
      pagination={pagination}
      onRowClick={(row) => router.push(`/customers/${row.id}`)}
      getRowId={(row) => row.id}
      emptyState={<CustomersEmptyState />}
    />
  );
}
