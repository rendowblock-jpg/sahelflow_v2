/**
 * E-commerce adapter registry + credentials loader.
 *
 * Maps platform IDs → adapter instances. Credentials are loaded from the
 * encrypted Secret store (ADR-003/004).
 */

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
  platform: EcommercePlatform,
): Promise<EcommerceCredentials | null> {
  const keys = ECOMMERCE_SECRET_KEYS[platform];

  switch (platform) {
    case "shopify": {
      const shop = await getSecret(keys.shop!);
      const accessToken = await getSecret(keys.accessToken!);
      if (!shop || !accessToken) return null;
      const creds: ShopifyCredentials = { shop, accessToken };
      return creds;
    }
    case "woocommerce": {
      const siteUrl = await getSecret(keys.siteUrl!);
      const consumerKey = await getSecret(keys.consumerKey!);
      const consumerSecret = await getSecret(keys.consumerSecret!);
      if (!siteUrl || !consumerKey || !consumerSecret) return null;
      const creds: WooCommerceCredentials = {
        siteUrl,
        consumerKey,
        consumerSecret,
      };
      return creds;
    }
    case "youcan": {
      const accessToken = await getSecret(keys.accessToken!);
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
  platform: EcommercePlatform,
): Promise<boolean> {
  const creds = await loadEcommerceCredentials(platform);
  return creds !== null;
}
