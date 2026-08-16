"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, Eye } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import {
  EntityInspector,
  EntityLink,
  EntityPreview,
} from "@/components/entities/entity-context";
import { CustomersEmptyState } from "@/components/shared/empty-states";
import { StateSurface } from "@/components/shared/state-surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
          <EntityLink
            href={`/customers/${row.original.id}`}
            label={row.original.name ?? t("inbox.restrictedContact")}
          />
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
        <span dir="ltr" className="font-mono text-sm">
          {row.original.phone ?? "—"}
        </span>
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
    {
      id: "context",
      header: () => t("common.actions"),
      cell: ({ row }) => {
        const customer = row.original;
        const label = customer.name ?? t("inbox.restrictedContact");
        return (
          <EntityInspector
            title={label}
            description={
              customer.phone ? <bdi dir="ltr">{customer.phone}</bdi> : undefined
            }
            fullHref={`/customers/${customer.id}`}
            fullLabel={t("common.view")}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("common.view")}
              >
                <Eye className="size-4" aria-hidden="true" />
              </Button>
            }
          >
            <EntityPreview
              title={label}
              description={customer.wilaya ?? undefined}
              metadata={formatDate(customer.createdAt, locale)}
            >
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("customers.orders")}</dt>
                  <dd className="mt-1 font-medium tabular-nums">{customer.orderCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("customers.totalSpent")}</dt>
                  <dd className="mt-1 font-medium tabular-nums">
                    {customer.totalSpent === null
                      ? "—"
                      : formatDZD(customer.totalSpent, locale)}
                  </dd>
                </div>
              </dl>
            </EntityPreview>
          </EntityInspector>
        );
      },
      meta: { align: "end", width: "w-12" },
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
      data={data?.customers ?? []}
      isLoading={isLoading}
      pagination={pagination}
      onRowClick={(row) => router.push(`/customers/${row.id}`)}
      getRowId={(row) => row.id}
      emptyState={<CustomersEmptyState />}
    />
  );
}
