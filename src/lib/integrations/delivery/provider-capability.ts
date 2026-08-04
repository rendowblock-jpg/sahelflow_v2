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

// Source-reviewed capability means the adapter and its documented contract have
// been reviewed in source, but a non-mutating connection probe is not being
// misrepresented as live proof of booking/tracking/fees behavior. The exact
// credential + endpoint contract must still have a current certified connection.
const SOURCE_REVIEWED_CAPABILITIES: Record<
  DeliveryProvider,
  readonly ProviderCapability[]
> = {
  yalidine: ["fees", "booking", "tracking"],
  maystro: ["fees", "booking", "tracking"],
  zrexpress: ["fees", "booking", "tracking"],
  // NOEST remains effect-disabled until the exact provider-issued create,
  // validate, tracking and fee contract is independently certified.
  noest: [],
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
  if (provider === "noest") {
    await invalidateProviderCertifications(
      context,
      provider,
      "provider_contract_unverified",
    );
    return {
      ok: false,
      message:
        "NOEST provider effects remain disabled until the exact provider-issued endpoint contract is independently certified.",
    };
  }
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
      (capability) => {
        const sourceReviewed =
          capability !== "connection" &&
          SOURCE_REVIEWED_CAPABILITIES[provider].includes(capability);
        const status =
          capability === "connection"
            ? "certified"
            : sourceReviewed
              ? "source_reviewed"
              : "uncertified";
        const capabilityExpiresAt =
          capability === "connection" ? expiresAt : null;
        const evidence =
          capability === "connection"
            ? {
                probe: "non-mutating-provider-connection",
                message: result.message,
              }
            : sourceReviewed
              ? {
                  probe: "source-contract-review",
                  connectionRequired: true,
                }
              : {
                  probe: "provider-contract-unverified",
                  connectionRequired: true,
                };

        return context.prisma.providerCapabilityCertification.upsert({
          where: { provider_capability: { provider, capability } },
          create: {
            id: capabilityId(provider, capability),
            provider,
            capability,
            contractVersion,
            credentialFingerprint: fingerprint,
            endpointFingerprint: endpoints,
            status,
            certifiedBy: actor,
            reasonCode,
            evidenceJson: JSON.stringify(evidence),
            lastCheckedAt: now,
            certifiedAt: capability === "connection" ? now : null,
            expiresAt: capabilityExpiresAt,
            disabledAt: status === "uncertified" ? now : null,
          },
          update: {
            contractVersion,
            credentialFingerprint: fingerprint,
            endpointFingerprint: endpoints,
            status,
            certifiedBy: actor,
            reasonCode,
            evidenceJson: JSON.stringify(evidence),
            lastCheckedAt: now,
            certifiedAt: capability === "connection" ? now : null,
            expiresAt: capabilityExpiresAt,
            disabledAt: status === "uncertified" ? now : null,
            lastErrorCode: null,
          },
        });
      },
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
  const now = Date.now();

  const connection =
    await context.prisma.providerCapabilityCertification.findUnique({
      where: { provider_capability: { provider, capability: "connection" } },
    });
  const connectionValid =
    connection?.status === "certified" &&
    connection.contractVersion === CONTRACT_VERSION[provider] &&
    connection.credentialFingerprint === fingerprint &&
    connection.endpointFingerprint === endpoints &&
    connection.expiresAt instanceof Date &&
    connection.expiresAt.getTime() > now;

  if (capability === "connection") {
    if (connectionValid) return;
    throw new SahelFlowError(
      `${provider} connection is not certified for the current credentials and endpoint contract. Run the provider connection verification in Settings.`,
      "PROVIDER_CAPABILITY_UNCERTIFIED",
      409,
    );
  }

  const row = await context.prisma.providerCapabilityCertification.findUnique({
    where: { provider_capability: { provider, capability } },
  });
  const sourceReviewed = row?.status === "source_reviewed";
  const liveCertified =
    row?.status === "certified" &&
    row.expiresAt instanceof Date &&
    row.expiresAt.getTime() > now;
  const capabilityValid =
    connectionValid &&
    row?.contractVersion === CONTRACT_VERSION[provider] &&
    row.credentialFingerprint === fingerprint &&
    row.endpointFingerprint === endpoints &&
    (sourceReviewed || liveCertified);

  if (!capabilityValid) {
    throw new SahelFlowError(
      `${provider} ${capability} capability is not enabled for the current credentials and endpoint contract. A current connection plus source-reviewed or live-certified capability evidence is required.`,
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
