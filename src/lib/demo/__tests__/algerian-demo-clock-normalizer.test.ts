process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { DbClient } from "@/lib/db";
import {
  clearAlgerianDemoData,
  seedAlgerianDemoData,
} from "@/lib/demo/algerian-demo";
import { finalizeAlgerianDemoStory } from "@/lib/demo/algerian-demo-story";
import {
  createTestPrisma,
  disconnectTestPrisma,
} from "@/lib/data/__tests__/helpers";

const FROZEN_REFERENCE = "2026-02-01T12:00:00.000Z";
const MARKER_KEY = "demo_seed_created_at";

let prisma: PrismaClient;
const client = () => prisma as unknown as DbClient;

beforeEach(async () => {
  process.env.SF_DEMO_REFERENCE_NOW = FROZEN_REFERENCE;
  prisma = await createTestPrisma();
  await clearAlgerianDemoData(client()).catch(() => undefined);
  await prisma.setting.deleteMany({
    where: { key: { in: ["demo_seed_version", MARKER_KEY] } },
  });
});

afterEach(async () => {
  await clearAlgerianDemoData(client()).catch(() => undefined);
  await prisma.setting
    .deleteMany({ where: { key: { in: ["demo_seed_version", MARKER_KEY] } } })
    .catch(() => undefined);
  await disconnectTestPrisma(prisma);
  delete process.env.SF_DEMO_REFERENCE_NOW;
});

describe("Algerian demo reference clock", () => {
  it("rebases the recent seed before annual history so frozen evidence has no future facts", async () => {
    await seedAlgerianDemoData(client());
    await finalizeAlgerianDemoStory(client());

    const reference = new Date(FROZEN_REFERENCE);
    const [latestRecentOrder, latestMessage, latestExpense, marker] =
      await Promise.all([
        prisma.order.findFirst({
          where: {
            id: {
              startsWith: "demo-order-",
              not: { startsWith: "demo-order-year-" },
            },
          },
          orderBy: { createdAt: "desc" },
          select: {
            createdAt: true,
            confirmedAt: true,
            shippedAt: true,
            deliveredAt: true,
            codCollectedAt: true,
            codRemittedAt: true,
          },
        }),
        prisma.message.findFirst({
          where: { id: { startsWith: "demo-" } },
          orderBy: { timestamp: "desc" },
          select: { timestamp: true },
        }),
        prisma.expense.findFirst({
          where: {
            id: {
              startsWith: "demo-expense-",
              not: { startsWith: "demo-expense-year-" },
            },
          },
          orderBy: { date: "desc" },
          select: { date: true },
        }),
        prisma.setting.findUnique({
          where: { key: MARKER_KEY },
          select: { value: true },
        }),
      ]);

    expect(latestRecentOrder).not.toBeNull();
    expect(latestMessage).not.toBeNull();
    expect(latestExpense).not.toBeNull();
    expect(marker?.value).toBe(reference.toISOString());

    for (const value of [
      latestRecentOrder?.createdAt,
      latestRecentOrder?.confirmedAt,
      latestRecentOrder?.shippedAt,
      latestRecentOrder?.deliveredAt,
      latestRecentOrder?.codCollectedAt,
      latestRecentOrder?.codRemittedAt,
      latestMessage?.timestamp,
      latestExpense?.date,
    ]) {
      if (value) expect(value.getTime()).toBeLessThanOrEqual(reference.getTime());
    }
  });
});
