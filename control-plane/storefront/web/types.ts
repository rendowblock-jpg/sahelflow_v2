import type { PublicArtifact } from "../shared";
import type { PublicLocale } from "./locale";

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
  /** Hashed stylesheet path from the asset manifest. */
  cssPath: string;
};

export type RenderStorePage = (input: RenderStorePageInput) => string;
