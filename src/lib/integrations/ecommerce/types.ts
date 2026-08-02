/**
 * E-commerce sync types + adapter interface.
 *
 * Each platform normalizes provider data, but catalog prices are never business
 * authority. The sync engine resolves every line against the active SahelFlow
 * catalog before creating a canonical pending order.
 */

export interface NormalizedOrder {
  /** Platform-specific order ID (Shopify int, Woo int, YouCan UUID). */
  sourceOrderId: string;
  /** Human-facing provider order number. */
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  wilaya: string | null;
  commune: string | null;
  address: string;
  items: Array<{
    productName: string;
    /** Provider SKU; may identify either the product or an exact variant. */
    catalogSku?: string | null;
    /** Provider variant label when the API exposes it. */
    variantName?: string | null;
    quantity: number;
    /** Provider price retained for diagnostics only. */
    unitPrice: number;
  }>;
  /** Provider total retained for reconciliation diagnostics only. */
  totalPrice: number;
  /** Explicit provider shipping charge. Canonical item prices remain server-owned. */
  deliveryCost?: number;
  source: EcommercePlatform;
  /** Provider-specific status and receipt snapshot. */
  sourceMetadata: Record<string, unknown>;
  /** Provider update identity; falls back to a deterministic metadata hash. */
  sourceRevision?: string;
  createdAt: string;
}

export interface SyncFetchResult {
  orders: NormalizedOrder[];
  nextWatermark: string;
  hasMore: boolean;
}

export type EcommercePlatform = "shopify" | "woocommerce" | "youcan";

export interface ShopifyCredentials {
  shop: string;
  accessToken: string;
}

export interface WooCommerceCredentials {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

export interface YouCanCredentials {
  accessToken: string;
}

export type EcommerceCredentials =
  | ShopifyCredentials
  | WooCommerceCredentials
  | YouCanCredentials;

export interface EcommerceAdapter {
  platform: EcommercePlatform;
  displayName: string;
  listOrdersSince(
    credentials: EcommerceCredentials,
    watermark: string,
    maxPages?: number,
  ): Promise<SyncFetchResult>;
}

export const ECOMMERCE_SECRET_KEYS: Record<
  EcommercePlatform,
  Record<string, string>
> = {
  shopify: {
    shopDomain: "ecommerce_shopify_shopDomain",
    accessToken: "ecommerce_shopify_accessToken",
  },
  woocommerce: {
    siteUrl: "ecommerce_woocommerce_siteUrl",
    consumerKey: "ecommerce_woocommerce_consumerKey",
    consumerSecret: "ecommerce_woocommerce_consumerSecret",
  },
  youcan: {
    accessToken: "ecommerce_youcan_accessToken",
  },
} as const;
