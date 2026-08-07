"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, Eye } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import {
  EntityInspector,
  EntityLink,
  EntityPreview,
} from "@/components/entities/entity-context";
import { ProductRowActions } from "@/components/products/product-row-actions";
import { ProductsEmptyState } from "@/components/shared/empty-states";
import { StateSurface } from "@/components/shared/state-surface";
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
        <EntityLink href={`/products/${row.original.id}`} label={row.original.name} />
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
      cell: ({ row }) => {
        const product = row.original;
        const category = product.categoryId
          ? categoryNames.get(product.categoryId)
          : undefined;
        return (
          <div className="flex items-center justify-end gap-1">
            <EntityInspector
              title={product.name}
              description={product.sku ?? category}
              fullHref={`/products/${product.id}`}
              fullLabel={t("products.viewDetails", { name: product.name })}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("products.viewDetails", { name: product.name })}
                >
                  <Eye className="size-4" aria-hidden="true" />
                </Button>
              }
            >
              <EntityPreview
                title={product.name}
                description={category}
                metadata={product.sku ? `${t("products.sku")}: ${product.sku}` : undefined}
              >
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("orders.price")}</dt>
                    <dd className="mt-1 font-medium tabular-nums">{formatDZD(product.price)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("products.stock")}</dt>
                    <dd className="mt-1 font-medium tabular-nums">{product.stock}</dd>
                  </div>
                  {fieldAccess.cost ? (
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("products.cost")}</dt>
                      <dd className="mt-1 font-medium tabular-nums">
                        {product.cost === null ? "—" : formatDZD(product.cost)}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("common.status")}</dt>
                    <dd className="mt-1 font-medium">
                      {product.isActive ? t("common.active") : t("common.inactive")}
                    </dd>
                  </div>
                </dl>
              </EntityPreview>
            </EntityInspector>
            {fieldAccess.manage ? (
              <ProductRowActions product={product} categories={categories} />
            ) : null}
          </div>
        );
      },
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
