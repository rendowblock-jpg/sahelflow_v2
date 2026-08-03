import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { enqueueAutomationTrigger } from "@/lib/automations/trigger-service";
import {
  createTestPrisma,
  disconnectTestPrisma,
  makeContext,
  seedCustomer,
} from "@/lib/data/__tests__/helpers";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

describe("automation trigger cycle identity", () => {
  it("replays one blacklist cycle and creates distinct work after re-blacklisting", async () => {
    const customer = await seedCustomer(db);
    const firstCycle = new Date("2026-08-03T10:00:00.000Z");
    await db.customer.update({
      where: { id: customer.id },
      data: { isBlacklisted: true, blacklistedAt: firstCycle },
    });

    const payload = {
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
    };
    const first = await enqueueAutomationTrigger(
      makeContext(db),
      "customer.blacklisted",
      payload,
      { triggerKey: `customer.blacklisted:${customer.id}` },
    );
    const replay = await enqueueAutomationTrigger(
      makeContext(db),
      "customer.blacklisted",
      payload,
      { triggerKey: `customer.blacklisted:${customer.id}` },
    );

    expect(replay).toMatchObject({
      effectKey: first.effectKey,
      triggerKey: first.triggerKey,
      replayed: true,
    });
    expect(first.triggerKey).toContain(firstCycle.toISOString());

    const secondCycle = new Date("2026-08-03T11:00:00.000Z");
    await db.customer.update({
      where: { id: customer.id },
      data: { isBlacklisted: true, blacklistedAt: secondCycle },
    });
    const next = await enqueueAutomationTrigger(
      makeContext(db),
      "customer.blacklisted",
      payload,
      { triggerKey: `customer.blacklisted:${customer.id}` },
    );

    expect(next.replayed).toBe(false);
    expect(next.effectKey).not.toBe(first.effectKey);
    expect(next.triggerKey).toContain(secondCycle.toISOString());
  });
});
