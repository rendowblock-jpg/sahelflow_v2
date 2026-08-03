import "server-only";

import { createHash } from "node:crypto";

import type { ServiceContext } from "@/lib/data/service-base";
import { SahelFlowError } from "@/types/errors";
import { getDeliveryAdapter, loadDeliveryCredentials } from "./index";
import {
  DELIVERY_PROVIDERS,
  type DeliveryCredentials,
  type DeliveryProvider,
} from "./types";

export type ProviderCapability = "connection" | "fees" | "booking" | "tracking";

const CERTIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const CONTRACT_VERSION: Record<DeliveryProvider, string> = {
  yalidine: "yalidine-public-v1",
  maystro: "maystro-public-v1",
  zrexpress: "zrexpress-procolis-public-v1",
  noest: "noest-provider-issued-ecotrack-v1",
};

const ENDPOINT_FIELDS = new Set([
  "apiBaseUrl",
  "createOrderUrl",
  "validateOrderUrl",
  "trackingsUrl",
  "feesUrl",
]);

function stableFingerprint(entries: Array<[string, string]>): string {
  return createHash("sha256")
    .update(
      entries
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}\u001f${value}`)
        .join("\u001e"),
    )
    .digest("hex");
}

function credentialEntries(
  credentials: DeliveryCredentials,
): Array<[string, string]> {
  return Object.entries(credentials)
    .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    .map(([key, value]) => [key, value.trim()]);
}

function credentialFingerprint(credentials: DeliveryCredentials): string {
  return stableFingerprint(credentialEntries(credentials));
}

function endpointFingerprint(credentials: DeliveryCredentials): string {
  return stableFingerprint(
    credentialEntries(credentials).filter(([key]) => ENDPOINT_FIELDS.has(key)),
  );
}

function assertProvider(value: string): asserts value is DeliveryProvider {
  if (!DELIVERY_PROVIDERS.includes(value as DeliveryProvider)) {
    throw new SahelFlowError(
      `Unknown delivery provider: ${value}`,
      "DELIVERY_PROVIDER_UNKNOWN",
      400,
    );
  }
}

function capabilityId(
  provider: DeliveryProvider,
  capability: ProviderCapability,
): string {
  return `${provider}:${capability}`;
}

export async function invalidateProviderCertifications(
  context: ServiceContext,
  provider: string,
  reasonCode: string,
): Promise<void> {
  assertProvider(provider);
  await context.prisma.providerCapabilityCertification.updateMany({
    where: { provider },
    data: {
      status: "uncertified",
      reasonCode,
      disabledAt: new Date(),
      certifiedAt: null,
      expiresAt: null,
    },
  });
}

export async function testAndCertifyProvider(
  context: ServiceContext,
  provider: string,
  actor: string,
  reasonCode: string,
): Promise<{ ok: boolean; message: string; expiresAt?: string }> {
  assertProvider(provider);
  const adapter = getDeliveryAdapter(provider);
  const credentials = await loadDeliveryCredentials(context, provider);
  const fingerprint = credentialFingerprint(credentials);
  const endpoints = endpointFingerprint(credentials);
  const now = new Date();
  const contractVersion = CONTRACT_VERSION[provider];

  if (!fingerprint) {
    await invalidateProviderCertifications(
      context,
      provider,
      "credentials_missing",
    );
    return {
      ok: false,
      message: `${adapter.name} credentials are not configured.`,
    };
  }
  if (!adapter.testConnection) {
    await invalidateProviderCertifications(
      context,
      provider,
      "certification_probe_missing",
    );
    return {
      ok: false,
      message: `${adapter.name} has no non-mutating certification probe. Provider effects remain disabled.`,
    };
  }

  const result = await adapter.testConnection(credentials);
  if (!result.ok) {
    await context.prisma.providerCapabilityCertification.updateMany({
      where: { provider },
      data: {
        status: "failed",
        certifiedBy: actor,
        reasonCode,
        lastCheckedAt: now,
        certifiedAt: null,
        expiresAt: null,
        disabledAt: now,
        lastErrorCode: "PROVIDER_CONNECTION_TEST_FAILED",
      },
    });
    await context.prisma.providerCapabilityCertification.upsert({
      where: { provider_capability: { provider, capability: "connection" } },
      create: {
        id: capabilityId(provider, "connection"),
        provider,
        capability: "connection",
        contractVersion,
        credentialFingerprint: fingerprint,
        endpointFingerprint: endpoints,
        status: "failed",
        certifiedBy: actor,
        reasonCode,
        evidenceJson: JSON.stringify({ message: result.message }),
        lastCheckedAt: now,
        lastErrorCode: "PROVIDER_CONNECTION_TEST_FAILED",
      },
      update: {
        contractVersion,
        credentialFingerprint: fingerprint,
        endpointFingerprint: endpoints,
        status: "failed",
        certifiedBy: actor,
        reasonCode,
        evidenceJson: JSON.stringify({ message: result.message }),
        lastCheckedAt: now,
        certifiedAt: null,
        expiresAt: null,
        disabledAt: now,
        lastErrorCode: "PROVIDER_CONNECTION_TEST_FAILED",
      },
    });
    return result;
  }

  const expiresAt = new Date(now.getTime() + CERTIFICATION_TTL_MS);
  await context.prisma.$transaction(
    (["connection", "fees", "booking", "tracking"] as const).map(
      (capability) =>
        context.prisma.providerCapabilityCertification.upsert({
          where: { provider_capability: { provider, capability } },
          create: {
            id: capabilityId(provider, capability),
            provider,
            capability,
            contractVersion,
            credentialFingerprint: fingerprint,
            endpointFingerprint: endpoints,
            status: "certified",
            certifiedBy: actor,
            reasonCode,
            evidenceJson: JSON.stringify({
              probe: "non-mutating-provider-connection",
              message: result.message,
            }),
            lastCheckedAt: now,
            certifiedAt: now,
            expiresAt,
          },
          update: {
            contractVersion,
            credentialFingerprint: fingerprint,
            endpointFingerprint: endpoints,
            status: "certified",
            certifiedBy: actor,
            reasonCode,
            evidenceJson: JSON.stringify({
              probe: "non-mutating-provider-connection",
              message: result.message,
            }),
            lastCheckedAt: now,
            certifiedAt: now,
            expiresAt,
            disabledAt: null,
            lastErrorCode: null,
          },
        }),
    ),
  );
  return { ...result, expiresAt: expiresAt.toISOString() };
}

function providerCertificationBypassForLegacyTests(): boolean {
  return (
    process.env.NODE_ENV === "test" &&
    process.env.SF_TEST_ENFORCE_PROVIDER_CERTIFICATION !== "1"
  );
}

export async function assertProviderCapability(
  context: ServiceContext,
  provider: string,
  capability: ProviderCapability,
): Promise<void> {
  assertProvider(provider);
  if (providerCertificationBypassForLegacyTests()) return;
  const credentials = await loadDeliveryCredentials(context, provider);
  const fingerprint = credentialFingerprint(credentials);
  const endpoints = endpointFingerprint(credentials);
  const row = await context.prisma.providerCapabilityCertification.findUnique({
    where: { provider_capability: { provider, capability } },
  });
  const now = Date.now();
  const valid =
    row?.status === "certified" &&
    row.contractVersion === CONTRACT_VERSION[provider] &&
    row.credentialFingerprint === fingerprint &&
    row.endpointFingerprint === endpoints &&
    row.expiresAt instanceof Date &&
    row.expiresAt.getTime() > now;

  if (!valid) {
    throw new SahelFlowError(
      `${provider} ${capability} capability is not certified for the current credentials and endpoint contract. Run the provider connection certification in Settings.`,
      "PROVIDER_CAPABILITY_UNCERTIFIED",
      409,
    );
  }
}

export interface ProviderCertificationProjection {
  provider: DeliveryProvider;
  capabilities: Record<
    ProviderCapability,
    {
      status: string;
      expiresAt: string | null;
      lastCheckedAt: string | null;
      reasonCode: string | null;
      lastErrorCode: string | null;
    }
  >;
}

export async function providerCertificationStatus(
  context: ServiceContext,
): Promise<ProviderCertificationProjection[]> {
  const rows = await context.prisma.providerCapabilityCertification.findMany({
    orderBy: [{ provider: "asc" }, { capability: "asc" }],
  });
  const capabilities: ProviderCapability[] = [
    "connection",
    "fees",
    "booking",
    "tracking",
  ];
  return DELIVERY_PROVIDERS.map((provider) => {
    const providerRows = new Map(
      rows
        .filter((row) => row.provider === provider)
        .map((row) => [row.capability, row]),
    );
    return {
      provider,
      capabilities: Object.fromEntries(
        capabilities.map((capability) => {
          const row = providerRows.get(capability);
          return [
            capability,
            {
              status: row?.status ?? "uncertified",
              expiresAt: row?.expiresAt?.toISOString() ?? null,
              lastCheckedAt: row?.lastCheckedAt?.toISOString() ?? null,
              reasonCode: row?.reasonCode ?? null,
              lastErrorCode: row?.lastErrorCode ?? null,
            },
          ];
        }),
      ) as ProviderCertificationProjection["capabilities"],
    };
  });
}
