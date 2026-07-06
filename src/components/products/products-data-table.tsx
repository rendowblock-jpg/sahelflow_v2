"use client";

/**
 * ProductsDataTable — DataTable v2 wrapper for the products list page.
 *
 * Replaces the old PremiumTable + take:200 pattern with paginated,
 * skeleton-loading, density-toggleable, URL-synced table (Phase 1 pattern).
 */
import { useRouter } from "next/navigation";
import { DataTable, selectColumn } from "@/components/data-table/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { ProductsEmptyState } from "@/components/shared/empty-states";
import { useProducts, type ProductListItem, type ProductsResponse } from "@/hooks/swr/use-products";
import { useI18n } from "@/hooks/use-i18n";
import { formatDZD } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Eye } from "lucide-react";
import Link from "next/link";
import { ProductRowActions } from "@/components/products/product-row-actions";
import type { Product } from "@/types/domain";
import type { Category } from "@/types/domain";

interface ProductsDataTableProps {
  fallback: ProductsResponse;
  categories: Category[];
}

export function ProductsDataTable({ fallback, categories }: ProductsDataTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { data, isLoading, pagination } = useProducts({ fallback });

  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));

  const columns: ColumnDef<ProductListItem, unknown>[] = [
    selectColumn<ProductListItem>(),
    {
      accessorKey: "name",
      header: () => t("products.productName"),
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "sku",
      header: () => t("products.sku"),
      cell: ({ row }) => (
        <span className="font-mono text-sm text-muted-foreground">{row.original.sku ?? "—"}</span>
      ),
      meta: { hideOn: "md" },
    },
    {
      accessorKey: "categoryId",
      header: () => t("products.category"),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.categoryId ? (categoryNames.get(row.original.categoryId) ?? "—") : "—"}
        </span>
      ),
      meta: { hideOn: "lg" },
    },
    {
      accessorKey: "price",
      header: () => t("orders.price"),
      cell: ({ row }) => <span className="tabular-nums">{formatDZD(row.original.price)}</span>,
      meta: { align: "end" },
    },
    {
      accessorKey: "stock",
      header: () => t("products.stock"),
      cell: ({ row }) => {
        const isLowStock = row.original.stock <= row.original.lowStockThreshold;
        return (
          <span className="tabular-nums flex items-center justify-end gap-1.5">
            <span className={isLowStock ? "text-destructive font-medium" : ""}>{row.original.stock}</span>
            {isLowStock && (
              <Badge variant="destructive" className="gap-0.5 py-0">
                <AlertTriangle className="h-3 w-3" />
                {t("products.low")}
              </Badge>
            )}
          </span>
        );
      },
      meta: { align: "end" },
    },
    {
      accessorKey: "isActive",
      header: () => t("common.status"),
      cell: ({ row }) =>
        row.original.isActive ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-success dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50">
            <span className="size-1.5 rounded-full bg-success" />
            {t("common.active")}
          </span>
        ) : (
          <Badge variant="secondary">{t("common.inactive")}</Badge>
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
              <Eye className="h-4 w-4" />
              <span className="sr-only">{t("products.viewDetails", { name: row.original.name })}</span>
            </Link>
          </Button>
          <ProductRowActions
            product={row.original as unknown as Product}
            categories={categories}
          />
        </div>
      ),
      meta: { align: "end", width: "w-20" },
      enableSorting: false,
    },
  ];

  const products = data?.products ?? fallback.products;

  return (
    <DataTable
      columns={columns}
      data={products}
      isLoading={isLoading}
      pagination={pagination}
      onRowClick={(row) => router.push(`/products/${row.id}`)}
      getRowId={(row) => row.id}
      emptyState={<ProductsEmptyState />}
    />
  );
}
