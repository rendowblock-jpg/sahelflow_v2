import "server-only";

import { createHash } from "node:crypto";

import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import type {
  EcommercePlatform,
  NormalizedOrder,
} from "@/lib/integrations/ecommerce/types";
import { ValidationError } from "@/types/errors";

interface CatalogVariant {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  price: number | null;
  isActive: boolean;
}

interface CatalogProduct {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  productVariants: CatalogVariant[];
}

export interface CanonicalCommerceSnapshot {
  source: EcommercePlatform;
  sourceOrderId: string;
  sourceRevision: string;
  sourceDetails: Record<string, unknown>;
  deliveryCost: number;
}

export interface PreparedCanonicalCommerceOrder
  extends CanonicalCommerceSnapshot {
  items: Array<{
    productId: string;
    productVariantId: string | null;
    quantity: number;
  }>;
}

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("fr-DZ");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function integerMoney(value: number | undefined, field: string): number {
  const rounded = Math.round(value ?? 0);
  if (!Number.isSafeInteger(rounded) || rounded < 0) {
    throw new ValidationError(`${field} must be a non-negative DZD integer`, field);
  }
  return rounded;
}

export function commerceSourceSnapshot(
  order: NormalizedOrder,
): CanonicalCommerceSnapshot {
  const sourceDetails = {
    ...order.sourceMetadata,
    providerOrderNumber: order.orderNumber,
    providerTotalPrice: order.totalPrice,
    providerItems: order.items.map((item) => ({
      productName: item.productName,
      catalogSku: item.catalogSku ?? null,
      variantName: item.variantName ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  };
  return {
    source: order.source,
    sourceOrderId: order.sourceOrderId,
    sourceRevision:
      order.sourceRevision?.trim() ||
      createHash("sha256").update(stableJson(sourceDetails)).digest("hex"),
    sourceDetails,
    deliveryCost: integerMoney(
      order.deliveryCost ??
        (typeof order.sourceMetadata.shippingPrice === "number"
          ? order.sourceMetadata.shippingPrice
          : 0),
      "deliveryCost",
    ),
  };
}

function exactProductByName(
  products: CatalogProduct[],
  productName: string,
): CatalogProduct {
  const matches = products.filter(
    (product) => normalized(product.name) === normalized(productName),
  );
  if (matches.length === 0) {
    throw new ValidationError(
      `No active catalog product matches '${productName}'`,
      "items.productName",
    );
  }
  if (matches.length > 1) {
    throw new ValidationError(
      `Catalog product name '${productName}' is ambiguous; configure an exact SKU`,
      "items.catalogSku",
    );
  }
  const product = matches[0];
  if (!product) throw new ValidationError("Catalog product is missing", "items");
  return product;
}

function resolveItem(
  products: CatalogProduct[],
  item: NormalizedOrder["items"][number],
): { productId: string; productVariantId: string | null; quantity: number } {
  if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
    throw new ValidationError("Provider item quantity must be positive", "items.quantity");
  }

  const sku = normalized(item.catalogSku);
  let product: CatalogProduct | undefined;
  let variant: CatalogVariant | undefined;

  if (sku) {
    const productMatches = products.filter(
      (candidate) => normalized(candidate.sku) === sku,
    );
    const variantMatches = products.flatMap((candidate) =>
      candidate.productVariants
        .filter(
          (candidateVariant) =>
            candidateVariant.isActive && normalized(candidateVariant.sku) === sku,
        )
        .map((candidateVariant) => ({
          product: candidate,
          variant: candidateVariant,
        })),
    );
    if (productMatches.length + variantMatches.length > 1) {
      throw new ValidationError(
        `Provider SKU '${item.catalogSku}' is ambiguous in the active catalog`,
        "items.catalogSku",
      );
    }
    if (variantMatches.length === 1) {
      product = variantMatches[0]?.product;
      variant = variantMatches[0]?.variant;
    } else if (productMatches.length === 1) {
      product = productMatches[0];
    }
  }

  product ??= exactProductByName(products, item.productName);
  const activeVariants = product.productVariants.filter(
    (candidate) => candidate.isActive,
  );
  if (variant && variant.productId !== product.id) {
    throw new ValidationError(
      "Provider SKU and product name resolve to different catalog products",
      "items.catalogSku",
    );
  }
  if (activeVariants.length > 0 && !variant) {
    const name = normalized(item.variantName);
    const matches = name
      ? activeVariants.filter((candidate) => normalized(candidate.name) === name)
      : [];
    if (matches.length !== 1) {
      throw new ValidationError(
        `Product '${product.name}' requires an exact active variant SKU or name`,
        "items.variantName",
      );
    }
    variant = matches[0];
  }
  if (activeVariants.length === 0 && item.variantName?.trim()) {
    throw new ValidationError(
      `Product '${product.name}' has no active variants`,
      "items.variantName",
    );
  }

  return {
    productId: product.id,
    productVariantId: variant?.id ?? null,
    quantity: item.quantity,
  };
}

export async function prepareCanonicalCommerceOrder(
  context: Pick<BusinessPrincipalContext, "prisma">,
  order: NormalizedOrder,
): Promise<PreparedCanonicalCommerceOrder> {
  const products = await context.prisma.product.findMany({
    where: { isActive: true, deletedAt: null },
    include: {
      productVariants: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  const resolved = order.items.map((item) => resolveItem(products, item));
  const grouped = new Map<
    string,
    { productId: string; productVariantId: string | null; quantity: number }
  >();
  for (const item of resolved) {
    const key = `${item.productId}:${item.productVariantId ?? "base"}`;
    const prior = grouped.get(key);
    grouped.set(key, {
      ...item,
      quantity: (prior?.quantity ?? 0) + item.quantity,
    });
  }

  return {
    ...commerceSourceSnapshot(order),
    items: [...grouped.values()],
  };
}

export function commerceOrderIsCancelled(order: NormalizedOrder): boolean {
  const metadata = order.sourceMetadata;
  if (order.source === "shopify") {
    return Boolean(metadata.cancelReason) || metadata.financialStatus === "voided";
  }
  if (order.source === "woocommerce") {
    return ["cancelled", "refunded", "failed"].includes(
      String(metadata.wooStatus ?? "").toLowerCase(),
    );
  }
  return ["cancelled", "canceled"].includes(
    String(metadata.statusNew ?? "").toLowerCase(),
  );
}
