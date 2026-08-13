import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceContext } from "@/lib/data/service-base";

const harness = vi.hoisted(() => ({
  credentials: { apiId: "api-id", apiToken: "token-a" } as Record<string, string>,
  adapter: {
    id: "yalidine",
    name: "Yalidine",
    logo: "box",
    testConnection: vi.fn(),
  },
}));

vi.mock("../index", () => ({
  getDeliveryAdapter: vi.fn(() => harness.adapter),
  loadDeliveryCredentials: vi.fn(async () => ({ ...harness.credentials })),
}));

import {
  assertProviderCapability,
  invalidateProviderCertifications,
  providerCertificationStatus,
  testAndCertifyProvider,
} from "../provider-capability";

type StoredRow = {
  id: string;
  provider: string;
  capability: string;
  contractVersion: string;
  credentialFingerprint: string;
  endpointFingerprint: string;
  status: string;
  certifiedBy: string | null;
  reasonCode: string | null;
  evidenceJson: string | null;
  lastCheckedAt: Date | null;
  certifiedAt: Date | null;
  expiresAt: Date | null;
  disabledAt: Date | null;
  lastErrorCode: string | null;
};
type CertificationWhere = {
  provider_capability: { provider: string; capability: string };
};

function testContext() {
  const rows = new Map<string, StoredRow>();
  const model = {
    updateMany: vi.fn(async ({ where, data }: { where: { provider?: string }; data: Partial<StoredRow> }) => {
      let count = 0;
      for (const [key, row] of rows) {
        if (where.provider && row.provider !== where.provider) continue;
        rows.set(key, { ...row, ...data });
        count += 1;
      }
      return { count };
    }),
    upsert: vi.fn(async ({ where, create, update }: {
      where: CertificationWhere;
      create: StoredRow;
      update: Partial<StoredRow>;
    }) => {
      const key = `${where.provider_capability.provider}:${where.provider_capability.capability}`;
      const current = rows.get(key);
      const next = current ? { ...current, ...update } : create;
      rows.set(key, next);
      return next;
    }),
    findUnique: vi.fn(async ({ where }: { where: CertificationWhere }) =>
      rows.get(`${where.provider_capability.provider}:${where.provider_capability.capability}`) ?? null,
    ),
    findMany: vi.fn(async () => [...rows.values()]),
  };
  return {
    rows,
    context: {
      prisma: {
        providerCapabilityCertification: model,
        $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
      },
      shop: {},
    } as unknown as ServiceContext,
  };
}

describe("delivery provider capability authority", () => {
  const previousEnforcement = process.env.SF_TEST_ENFORCE_PROVIDER_CERTIFICATION;

  beforeEach(() => {
    process.env.SF_TEST_ENFORCE_PROVIDER_CERTIFICATION = "1";
    harness.credentials = { apiId: "api-id", apiToken: "token-a" };
    harness.adapter.testConnection.mockReset().mockResolvedValue({ ok: true, message: "verified" });
  });

  afterEach(() => {
    if (previousEnforcement === undefined) delete process.env.SF_TEST_ENFORCE_PROVIDER_CERTIFICATION;
    else process.env.SF_TEST_ENFORCE_PROVIDER_CERTIFICATION = previousEnforcement;
  });

  it("requires a connection probe plus source-reviewed effects", async () => {
    const { context, rows } = testContext();
    const result = await testAndCertifyProvider(context, "yalidine", "owner:test", "manual_test");
    expect(result.ok).toBe(true);
    expect(rows.get("yalidine:connection")?.status).toBe("certified");
    expect(rows.get("yalidine:fees")?.status).toBe("source_reviewed");
    expect(rows.get("yalidine:booking")?.status).toBe("source_reviewed");
    expect(rows.get("yalidine:tracking")?.status).toBe("source_reviewed");
    await expect(assertProviderCapability(context, "yalidine", "booking")).resolves.toBeUndefined();
  });

  it("certifies EcoTrack as one transport independent of courier brand", async () => {
    const { context, rows } = testContext();
    harness.credentials = {
      carrierName: "Courier Test",
      apiToken: "token",
      userGuid: "guid",
      createOrderUrl: "https://courier.example/create",
      validateOrderUrl: "https://courier.example/validate",
      trackingsUrl: "https://courier.example/tracking",
      feesUrl: "https://courier.example/fees",
    };

    const result = await testAndCertifyProvider(context, "ecotrack", "owner:test", "manual_test");

    expect(result.ok).toBe(true);
    expect(rows.get("ecotrack:connection")?.status).toBe("certified");
    expect(rows.get("ecotrack:booking")?.status).toBe("source_reviewed");
    await expect(assertProviderCapability(context, "ecotrack", "booking")).resolves.toBeUndefined();
  });

  it("normalizes historical NOEST rows into EcoTrack certification authority", async () => {
    const { context, rows } = testContext();
    const result = await testAndCertifyProvider(context, "noest", "owner:test", "legacy_migration");
    expect(result.ok).toBe(true);
    expect(rows.has("noest:connection")).toBe(false);
    expect(rows.get("ecotrack:connection")?.status).toBe("certified");
  });

  it("fails closed when credentials drift after certification", async () => {
    const { context } = testContext();
    await testAndCertifyProvider(context, "yalidine", "owner:test", "manual_test");
    harness.credentials = { apiId: "api-id", apiToken: "token-b" };
    await expect(assertProviderCapability(context, "yalidine", "booking")).rejects.toMatchObject({
      code: "PROVIDER_CAPABILITY_UNCERTIFIED",
    });
  });

  it("revokes every capability when a later connection probe fails", async () => {
    const { context, rows } = testContext();
    await testAndCertifyProvider(context, "yalidine", "owner:test", "manual_test");
    harness.adapter.testConnection.mockResolvedValueOnce({ ok: false, message: "rejected" });
    const result = await testAndCertifyProvider(context, "yalidine", "owner:test", "manual_retest");
    expect(result.ok).toBe(false);
    expect([...rows.values()].every((row) => row.status === "failed")).toBe(true);
  });

  it("invalidates certification after credential administration", async () => {
    const { context, rows } = testContext();
    await testAndCertifyProvider(context, "yalidine", "owner:test", "manual_test");
    await invalidateProviderCertifications(context, "yalidine", "credentials_updated");
    expect([...rows.values()].every((row) => row.status === "uncertified" && row.expiresAt === null)).toBe(true);
  });

  it("projects only canonical runtime providers", async () => {
    const { context } = testContext();
    const status = await providerCertificationStatus(context);
    expect(status.map((item) => item.provider)).toEqual([
      "yalidine",
      "maystro",
      "zrexpress",
      "ecotrack",
    ]);
    expect(status[3]?.capabilities.booking.status).toBe("uncertified");
  });
});
