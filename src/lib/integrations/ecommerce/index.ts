/**
 * E-commerce adapter registry + credentials loader.
 *
 * Maps platform IDs → adapter instances. Credentials are loaded from the
 * encrypted Secret store (ADR-003/004).
 */
import "server-only";


import type {
  EcommerceAdapter,
  EcommerceCredentials,
  EcommercePlatform,
  ShopifyCredentials,
  WooCommerceCredentials,
  YouCanCredentials,
} from "./types";
import { ECOMMERCE_SECRET_KEYS } from "./types";
import { shopifyAdapter } from "./shopify";
import { woocommerceAdapter } from "./woocommerce";
import { youcanAdapter } from "./youcan";
import { getSecret } from "@/lib/secrets";
import type { ServiceContext } from "@/lib/data/service-base";

const REGISTRY: Record<EcommercePlatform, EcommerceAdapter> = {
  shopify: shopifyAdapter,
  woocommerce: woocommerceAdapter,
  youcan: youcanAdapter,
};

/** Get the adapter for a platform. Throws if unknown. */
export function getEcommerceAdapter(platform: string): EcommerceAdapter {
  const adapter = REGISTRY[platform as EcommercePlatform];
  if (!adapter) {
    throw new Error(
      `Unknown e-commerce platform: "${platform}". Known: ${Object.keys(REGISTRY).join(", ")}`,
    );
  }
  return adapter;
}

/** List all registered adapters (for UI display). */
export function listEcommerceAdapters(): EcommerceAdapter[] {
  return Object.values(REGISTRY);
}

/**
 * Load credentials for a platform from the Secret store.
 * Returns null if the required secrets are not configured.
 */
export async function loadEcommerceCredentials(
  context: ServiceContext,
  platform: EcommercePlatform,
): Promise<EcommerceCredentials | null> {
  const keys = ECOMMERCE_SECRET_KEYS[platform];

  switch (platform) {
    case "shopify": {
      // Session 29 fix (AUDIT-6 I1): UI sends `shopDomain` (e.g. "acme-store.myshopify.com"
      // or "acme-store"). The previous loader read `keys.shop` (i.e. `ecommerce_shopify_shop`)
      // which the connect route never wrote -> null -> "credentials missing" in prod.
      const shopDomain = await getSecret(context, keys.shopDomain!);
      const accessToken = await getSecret(context, keys.accessToken!);
      if (!shopDomain || !accessToken) return null;
      const creds: ShopifyCredentials = { shop: shopDomain, accessToken };
      return creds;
    }
    case "woocommerce": {
      const siteUrl = await getSecret(context, keys.siteUrl!);
      const consumerKey = await getSecret(context, keys.consumerKey!);
      const consumerSecret = await getSecret(context, keys.consumerSecret!);
      if (!siteUrl || !consumerKey || !consumerSecret) return null;
      const creds: WooCommerceCredentials = {
        siteUrl,
        consumerKey,
        consumerSecret,
      };
      return creds;
    }
    case "youcan": {
      const accessToken = await getSecret(context, keys.accessToken!);
      if (!accessToken) return null;
      const creds: YouCanCredentials = { accessToken };
      return creds;
    }
    default:
      return null;
  }
}

/**
 * Check if a platform has credentials configured.
 */
export async function hasEcommerceCredentials(
  context: ServiceContext,
  platform: EcommercePlatform,
): Promise<boolean> {
  const creds = await loadEcommerceCredentials(context, platform);
  return creds !== null;
}
