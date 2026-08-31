/** Delivery adapter registry + encrypted credentials loader. */
import "server-only";

import type {
  DeliveryAdapter,
  DeliveryCredentials,
  DeliveryProvider,
} from "./types";
import {
  deliverySecretKeys,
  legacyNoestSecretKeys,
  normalizeDeliveryProvider,
} from "./types";
import { yalidineAdapter } from "./yalidine";
import { maystroAdapter } from "./maystro";
import { zrExpressAdapter } from "./zr-express";
import { ecoTrackAdapter } from "./ecotrack";
import { getSecret } from "@/lib/secrets";
import type { ServiceContext } from "@/lib/data/service-base";
import { SahelFlowError } from "@/types/errors";

/**
 * FD-052 option A (coexist) boundary for real-world courier effects.
 *
 * The demo workspace no longer freezes ordinary commerce (credentials can be
 * configured, real orders book real couriers while demo data is loaded), but
 * demo-tagged orders/shipments must never reach a real courier provider: a
 * booking, tracking sync or label request for a `demo-` entity is a real
 * external action driven by fictional data. Every external-effect entry point
 * that holds an order/delivery identity asserts this with the same code.
 */
export function assertNonDemoCourierIdentity(
  kind: "order" | "delivery",
  id: string,
): void {
  if (id.startsWith("demo-")) {
    throw new SahelFlowError(
      `Demo-tagged ${kind} records cannot be sent to real courier providers. Remove the demo workspace or choose seller-owned records.`,
      "DEMO_PROVIDER_EFFECT_BLOCKED",
      409,
    );
  }
}

const REGISTRY: Record<DeliveryProvider, DeliveryAdapter> = {
  yalidine: yalidineAdapter,
  maystro: maystroAdapter,
  zrexpress: zrExpressAdapter,
  ecotrack: ecoTrackAdapter,
};

export function getDeliveryAdapter(provider: string): DeliveryAdapter {
  const normalized = normalizeDeliveryProvider(provider);
  if (!normalized) {
    throw new Error(
      `Unknown delivery provider: "${provider}". Known: ${Object.keys(REGISTRY).join(", ")}`,
    );
  }
  return REGISTRY[normalized];
}

export function listDeliveryAdapters(): DeliveryAdapter[] {
  return Object.values(REGISTRY);
}

async function readCredentialKeys(
  context: ServiceContext,
  keys: string[],
): Promise<DeliveryCredentials> {
  const credentials: DeliveryCredentials = {};
  for (const key of keys) {
    const value = await getSecret(context, key);
    if (!value) continue;
    const fieldMatch = key.match(/^delivery_[^_]+_(.+)$/);
    if (fieldMatch?.[1]) credentials[fieldMatch[1]] = value;
  }
  return credentials;
}

function completeEcoTrackCredentials(
  credentials: DeliveryCredentials,
): boolean {
  return [
    "apiToken",
    "userGuid",
    "createOrderUrl",
    "validateOrderUrl",
    "trackingsUrl",
    "feesUrl",
  ].every((field) => Boolean(credentials[field]?.trim()));
}

export async function loadDeliveryCredentials(
  context: ServiceContext,
  rawProvider: string,
): Promise<DeliveryCredentials> {
  const provider = normalizeDeliveryProvider(rawProvider);
  if (!provider) {
    throw new Error(`Unknown delivery provider: "${rawProvider}".`);
  }

  const keys = deliverySecretKeys(provider);
  const current = await readCredentialKeys(context, keys);
  if (provider !== "ecotrack") {
    return current;
  }
  if (completeEcoTrackCredentials(current)) return current;

  // Historical read bridge only. Old NOEST rows can still be reconciled through
  // EcoTrack without retaining NOEST as a selectable/runtime provider. New
  // credentials are always written under `delivery_ecotrack_*`.
  const legacy = await readCredentialKeys(context, legacyNoestSecretKeys());
  if (Object.values(legacy).some(Boolean)) {
    legacy.carrierName = "NOEST Express";
  }
  return { ...legacy, ...current };
}

export async function hasDeliveryCredentials(
  context: ServiceContext,
  provider: string,
): Promise<boolean> {
  const credentials = await loadDeliveryCredentials(context, provider);
  return Object.values(credentials).some((value) => Boolean(value?.length));
}

export const PROVIDERS: DeliveryProvider[] = [
  "yalidine",
  "maystro",
  "zrexpress",
  "ecotrack",
];
