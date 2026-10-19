import type { StorefrontStudioProduct } from "@/components/storefront/studio/studio-types";
import type { StorefrontTheme } from "@/lib/storefront/presentation-types";
import type { StorefrontStudioDraft } from "@/lib/storefront/studio-draft";
import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";

import type { PublicProduct } from "../shared";
import type { StockRow } from "./types";

type Group = {
  id: string;
  name: string;
  sku: string | null;
  images: string[];
  prices: number[];
  stock: number;
};

function httpsOnly(urls: readonly string[] | undefined): string[] {
  return (urls ?? []).filter((url) => /^https:\/\//i.test(url)).slice(0, 8);
}

/**
 * Turns a published release into what the shared storefront renderer draws.
 *
 * The cloud stores one row per SALE ITEM (a product, or one variant of it). A
 * buyer sees one card per PRODUCT, so variants are folded together: the card
 * shows the lowest price and the combined units still on offer. An item that has
 * no allocation row cannot be priced and is left out rather than shown at 0.
 *
 * The theme was fully validated when it was published (validPublicArtifact), so
 * it is used as stored; only the private builder fields the artifact never
 * carries (domain, delivery rules) are filled with neutral defaults.
 */
export function adaptPublicRelease(input: {
  slug: string;
  storeName: string;
  description?: string;
  theme: Record<string, unknown>;
  products: readonly PublicProduct[];
  stock: ReadonlyMap<string, StockRow>;
}): { draft: StorefrontStudioDraft; products: StorefrontStudioProduct[] } {
  const template = input.theme.template === "atlas" || input.theme.template === "oasis" ? input.theme.template : "sahara";
  const defaults = createDefaultStorefrontTheme(template);
  const storedBuilder = (input.theme.builder ?? {}) as Record<string, unknown>;
  const theme = {
    ...input.theme,
    builder: {
      ...defaults.builder,
      ...storedBuilder,
      contact: storedBuilder.contact ?? defaults.builder.contact,
      domain: defaults.builder.domain,
      shippingRules: [],
    },
  } as unknown as StorefrontTheme;

  const groups = new Map<string, Group>();
  for (const product of input.products) {
    const row = input.stock.get(product.itemKey);
    if (!row) continue;
    const group = groups.get(product.productId) ?? {
      id: product.productId,
      name: product.name,
      sku: product.sku ?? null,
      images: httpsOnly(product.imageUrls),
      prices: [],
      stock: 0,
    };
    if (group.images.length === 0) group.images = httpsOnly(product.imageUrls);
    group.prices.push(row.unitPriceDzd);
    group.stock += row.remaining;
    groups.set(product.productId, group);
  }

  const products: StorefrontStudioProduct[] = [...groups.values()].map((group) => ({
    id: group.id,
    name: group.name,
    price: Math.min(...group.prices),
    sku: group.sku,
    stock: group.stock,
    images: group.images.length > 0 ? JSON.stringify(group.images) : null,
  }));

  return {
    draft: {
      name: input.storeName,
      slug: input.slug,
      description: input.description ?? "",
      theme,
      selectedProductIds: products.map((product) => product.id),
      isActive: true,
    },
    products,
  };
}
