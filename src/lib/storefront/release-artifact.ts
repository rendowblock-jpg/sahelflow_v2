import type { StorefrontStudioDraft } from "./studio-draft";
import { storefrontStudioDraftSchema } from "./studio-schema";

export interface StorefrontReleaseProduct {
  id: string;
  name: string;
  description?: string | null;
  sku: string | null;
  images: string | null;
  price: number;
  stock: number;
  productVariants?: readonly {
    id: string;
    name: string;
    price: number | null;
    stock: number;
    isActive: boolean;
  }[];
}

function legacyImageUrls(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string =>
        typeof entry === "string" && entry.startsWith("https://")).slice(0, 8);
    }
  } catch {
    // Older product rows may contain comma-separated image URLs.
  }
  return value.split(",").map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("https://")).slice(0, 8);
}

export function storefrontReleaseItemKey(productId: string, variantId: string | null): string {
  return variantId ? `${productId}:${variantId}` : `${productId}:base`;
}

export function parseStorefrontReleaseItemKey(itemKey: string): {
  productId: string;
  variantId: string | null;
} | null {
  const separator = itemKey.indexOf(":");
  if (separator < 2 || separator === itemKey.length - 1) return null;
  const productId = itemKey.slice(0, separator);
  const variant = itemKey.slice(separator + 1);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/.test(productId)) return null;
  if (variant === "base") return { productId, variantId: null };
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/.test(variant)) return null;
  return { productId, variantId: variant };
}

export function createStorefrontReleaseInput(input: Readonly<{
  workspaceId: string;
  releaseId: string;
  parentReleaseId: string | null;
  locale: "ar" | "fr" | "en";
  draft: StorefrontStudioDraft;
  products: readonly StorefrontReleaseProduct[];
}>): Record<string, unknown> {
  const draft = storefrontStudioDraftSchema.parse(input.draft);
  if (draft.theme.builder.shippingRules.length < 1) {
    throw new Error("Published storefront requires at least one delivery rule");
  }
  const selected = new Set(draft.selectedProductIds);
  const products = input.products.filter((product) => selected.has(product.id));
  if (products.length !== selected.size) {
    throw new Error("Published storefront product authority is incomplete");
  }
  const publicProducts: Array<Record<string, unknown>> = [];
  const allocations: Array<Record<string, unknown>> = [];
  for (const product of products) {
    const media = draft.theme.builder.productMedia[product.id];
    const imageUrls = media?.items.map((item) => item.url) ?? legacyImageUrls(product.images);
    const variants = product.productVariants?.filter((variant) => variant.isActive) ?? [];
    const saleItems = variants.length > 0
      ? variants.map((variant) => ({
          variantId: variant.id,
          optionLabel: variant.name,
          price: variant.price ?? product.price,
          stock: variant.stock,
        }))
      : [{ variantId: null, optionLabel: undefined, price: product.price, stock: product.stock }];
    for (const saleItem of saleItems) {
      if (!Number.isSafeInteger(saleItem.price) || saleItem.price < 0 ||
          !Number.isSafeInteger(saleItem.stock) || saleItem.stock < 0) {
        throw new Error("Published storefront price or allocation is invalid");
      }
      const itemKey = storefrontReleaseItemKey(product.id, saleItem.variantId);
      publicProducts.push({
        itemKey,
        productId: product.id,
        variantId: saleItem.variantId,
        name: product.name,
        ...(saleItem.optionLabel ? { optionLabel: saleItem.optionLabel } : {}),
        ...(product.sku ? { sku: product.sku } : {}),
        ...(product.description ? { description: product.description } : {}),
        ...(imageUrls.length > 0 ? { imageUrls } : {}),
      });
      allocations.push({ itemKey, unitPriceDzd: saleItem.price, quantity: saleItem.stock });
    }
  }
  const { domain: _privateDomain, shippingRules, ...publicBuilder } = draft.theme.builder;
  return {
    workspaceId: input.workspaceId,
    releaseId: input.releaseId,
    parentReleaseId: input.parentReleaseId,
    templateId: draft.theme.template,
    locale: input.locale,
    publicArtifact: {
      schemaVersion: 2,
      storeName: draft.name,
      ...(draft.description ? { description: draft.description } : {}),
      theme: { ...draft.theme, builder: publicBuilder },
      products: publicProducts,
    },
    allocations,
    shippingRules,
  };
}
