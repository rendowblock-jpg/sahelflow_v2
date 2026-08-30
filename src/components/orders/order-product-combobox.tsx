"use client";

import { useCallback } from "react";

import type { VariantOption } from "@/components/products/product-variant-picker";
import { AsyncCombobox } from "@/components/shared/combobox/async-combobox";
import { useI18n } from "@/hooks/use-i18n";
import { formatDZD } from "@/lib/utils";

export interface OrderFormProduct {
  id: string;
  name: string;
  sku?: string | null;
  price: number | null;
  stock: number;
  lowStockThreshold?: number;
  isActive: boolean;
  productVariants?: VariantOption[];
}

/** Item rows the variant-aware picker reasons over. */
export interface OrderItemFieldSnapshot {
  productId: string;
  productVariantId: string | null;
}

export type ProductStockLevel = "in" | "low" | "out";

/** Stock badge authority — mirrors the product workbench thresholds. */
export function productStockLevel(
  stock: number,
  lowStockThreshold = 5,
): ProductStockLevel {
  if (stock <= 0) return "out";
  if (stock <= lowStockThreshold) return "low";
  return "in";
}

/**
 * Variant-aware availability: a product stays selectable while it has no rows
 * yet, or while at least one active variant is not already used by another
 * row. Same rule the previous catalog-dump Select applied inline.
 */
export function productHasSelectableVariant(
  product: OrderFormProduct,
  selectedFields: Array<OrderItemFieldSnapshot>,
): boolean {
  const activeVariants = (product.productVariants ?? []).filter(
    (variant) => variant.isActive,
  );
  const rowsForProduct = selectedFields.filter(
    (field) => field.productId === product.id,
  );
  if (activeVariants.length === 0) return rowsForProduct.length === 0;
  const selectedVariantIds = new Set(
    rowsForProduct
      .map((field) => field.productVariantId)
      .filter((variantId): variantId is string => Boolean(variantId)),
  );
  return activeVariants.some((variant) => !selectedVariantIds.has(variant.id));
}

interface ProductSearchResponseRow {
  id?: unknown;
  name?: unknown;
  sku?: unknown;
  price?: unknown;
  stock?: unknown;
  lowStockThreshold?: unknown;
  isActive?: unknown;
  productVariants?: Array<{
    id: unknown;
    name?: unknown;
    sku?: unknown;
    price?: unknown;
    stock?: unknown;
    isActive?: unknown;
  }>;
}

function mapVariant(variant: NonNullable<ProductSearchResponseRow["productVariants"]>[number]): VariantOption {
  return {
    id: String(variant.id),
    name: typeof variant.name === "string" ? variant.name : "",
    sku: typeof variant.sku === "string" ? variant.sku : null,
    price: typeof variant.price === "number" ? variant.price : null,
    stock: typeof variant.stock === "number" ? variant.stock : 0,
    isActive: variant.isActive !== false,
  };
}

/**
 * Remote product search for the order form.
 *
 * GET /api/products?q=&activeOnly=true&page=1&pageSize=50 (catalog workbench
 * contract) is used instead of /api/products/search because the workbench row
 * carries `sku` and the full `productVariants` tree — the variant-aware picker
 * and stock badges need both, and the legacy search route returns neither.
 */
export async function fetchProductOptions(
  query: string,
): Promise<OrderFormProduct[]> {
  const params = new URLSearchParams({
    q: query,
    activeOnly: "true",
    page: "1",
    pageSize: "50",
  });
  const res = await fetch(`/api/products?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`product search failed (${res.status})`);
  const data = (await res.json()) as { products?: ProductSearchResponseRow[] };
  return (data.products ?? [])
    .filter(
      (row): row is ProductSearchResponseRow & { id: string } =>
        typeof row.id === "string",
    )
    .map((row) => ({
      id: row.id,
      name: typeof row.name === "string" ? row.name : "",
      sku: typeof row.sku === "string" ? row.sku : null,
      price: typeof row.price === "number" ? row.price : 0,
      stock: typeof row.stock === "number" ? row.stock : 0,
      lowStockThreshold:
        typeof row.lowStockThreshold === "number" ? row.lowStockThreshold : 5,
      isActive: row.isActive !== false,
      productVariants: (row.productVariants ?? [])
        .filter((variant) => typeof variant.id === "string")
        .map(mapVariant),
    }));
}

interface OrderProductComboboxProps {
  id?: string;
  /** Capped active-product slice passed server-side (initial rows). */
  products: OrderFormProduct[];
  /** Current item rows — drives the variant-aware disabled state. */
  selectedFields: OrderItemFieldSnapshot[];
  onSelect: (product: OrderFormProduct) => void;
  /** Every remote result page is reported so the dialog can cache variants. */
  onProductsLoaded?: (products: OrderFormProduct[]) => void;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  disabled?: boolean;
}

export function OrderProductCombobox({
  id,
  products,
  selectedFields,
  onSelect,
  onProductsLoaded,
  ariaInvalid,
  ariaDescribedBy,
  disabled,
}: OrderProductComboboxProps) {
  const { t, locale } = useI18n();

  const searchFields = useCallback(
    (product: OrderFormProduct) => [product.name, product.sku],
    [],
  );

  const stockLabels: Record<ProductStockLevel, { key: string; className: string }> = {
    in: { key: "orders.form.combobox.stockIn", className: "text-success" },
    low: { key: "orders.form.combobox.stockLow", className: "text-warning" },
    out: { key: "orders.form.combobox.stockOut", className: "text-destructive" },
  };

  return (
    <AsyncCombobox<OrderFormProduct>
      id={id}
      value=""
      options={products}
      onSelect={onSelect}
      fetchOptions={fetchProductOptions}
      searchFields={searchFields}
      placeholder={t("orders.form.addProductPlaceholder")}
      searchPlaceholder={t("orders.form.combobox.searchProductPlaceholder")}
      emptyMessage={t("orders.form.combobox.noProductMatch")}
      searchingMessage={t("orders.form.combobox.searching")}
      searchFailedMessage={t("orders.form.combobox.searchFailed")}
      onQueryResults={onProductsLoaded}
      ariaInvalid={ariaInvalid}
      ariaDescribedBy={ariaDescribedBy}
      disabled={disabled}
      isOptionDisabled={(product) => !productHasSelectableVariant(product, selectedFields)}
      renderTriggerLabel={() => null}
      renderOption={(product) => {
        const level = productStockLevel(product.stock, product.lowStockThreshold ?? 5);
        const stockLabel = stockLabels[level];
        const exhausted = !productHasSelectableVariant(product, selectedFields);
        return (
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium">{product.name}</span>
              <span className="shrink-0 text-xs tabular-nums">
                {formatDZD(product.price ?? 0, locale)}
              </span>
            </span>
            <span className="flex items-center justify-between gap-2">
              {product.sku ? (
                /* SKUs are technical LTR identifiers — keep them readable in RTL. */
                <span
                  className="truncate font-mono text-xs text-muted-foreground"
                  dir="ltr"
                >
                  {product.sku}
                </span>
              ) : (
                <span />
              )}
              <span
                className={`shrink-0 text-xs font-medium ${stockLabel.className}`}
              >
                {level === "out"
                  ? t(stockLabel.key)
                  : t(stockLabel.key, { count: product.stock })}
              </span>
            </span>
            {exhausted ? (
              <span className="text-xs text-muted-foreground">
                {t("orders.form.combobox.allVariantsSelected")}
              </span>
            ) : null}
          </span>
        );
      }}
    />
  );
}
