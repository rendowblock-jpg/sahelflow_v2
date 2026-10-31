import type { PublicArtifact } from "../shared";
import type { PublicLocale } from "./locale";
import type { Assets, ShippingRow } from "./shop/ui";

export type StockRow = { unitPriceDzd: number; remaining: number };

export type RenderStorePageInput = {
  /** https://shop.sahelflow.com (taken from the request). */
  origin: string;
  slug: string;
  /** The language this response is written in. */
  locale: PublicLocale;
  /** The language the seller published in; used when the buyer states no preference. */
  defaultLocale: PublicLocale;
  artifact: PublicArtifact;
  stock: ReadonlyMap<string, StockRow>;
  assets: Assets;
  storefrontId: string;
  releaseId: string;
  /** The seller's receipt public key (JWK text): the browser encrypts the buyer's details with it. */
  receiptKey: string;
  shipping: readonly ShippingRow[];
  /** Null for the store home. */
  productId: string | null;
  /** The legal page asked for (/<slug>/legal/<kind>), already checked against the known kinds; absent or null for every other page. */
  legalKind?: "terms" | "returns" | "privacy" | null;
};

/** The page, or null when it asks for a product the release does not contain. */
export type RenderStorePage = (input: RenderStorePageInput) => string | null;
