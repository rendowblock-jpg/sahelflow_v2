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
import { ProductThumbnail } from "@/components/products/product-thumbnail";
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

export function ProductsDataTable({
  fallback,
  categories,
}: ProductsDataTableProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { data, error, isLoading, pagination } = useProducts({ fallback });
  const fieldAccess = data?.fieldAccess ?? fallback.fieldAccess;
  const categoryNames = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  const integerFormatter = new Intl.NumberFormat(
    locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-DZ",
    { maximumFractionDigits: 0 },
  );

  const columns: ColumnDef<ProductListItem, unknown>[] = [
    {
      accessorKey: "name",
      header: () => t("products.productName"),
      cell: ({ row }) => {
        const product = row.original;
        const category = product.categoryId
          ? categoryNames.get(product.categoryId)
          : undefined;
        return (
          <div
            data-product-identity="true"
            className="flex min-w-[13rem] items-center gap-3 py-0.5"
          >
            <ProductThumbnail src={product.images?.[0]} alt="" />
            <div className="min-w-0 flex-1">
              <EntityLink
                href={`/products/${product.id}`}
                label={product.name}
                className="block truncate font-semibold"
              />
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                {product.sku ? (
                  <span className="max-w-40 truncate font-mono" dir="auto">
                    {product.sku}
                  </span>
                ) : null}
                {product.sku && category ? (
                  <span aria-hidden="true">·</span>
                ) : null}
                {category ? (
                  <span className="max-w-44 truncate" dir="auto">
                    {category}
                  </span>
                ) : product.sku ? null : (
                  <span aria-hidden="true">—</span>
                )}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "price",
      header: () => t("orders.price"),
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {formatDZD(row.original.price, locale)}
        </span>
      ),
      meta: { align: "end" },
    },
    {
      accessorKey: "stock",
      header: () => t("products.stock"),
      cell: ({ row }) => {
        const isLowStock =
          row.original.stock <= row.original.lowStockThreshold;
        return (
          <span className="flex items-center justify-end gap-1.5 tabular-nums">
            <span
              className={
                isLowStock
                  ? "font-semibold text-destructive"
                  : "font-medium"
              }
            >
              {integerFormatter.format(row.original.stock)}
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
                  aria-label={t("products.viewDetails", {
                    name: product.name,
                  })}
                >
                  <Eye className="size-4" aria-hidden="true" />
                </Button>
              }
            >
              <EntityPreview
                title={product.name}
                description={category}
                metadata={
                  product.sku
                    ? `${t("products.sku")}: ${product.sku}`
                    : undefined
                }
              >
                <div className="mb-3 flex items-center gap-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
                  <ProductThumbnail
                    src={product.images?.[0]}
                    alt=""
                    className="size-12"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {product.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[product.sku, category].filter(Boolean).join(" · ") ||
                        "—"}
                    </p>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("orders.price")}
                    </dt>
                    <dd className="mt-1 font-medium tabular-nums">
                      {formatDZD(product.price, locale)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("products.stock")}
                    </dt>
                    <dd className="mt-1 font-medium tabular-nums">
                      {integerFormatter.format(product.stock)}
                    </dd>
                  </div>
                  {fieldAccess.cost ? (
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t("products.cost")}
                      </dt>
                      <dd className="mt-1 font-medium tabular-nums">
                        {product.cost === null
                          ? "—"
                          : formatDZD(product.cost, locale)}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("common.status")}
                    </dt>
                    <dd className="mt-1 font-medium">
                      {product.isActive
                        ? t("common.active")
                        : t("common.inactive")}
                    </dd>
                  </div>
                </dl>
              </EntityPreview>
            </EntityInspector>
            {fieldAccess.manage ? (
              <ProductRowActions
                product={product}
                categories={categories}
              />
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
