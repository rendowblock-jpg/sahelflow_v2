/**
 * E-commerce sync types + adapter interface.
 *
 * Each platform (Shopify, WooCommerce, YouCan) implements the EcommerceAdapter
 * interface. The sync engine (sync-engine.ts) calls `listOrdersSince` to fetch
 * new/updated orders since the last sync watermark, normalizes them to
 * NormalizedOrder, and the engine creates internal Order records.
 *
 * Design (ADR: polling-based, no webhooks):
 *   The local-first desktop app polls each connected store every N minutes.
 *   Webhooks require a public endpoint, which a local-first app doesn't have.
 *   Polling is simpler, works behind NAT, and the order volume (5-50/day for
 *   target sellers) makes it cheap.
 */

/** A normalized order shape — platform-agnostic, maps to our internal Order. */
export interface NormalizedOrder {
  /** Platform-specific order ID (Shopify int, Woo int, YouCan UUID). */
  sourceOrderId: string;
  /** Human-facing order number (e.g. "#1001", "727", "021"). */
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  /** Region/province — maps to Algerian wilaya for DZ stores. */
  wilaya: string | null;
  /** City — maps to Algerian commune. */
  commune: string | null;
  address: string;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalPrice: number;
  /** Platform name: "shopify" | "woocommerce" | "youcan". */
  source: EcommercePlatform;
  /** Platform-specific metadata stored as JSON in Order.sourceMetadata. */
  sourceMetadata: Record<string, unknown>;
  /** ISO 8601 creation timestamp from the platform. */
  createdAt: string;
}

/** The result of a polling fetch. */
export interface SyncFetchResult {
  orders: NormalizedOrder[];
  /** The new watermark to persist for the next sync (platform-specific). */
  nextWatermark: string;
  /** True if there might be more results (pagination not exhausted). */
  hasMore: boolean;
}

/** Platform identifiers. */
export type EcommercePlatform = "shopify" | "woocommerce" | "youcan";

/** Credentials for each platform (loaded from the Secret store). */
export interface ShopifyCredentials {
  shop: string; // e.g. "acme-store" (without .myshopify.com)
  accessToken: string; // shpat_xxx
}

export interface WooCommerceCredentials {
  siteUrl: string; // e.g. "https://example.com"
  consumerKey: string; // ck_xxx
  consumerSecret: string; // cs_xxx
}

export interface YouCanCredentials {
  accessToken: string;
  // refreshToken + expiry managed by the caller (future: auto-refresh)
}

export type EcommerceCredentials =
  | ShopifyCredentials
  | WooCommerceCredentials
  | YouCanCredentials;

/** The adapter interface each platform implements. */
export interface EcommerceAdapter {
  platform: EcommercePlatform;
  /** Human-readable name for UI display. */
  displayName: string;
  /**
   * Fetch orders since the given watermark.
   * - watermark format is platform-specific:
   *   - Shopify: last order ID (integer as string), or "" for first sync
   *   - WooCommerce: last modified_at ISO 8601 UTC, or "" for first sync
   *   - YouCan: "" (always scans from newest, dedup by sourceOrderId)
   * @param credentials - loaded from the Secret store
   * @param watermark - the last sync's nextWatermark, or "" for initial sync
   * @param maxPages - safety cap on pagination (default 10)
   */
  listOrdersSince(
    credentials: EcommerceCredentials,
    watermark: string,
    maxPages?: number,
  ): Promise<SyncFetchResult>;
}

// ── Secret key helpers ──────────────────────────────────────────────────────

/**
 * Secret keys for e-commerce credentials (stored encrypted in the Secret table).
 * Convention: `ecommerce_{platform}_{field}`.
 */
export const ECOMMERCE_SECRET_KEYS: Record<
  EcommercePlatform,
  Record<string, string>
> = {
  shopify: {
    shop: "ecommerce_shopify_shop",
    accessToken: "ecommerce_shopify_access_token",
  },
  woocommerce: {
    siteUrl: "ecommerce_woocommerce_site_url",
    consumerKey: "ecommerce_woocommerce_consumer_key",
    consumerSecret: "ecommerce_woocommerce_consumer_secret",
  },
  youcan: {
    accessToken: "ecommerce_youcan_access_token",
  },
} as const;
