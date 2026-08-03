import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceContext } from "@/lib/data/service-base";

const harness = vi.hoisted(() => ({
  credentials: {
    apiId: "api-id",
    apiToken: "token-a",
  } as Record<string, string>,
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

type UpdateManyArgs = {
  where: { provider?: string };
  data: Partial<StoredRow>;
};

type UpsertArgs = {
  where: CertificationWhere;
  create: StoredRow;
  update: Partial<StoredRow>;
};

type FindUniqueArgs = { where: CertificationWhere };

function testContext() {
  const rows = new Map<string, StoredRow>();
  const model = {
    updateMany: vi.fn(async ({ where, data }: UpdateManyArgs) => {
      let count = 0;
      for (const [key, row] of rows) {
        if (where.provider && row.provider !== where.provider) continue;
        rows.set(key, { ...row, ...data });
        count += 1;
      }
      return { count };
    }),
    upsert: vi.fn(async ({ where, create, update }: UpsertArgs) => {
      const key = `${where.provider_capability.provider}:${where.provider_capability.capability}`;
      const current = rows.get(key);
      const next = current ? { ...current, ...update } : create;
      rows.set(key, next);
      return next;
    }),
    findUnique: vi.fn(async ({ where }: FindUniqueArgs) =>
      rows.get(
        `${where.provider_capability.provider}:${where.provider_capability.capability}`,
      ) ?? null,
    ),
    findMany: vi.fn(async () => [...rows.values()]),
  };
  return {
    rows,
    context: {
      prisma: {
        providerCapabilityCertification: model,
        $transaction: vi.fn(async (operations: Promise<unknown>[]) =>
          Promise.all(operations),
        ),
      },
      shop: {},
    } as unknown as ServiceContext,
    model,
  };
}

describe("delivery provider capability authority", () => {
  const previousEnforcement =
    process.env.SF_TEST_ENFORCE_PROVIDER_CERTIFICATION;

  beforeEach(() => {
    process.env.SF_TEST_ENFORCE_PROVIDER_CERTIFICATION = "1";
    harness.credentials = { apiId: "api-id", apiToken: "token-a" };
    harness.adapter.testConnection.mockReset().mockResolvedValue({
      ok: true,
      message: "verified",
    });
  });

  afterEach(() => {
    if (previousEnforcement === undefined) {
      delete process.env.SF_TEST_ENFORCE_PROVIDER_CERTIFICATION;
    } else {
      process.env.SF_TEST_ENFORCE_PROVIDER_CERTIFICATION = previousEnforcement;
    }
  });

  it("certifies all runtime capabilities for one exact credential contract", async () => {
    const { context, rows } = testContext();

    const result = await testAndCertifyProvider(
      context,
      "yalidine",
      "owner:test",
      "manual_test",
    );

    expect(result.ok).toBe(true);
    expect(rows.size).toBe(4);
    expect([...rows.values()].map((row) => row.capability).sort()).toEqual([
      "booking",
      "connection",
      "fees",
      "tracking",
    ]);
    await expect(
      assertProviderCapability(context, "yalidine", "booking"),
    ).resolves.toBeUndefined();
  });

  it("fails closed when credentials drift after certification", async () => {
    const { context } = testContext();
    await testAndCertifyProvider(
      context,
      "yalidine",
      "owner:test",
      "manual_test",
    );

    harness.credentials = { apiId: "api-id", apiToken: "token-b" };

    await expect(
      assertProviderCapability(context, "yalidine", "booking"),
    ).rejects.toMatchObject({ code: "PROVIDER_CAPABILITY_UNCERTIFIED" });
  });

  it("revokes every capability when a later connection probe fails", async () => {
    const { context, rows } = testContext();
    await testAndCertifyProvider(
      context,
      "yalidine",
      "owner:test",
      "manual_test",
    );
    harness.adapter.testConnection.mockResolvedValueOnce({
      ok: false,
      message: "rejected",
    });

    const result = await testAndCertifyProvider(
      context,
      "yalidine",
      "owner:test",
      "manual_retest",
    );

    expect(result.ok).toBe(false);
    expect([...rows.values()].every((row) => row.status === "failed")).toBe(
      true,
    );
  });

  it("invalidates certification explicitly after credential administration", async () => {
    const { context, rows } = testContext();
    await testAndCertifyProvider(
      context,
      "yalidine",
      "owner:test",
      "manual_test",
    );

    await invalidateProviderCertifications(
      context,
      "yalidine",
      "credentials_updated",
    );

    expect(
      [...rows.values()].every(
        (row) => row.status === "uncertified" && row.expiresAt === null,
      ),
    ).toBe(true);
  });

  it("projects missing providers and capabilities as uncertified", async () => {
    const { context } = testContext();
    const status = await providerCertificationStatus(context);

    expect(status.map((item) => item.provider)).toEqual([
      "yalidine",
      "maystro",
      "zrexpress",
      "noest",
    ]);
    expect(status[3]?.capabilities.booking.status).toBe("uncertified");
  });
});
