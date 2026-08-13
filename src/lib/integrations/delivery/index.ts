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
import {
  ALGERIAN_DEMO_MARKER_KEY,
  ALGERIAN_DEMO_VERSION,
} from "@/lib/demo/algerian-demo-policy";
import { SahelFlowError } from "@/types/errors";

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

async function assertProviderEffectsAllowed(
  context: ServiceContext,
): Promise<void> {
  const demoMarker = await context.prisma.setting.findUnique({
    where: { key: ALGERIAN_DEMO_MARKER_KEY },
    select: { value: true },
  });
  if (demoMarker?.value === ALGERIAN_DEMO_VERSION) {
    throw new SahelFlowError(
      "Courier provider actions are disabled while the Algerian demo workspace is loaded.",
      "DEMO_PROVIDER_EFFECT_BLOCKED",
      409,
    );
  }
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

export async function loadDeliveryCredentials(
  context: ServiceContext,
  rawProvider: string,
): Promise<DeliveryCredentials> {
  await assertProviderEffectsAllowed(context);
  const provider = normalizeDeliveryProvider(rawProvider);
  if (!provider) {
    throw new Error(`Unknown delivery provider: "${rawProvider}".`);
  }

  const keys = deliverySecretKeys(provider);
  const current = await readCredentialKeys(context, keys);
  if (Object.values(current).some(Boolean) || rawProvider !== "noest") {
    return current;
  }

  // Historical read bridge only. Old NOEST rows can still be reconciled through
  // EcoTrack without retaining NOEST as a selectable/runtime provider. New
  // credentials are always written under `delivery_ecotrack_*`.
  const legacy = await readCredentialKeys(context, legacyNoestSecretKeys());
  if (Object.values(legacy).some(Boolean)) {
    legacy.carrierName = "NOEST Express";
  }
  return legacy;
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
