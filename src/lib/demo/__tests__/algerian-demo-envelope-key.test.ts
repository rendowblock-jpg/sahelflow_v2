import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { BUSINESS_ENVELOPE_SECRET_KEY } from "@/lib/business-truth/envelope-key";
import type { DbClient } from "@/lib/db";
import {
  getAlgerianDemoWorkspaceStatus,
  loadAlgerianDemoWorkspace,
  removeAlgerianDemoWorkspace,
} from "@/lib/demo/algerian-demo-lifecycle";
import {
  createTestPrisma,
  disconnectTestPrisma,
} from "@/lib/data/__tests__/helpers";

let prisma: PrismaClient;
const client = () => prisma as unknown as DbClient;

beforeEach(async () => {
  prisma = await createTestPrisma();
  await prisma.secret.deleteMany();
  await prisma.setting.deleteMany();
});

afterEach(async () => {
  await prisma.secret.deleteMany().catch(() => undefined);
  await prisma.setting.deleteMany().catch(() => undefined);
  await disconnectTestPrisma(prisma);
});

describe("Algerian demo internal envelope-key lifecycle", () => {
  it("allows demo load and removal while preserving the internal wrapped key", async () => {
    await prisma.secret.create({
      data: {
        key: BUSINESS_ENVELOPE_SECRET_KEY,
        ciphertext: "internal-ciphertext",
        iv: "internal-iv",
        tag: "internal-tag",
      },
    });

    await expect(getAlgerianDemoWorkspaceStatus(client())).resolves.toMatchObject({
      loaded: false,
      canSeed: true,
      hasBusinessData: false,
    });

    await expect(loadAlgerianDemoWorkspace(client())).resolves.toMatchObject({
      loaded: true,
      canSeed: false,
    });
    await expect(removeAlgerianDemoWorkspace(client())).resolves.toMatchObject({
      loaded: false,
      canSeed: true,
      hasBusinessData: false,
    });

    await expect(
      prisma.secret.findUnique({ where: { key: BUSINESS_ENVELOPE_SECRET_KEY } }),
    ).resolves.toMatchObject({ key: BUSINESS_ENVELOPE_SECRET_KEY });
  });
});
