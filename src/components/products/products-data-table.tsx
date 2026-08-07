"use client";

import { AlertTriangle } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import { EntityLink } from "@/components/shared/entity-link";
import { ProductsEmptyState } from "@/components/shared/empty-states";
import { StateSurface } from "@/components/shared/state-surface";
import { Badge } from "@/components/ui/badge";
import {
  useProducts,
  type ProductListItem,
  type ProductsResponse,
} from "@/hooks/swr/use-products";
import { useI18n } from "@/hooks/use-i18n";
import { formatDZD, formatDate } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";

interface ProductsDataTableProps {
  fallback: ProductsResponse;
  locale: Locale;
}

export function ProductsDataTable({ fallback, locale }: ProductsDataTableProps) {
  const { t } = useI18n();
  const { data, error, isLoading, pagination } = useProducts({ fallback });
  const response = data ?? fallback;
  const access = response.fieldAccess;

  const columns: ColumnDef<ProductListItem, unknown>[] = [
    {
      accessorKey: "name",
      header: () => t("products.productName"),
      enableSorting: false,
      cell: ({ row }) => (
        <EntityLink
          href={`/products/${row.original.id}`}
          secondary={row.original.sku ?? undefined}
        >
          {row.original.name}
        </EntityLink>
      ),
    },
    {
      accessorKey: "categoryName",
      header: () => t("products.category"),
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.categoryName ?? "—"}
        </span>
      ),
      meta: { hideOn: "lg" },
    },
    {
      accessorKey: "price",
      header: () => t("orders.price"),
      cell: ({ row }) => (
        <span className="tabular-nums">{formatDZD(row.original.price, locale)}</span>
      ),
      meta: { align: "end" },
    },
    ...(access.cost
      ? [
          {
            accessorKey: "cost",
            header: () => t("products.cost"),
            cell: ({ row }: { row: { original: ProductListItem } }) => (
              <span className="tabular-nums text-muted-foreground">
                {row.original.cost == null ? "—" : formatDZD(row.original.cost, locale)}
              </span>
            ),
            meta: { align: "end" as const, hideOn: "md" as const },
          } satisfies ColumnDef<ProductListItem, unknown>,
        ]
      : []),
    {
      accessorKey: "stock",
      header: () => t("products.stock"),
      cell: ({ row }) => {
        const low = row.original.stock <= row.original.lowStockThreshold;
        return (
          <span className="flex items-center justify-end gap-1.5 tabular-nums">
            <span className={low ? "font-medium text-destructive" : ""}>
              {row.original.stock}
            </span>
            {low ? (
              <Badge variant="outline" className="gap-1 border-warning/25 text-warning">
                <AlertTriangle className="size-3" aria-hidden="true" />
                {t("products.low")}
              </Badge>
            ) : null}
          </span>
        );
      },
      meta: { align: "end" },
    },
    {
      accessorKey: "isActive",
      header: () => t("common.status"),
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "secondary" : "outline"}>
          {row.original.isActive ? t("common.active") : t("common.inactive")}
        </Badge>
      ),
      meta: { align: "center", hideOn: "sm" },
    },
    {
      accessorKey: "createdAt",
      header: () => t("common.date"),
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
      data={response.products}
      isLoading={isLoading}
      pagination={pagination}
      getRowId={(row) => row.id}
      emptyState={<ProductsEmptyState />}
    />
  );
}
