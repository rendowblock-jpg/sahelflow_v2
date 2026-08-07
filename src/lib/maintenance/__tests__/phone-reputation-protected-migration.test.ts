import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  migratePhoneReputationBlindIndexes,
  PHONE_REPUTATION_MIGRATION_MARKER,
} from "@/lib/maintenance/phone-reputation-protected-migration";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";

const ROOT = Buffer.from(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "hex",
);

function fakePrisma(options?: {
  marker?: { value: string } | null;
  rows?: Array<{ id: string; phoneHash: string; last4: string | null }>;
}) {
  const findMarker = vi.fn().mockResolvedValue(options?.marker ?? null);
  const findRows = vi.fn().mockResolvedValue(options?.rows ?? []);
  const upsertMarker = vi.fn().mockResolvedValue({});

  const prisma = {
    setting: {
      findUnique: findMarker,
      upsert: upsertMarker,
    },
    phoneReputation: {
      findMany: findRows,
    },
  } as unknown as PrismaClient;

  return { prisma, findMarker, findRows, upsertMarker };
}

describe("phone reputation protected migration", () => {
  it("marks an empty legacy registry complete in apply mode", async () => {
    const { prisma, findRows, upsertMarker } = fakePrisma();

    await expect(
      migratePhoneReputationBlindIndexes(prisma, {
        mode: "apply",
        shopContext: TEST_SHOP_CONTEXT,
        installationRoot: ROOT,
      }),
    ).resolves.toBe(0);

    expect(findRows).toHaveBeenCalledOnce();
    expect(upsertMarker).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: PHONE_REPUTATION_MIGRATION_MARKER },
      }),
    );
  });

  it("keeps verify mode read-only when no reputation rows exist", async () => {
    const { prisma, upsertMarker } = fakePrisma();

    await expect(
      migratePhoneReputationBlindIndexes(prisma, {
        mode: "verify",
        shopContext: TEST_SHOP_CONTEXT,
        installationRoot: ROOT,
      }),
    ).resolves.toBe(0);

    expect(upsertMarker).not.toHaveBeenCalled();
  });

  it("returns immediately when the canonical marker already exists", async () => {
    const { prisma, findRows } = fakePrisma({
      marker: { value: "canonical-shop-blind-index-v1" },
    });

    await expect(
      migratePhoneReputationBlindIndexes(prisma, {
        mode: "apply",
        shopContext: TEST_SHOP_CONTEXT,
        installationRoot: ROOT,
      }),
    ).resolves.toBe(0);

    expect(findRows).not.toHaveBeenCalled();
  });

  it("fails closed on a malformed completion marker", async () => {
    const { prisma, findRows } = fakePrisma({
      marker: { value: "unexpected-generation" },
    });

    await expect(
      migratePhoneReputationBlindIndexes(prisma, {
        mode: "apply",
        shopContext: TEST_SHOP_CONTEXT,
        installationRoot: ROOT,
      }),
    ).rejects.toThrow("Phone-reputation migration marker is invalid");

    expect(findRows).not.toHaveBeenCalled();
  });
});
