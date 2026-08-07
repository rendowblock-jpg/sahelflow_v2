"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Eye } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import { ProductsEmptyState } from "@/components/shared/empty-states";
import { StateSurface } from "@/components/shared/state-surface";
import { ProductRowActions } from "@/components/products/product-row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useProducts,
  type ProductListItem,
  type ProductsResponse,
} from "@/hooks/swr/use-products";
import { useI18n } from "@/hooks/use-i18n";
import { formatDZD } from "@/lib/utils";
import type { Category } from "@/types/domain";

interface ProductsDataTableProps {
  fallback: ProductsResponse;
  categories: Category[];
}

export function ProductsDataTable({ fallback, categories }: ProductsDataTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { data, error, isLoading, pagination } = useProducts({ fallback });
  const fieldAccess = data?.fieldAccess ?? fallback.fieldAccess;
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  const columns: ColumnDef<ProductListItem, unknown>[] = [
    {
      accessorKey: "name",
      header: () => t("products.productName"),
      cell: ({ row }) => (
        <Link
          href={`/products/${row.original.id}`}
          className="font-medium text-primary hover:underline"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "sku",
      header: () => t("products.sku"),
      cell: ({ row }) => (
        <span className="font-mono text-sm text-muted-foreground">
          {row.original.sku ?? "—"}
        </span>
      ),
      meta: { hideOn: "md" },
    },
    {
      accessorKey: "categoryId",
      header: () => t("products.category"),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.categoryId
            ? (categoryNames.get(row.original.categoryId) ?? "—")
            : "—"}
        </span>
      ),
      meta: { hideOn: "lg" },
    },
    {
      accessorKey: "price",
      header: () => t("orders.price"),
      cell: ({ row }) => (
        <span className="tabular-nums">{formatDZD(row.original.price)}</span>
      ),
      meta: { align: "end" },
    },
    {
      accessorKey: "stock",
      header: () => t("products.stock"),
      cell: ({ row }) => {
        const isLowStock = row.original.stock <= row.original.lowStockThreshold;
        return (
          <span className="flex items-center justify-end gap-1.5 tabular-nums">
            <span className={isLowStock ? "font-medium text-destructive" : ""}>
              {row.original.stock}
            </span>
            {isLowStock ? (
              <Badge variant="destructive" className="gap-0.5 py-0">
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
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "secondary" : "outline"}>
          {row.original.isActive ? t("common.active") : t("common.inactive")}
        </Badge>
      ),
      meta: { align: "center", hideOn: "sm" },
    },
    {
      id: "actions",
      header: () => t("common.actions"),
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={`/products/${row.original.id}`}>
              <Eye className="size-4" aria-hidden="true" />
              <span className="sr-only">
                {t("products.viewDetails", { name: row.original.name })}
              </span>
            </Link>
          </Button>
          {fieldAccess.manage ? (
            <ProductRowActions
              product={row.original}
              categories={categories}
            />
          ) : null}
        </div>
      ),
      meta: { align: "end", width: "w-20" },
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
      data={data?.products ?? []}
      isLoading={isLoading}
      pagination={pagination}
      onRowClick={(row) => router.push(`/products/${row.id}`)}
      getRowId={(row) => row.id}
      emptyState={<ProductsEmptyState />}
    />
  );
}
