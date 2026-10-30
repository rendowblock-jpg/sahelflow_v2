"use client";

import { useRouter } from "next/navigation";
import { Ban, Eye } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import {
  EntityInspector,
  EntityLink,
  EntityPreview,
} from "@/components/entities/entity-context";
import { TechnicalValue } from "@/components/i18n/technical-value";
import { ListSearchInput } from "@/components/shared/list-search-input";
import { CustomersEmptyState } from "@/components/shared/empty-states";
import { resolveState } from "@/components/shared/resolve-state";
import { StateView } from "@/components/shared/state-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useCustomers,
  type CustomerListItem,
  type CustomersResponse,
} from "@/hooks/swr/use-customers";
import { useI18n } from "@/hooks/use-i18n";
import { useListSearchScope } from "@/hooks/use-list-search-scope";
import type { Locale } from "@/lib/i18n";
import { formatDZD, formatDate } from "@/lib/utils";
import { translateServerError } from "@/lib/i18n/translate-server-error";
import { displayWilaya } from "@/lib/wilaya-display";

interface CustomersDataTableProps {
  fallback: CustomersResponse;
  locale: Locale;
}

export function CustomersDataTable({ fallback, locale }: CustomersDataTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { hasActiveFilters, clearFilters } = useListSearchScope();
  const { data, error, isLoading, mutate, pagination } = useCustomers({ fallback });
  // Rows we hold are kept when a refresh fails (partial); a retry in flight shows the skeleton, not the old error.
  const state = resolveState({ loading: isLoading, error, data });

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
              className="gap-1 border-destructive/20 bg-destructive-soft text-destructive"
            >
              <Ban className="size-3" aria-hidden="true" />
              {t("customers.blacklisted")}
            </Badge>
          ) : null}
        </div>
      ),
      meta: { mobile: { slot: "title" } },
    },
    {
      accessorKey: "phone",
      header: () => t("customers.phone"),
      cell: ({ row }) => (
        <TechnicalValue className="text-sm">
          {row.original.phone ?? "—"}
        </TechnicalValue>
      ),
      meta: { mobile: { slot: "subtitle" } },
    },
    {
      accessorKey: "wilaya",
      header: () => t("customers.wilaya"),
      cell: ({ row }) => (
        <span className="text-sm">{displayWilaya(row.original.wilaya, locale) || "—"}</span>
      ),
      meta: { hideOn: "sm", mobile: { slot: "field" } },
    },
    {
      accessorKey: "orderCount",
      header: () => t("customers.orders"),
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.orderCount}</span>
      ),
      meta: { align: "end", mobile: { slot: "field" } },
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
      meta: { align: "end", mobile: { slot: "amount" } },
    },
    {
      accessorKey: "createdAt",
      header: () => t("customers.joined"),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.createdAt, locale)}
        </span>
      ),
      meta: { hideOn: "lg", mobile: { slot: "time" } },
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
              customer.phone ? (
                <TechnicalValue>{customer.phone}</TechnicalValue>
              ) : undefined
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
              description={displayWilaya(customer.wilaya, locale) || undefined}
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
      meta: { align: "end", width: "w-12", mobile: { slot: "actions" } },
      enableSorting: false,
    },
  ];

  return (
    <div className="space-y-3">
      <ListSearchInput
        className="max-w-sm"
        placeholder={t("customers.searchPlaceholder")}
      />
      {state === "error" ? (
        <StateView
          kind="error"
          size="inline"
          title={t("error.requestFailed")}
          description={translateServerError(error?.message ?? "", t, t("error.requestFailed"))}
          onRetry={() => void mutate()}
        />
      ) : (
        <>
          {state === "partial" ? <StateView kind="partial" onRefresh={() => void mutate()} /> : null}
          <DataTable
            columns={columns}
            data={data?.customers ?? []}
            isLoading={isLoading}
            pagination={pagination}
            onRowClick={(row) => router.push(`/customers/${row.id}`)}
            getRowId={(row) => row.id}
            emptyState={
              hasActiveFilters ? (
                <CustomersEmptyState filtered onClearFilters={clearFilters} />
              ) : (
                <CustomersEmptyState />
              )
            }
          />
        </>
      )}
    </div>
  );
}
