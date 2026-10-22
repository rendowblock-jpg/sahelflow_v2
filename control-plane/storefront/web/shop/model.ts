import type { PublicArtifact } from "../../shared";
import type { StockRow } from "../types";

export type ShopSection = {
  id: string;
  type: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  blocks: Array<{ id: string; type: string; settings: Record<string, unknown> }>;
};

/** The part of the published theme the public page reads. The cloud validated the whole theme at publish. */
export type ShopTheme = {
  template: import("../../shared").TemplateId;
  /** The five styles only: one scrollable landing page, or a store of several pages. Absent in older themes. */
  mode?: "landing" | "store";
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  showPrices: boolean;
  showStock: boolean;
  density: "airy" | "balanced" | "compact";
  radius: "soft" | "rounded" | "sharp";
  announcement: { enabled: boolean; text: string };
  hero: { enabled: boolean; style: "editorial" | "split" | "centered"; eyebrow: string; headline: string; body: string; ctaLabel: string };
  catalog: { cardStyle: "minimal" | "elevated" | "outlined"; imageRatio: "square" | "portrait" | "landscape"; showSku: boolean };
  checkout: { layout: "drawer" | "sticky" | "inline"; showOrderNotes: boolean; showCodPromise: boolean; codPromiseText: string };
  trust: { showCodBadge: boolean; showPhoneConfirmationBadge: boolean; showDeliveryBadge: boolean; showSupportBadge: boolean };
  builder: {
    composition: { sections: ShopSection[] };
    seo: { title: string; description: string; socialImageUrl: string | null; noIndex: boolean };
    contact: { phone: string; whatsapp: string; email: string; address: string };
  };
};

export type ShopVariant = { itemKey: string; label: string | null; price: number; remaining: number };

export type ShopProduct = {
  id: string;
  name: string;
  description: string;
  sku: string | null;
  images: string[];
  variants: ShopVariant[];
  /** Lowest price among variants that can still be bought, else among all. */
  from: number;
  remaining: number;
  soldOut: boolean;
};

export type ShopModel = {
  name: string;
  description: string;
  theme: ShopTheme;
  products: ShopProduct[];
};

function httpsList(urls: readonly string[] | undefined): string[] {
  return (urls ?? []).filter((url) => /^https:\/\//i.test(url)).slice(0, 8);
}

/**
 * Turns a published release into what the page draws.
 *
 * The cloud stores one row per SALE ITEM (a product, or one variant of it). A buyer
 * sees one product with options, so variants are folded together. An item without an
 * allocation row cannot be priced and is left out rather than shown at 0.
 */
export function buildShopModel(artifact: PublicArtifact, stock: ReadonlyMap<string, StockRow>): ShopModel {
  const theme = artifact.theme as unknown as ShopTheme;
  const builder = theme.builder as Partial<ShopTheme["builder"]> | undefined;
  const safeTheme: ShopTheme = {
    ...theme,
    builder: {
      composition: builder?.composition ?? { sections: [] },
      seo: builder?.seo ?? { title: "", description: "", socialImageUrl: null, noIndex: false },
      contact: builder?.contact ?? { phone: "", whatsapp: "", email: "", address: "" },
    },
  };

  const byProduct = new Map<string, ShopProduct>();
  for (const entry of artifact.products) {
    const row = stock.get(entry.itemKey);
    if (!row) continue;
    const variant: ShopVariant = {
      itemKey: entry.itemKey,
      label: entry.optionLabel?.trim() || null,
      price: row.unitPriceDzd,
      remaining: row.remaining,
    };
    const existing = byProduct.get(entry.productId);
    if (existing) {
      existing.variants.push(variant);
      if (existing.images.length === 0) existing.images = httpsList(entry.imageUrls);
      continue;
    }
    byProduct.set(entry.productId, {
      id: entry.productId,
      name: entry.name,
      description: entry.description?.trim() ?? "",
      sku: entry.sku ?? null,
      images: httpsList(entry.imageUrls),
      variants: [variant],
      from: 0,
      remaining: 0,
      soldOut: true,
    });
  }

  const products = [...byProduct.values()].map((product) => {
    const buyable = product.variants.filter((variant) => variant.remaining > 0);
    const pool = buyable.length > 0 ? buyable : product.variants;
    return {
      ...product,
      from: Math.min(...pool.map((variant) => variant.price)),
      remaining: product.variants.reduce((sum, variant) => sum + variant.remaining, 0),
      soldOut: buyable.length === 0,
    };
  });

  return { name: artifact.storeName, description: artifact.description ?? "", theme: safeTheme, products };
}
