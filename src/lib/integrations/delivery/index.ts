/**
 * Delivery adapter registry + credentials loader.
 *
 * The registry maps provider IDs to their adapter instances. The credentials
 * loader reads encrypted secrets from the Secret table (per ADR-003/004) and
 * returns them as a DeliveryCredentials object.
 */
import "server-only";


import type {
  DeliveryAdapter,
  DeliveryCredentials,
  DeliveryProvider,
} from "./types";
import { deliverySecretKeys } from "./types";
import { yalidineAdapter } from "./yalidine";
import { maystroAdapter } from "./maystro";
import { zrExpressAdapter } from "./zr-express";
import { getSecret } from "@/lib/secrets";

const REGISTRY: Record<string, DeliveryAdapter> = {
  yalidine: yalidineAdapter,
  maystro: maystroAdapter,
  zrexpress: zrExpressAdapter,
};

/** Get the adapter for a provider. Throws if unknown. */
export function getDeliveryAdapter(provider: string): DeliveryAdapter {
  const adapter = REGISTRY[provider];
  if (!adapter) {
    throw new Error(`Unknown delivery provider: "${provider}". Known: ${Object.keys(REGISTRY).join(", ")}`);
  }
  return adapter;
}

/** List all registered adapters (for UI display). */
export function listDeliveryAdapters(): DeliveryAdapter[] {
  return Object.values(REGISTRY);
}

/**
 * Load credentials for a provider from the Secret store.
 * Returns an empty object if none are configured (adapters handle this).
 */
export async function loadDeliveryCredentials(
  provider: string,
): Promise<DeliveryCredentials> {
  const keys = deliverySecretKeys(provider);
  const creds: DeliveryCredentials = {};
  for (const key of keys) {
    const value = await getSecret(key);
    if (value) {
      // Extract the field name from the key: delivery_yalidine_api_id → api_id
      const fieldMatch = key.match(/^delivery_\w+_(.+)$/);
      if (fieldMatch) {
        creds[fieldMatch[1]!] = value;
      }
    }
  }
  return creds;
}

/** Check whether a provider has credentials configured. */
export async function hasDeliveryCredentials(
  provider: string,
): Promise<boolean> {
  const creds = await loadDeliveryCredentials(provider);
  return Object.values(creds).some((v) => v && v.length > 0);
}

/** Type-safe provider list for UI. */
export const PROVIDERS: DeliveryProvider[] = ["yalidine", "maystro", "zrexpress"];
