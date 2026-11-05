/**
 * How long the late confirmations have waited (item 1, dashboard lead).
 * The three parts use the SAME threshold as getStaleOrderCount (createdAt strictly older than 2 h), so they always add
 * up to that count: exactly 2 h old is not late yet; exactly 6 h belongs to the first part; exactly 24 h to the second.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { getStaleOrderAges } from "@/lib/data/confirmation-queue";

import { createTestPrisma, disconnectTestPrisma, seedCustomer, uniquePhone } from "./helpers";

vi.mock("@/lib/db", () => ({ db: {} }));

const NOW = new Date("2026-11-05T12:00:00.000Z");
const hoursAgo = (hours: number, extraMinutes = 0) => new Date(NOW.getTime() - (hours * 60 + extraMinutes) * 60_000);

let db: PrismaClient;
let sequence = 0;
beforeEach(async () => {
  db = await createTestPrisma();
  sequence = 0;
});
afterEach(async () => {
  await disconnectTestPrisma(db);
});

async function order(createdAt: Date, over: { status?: string; deletedAt?: Date | null } = {}) {
  const customer = await seedCustomer(db, { phone: uniquePhone() });
  sequence += 1;
  await db.order.create({
    data: {
      orderNumber: `AGE-${String(sequence).padStart(4, "0")}`,
      status: over.status ?? "pending",
      customerId: customer.id,
      totalPrice: 1000,
      wilaya: "A",
      commune: "B",
      address: "C",
      phone: "0555123456",
      source: "manual",
      createdAt,
      deletedAt: over.deletedAt ?? null,
    },
  });
}

describe("getStaleOrderAges", () => {
  it("splits late pending orders into 2-6 h, 6-24 h and over 24 h", async () => {
    await order(hoursAgo(1)); // not late
    await order(hoursAgo(3));
    await order(hoursAgo(5, 59));
    await order(hoursAgo(7));
    await order(hoursAgo(23));
    await order(hoursAgo(25));
    await order(hoursAgo(100));
    const ages = await getStaleOrderAges({ client: db as never, now: NOW });
    expect(ages).toEqual({ from2to6h: 2, from6to24h: 2, over24h: 2 });
  });

  it("uses the same strict threshold as the late count: exactly 2 h is not late, exactly 6 h and 24 h fall in the older part", async () => {
    await order(hoursAgo(2)); // exactly 2 h: not late
    await order(hoursAgo(6)); // exactly 6 h: first part
    await order(hoursAgo(24)); // exactly 24 h: second part
    const ages = await getStaleOrderAges({ client: db as never, now: NOW });
    expect(ages).toEqual({ from2to6h: 1, from6to24h: 1, over24h: 0 });
  });

  it("ignores orders that are not waiting for confirmation or were deleted", async () => {
    await order(hoursAgo(10), { status: "confirmed" });
    await order(hoursAgo(10), { status: "delivered" });
    await order(hoursAgo(10), { deletedAt: hoursAgo(1) });
    await order(hoursAgo(10)); // the only one that counts
    const ages = await getStaleOrderAges({ client: db as never, now: NOW });
    expect(ages).toEqual({ from2to6h: 0, from6to24h: 1, over24h: 0 });
  });

  it("an empty shop is three zeros, never NaN", async () => {
    const ages = await getStaleOrderAges({ client: db as never, now: NOW });
    expect(ages).toEqual({ from2to6h: 0, from6to24h: 0, over24h: 0 });
  });
});
