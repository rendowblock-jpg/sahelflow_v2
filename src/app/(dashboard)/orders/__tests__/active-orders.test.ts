/**
 * Regression test for Phase 1 bug 1.5 — orders page "active orders" stat
 * capped at 200.
 *
 * Before the fix, the orders page computed "active orders" by filtering
 * `allOrders` (fetched with `take: 200`), so shops with >200 orders
 * undercounted the stat. The fix routes through `computeActiveOrderCount`,
 * which sums pending + confirmed + shipped counts from the uncapped
 * `db.order.groupBy` result.
 *
 * This test seeds 250 orders (50 pending, 50 confirmed, 50 shipped, 100
 * delivered) — exactly the scenario that broke the old code — and asserts
 * the helper returns 150.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { computeActiveOrderCount } from "../active-orders";
import { cleanDb } from "@/app/api/__tests__/helpers";

process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const db = new PrismaClient();

async function seedOrdersOfStatus(status: string, count: number, startIdx: number) {
  // Use a single customer to keep the test fast.
  const customer = await db.customer.create({
    data: {
      name: `C${startIdx}`,
      phone: `0${500000000 + startIdx}`,
      nameBlindIndex: `idx-${startIdx}`,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
    },
  });
  await db.order.createMany({
    data: Array.from({ length: count }, (_, index) => ({
        orderNumber: `TEST-${status}-${startIdx}-${index}`,
        status,
        customerId: customer.id,
        totalPrice: 1000,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue Didouche",
        phone: "0555123456",
        source: "manual",
      })),
  });
}

describe("computeActiveOrderCount — Phase 1 bug 1.5 (orders page stat cap)", () => {
  beforeEach(async () => {
    await cleanDb();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("returns 150 for 50 pending + 50 confirmed + 50 shipped + 100 delivered (250 total)", async () => {
    // Seed 250 orders — the scenario that exceeded the old `take: 200` cap.
    await seedOrdersOfStatus("pending", 50, 1);
    await seedOrdersOfStatus("confirmed", 50, 2);
    await seedOrdersOfStatus("shipped", 50, 3);
    await seedOrdersOfStatus("delivered", 100, 4);

    // Same query the orders page uses — uncapped groupBy on status.
    const statusGroups = await db.order.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    });

    const active = computeActiveOrderCount(statusGroups);
    expect(active).toBe(150);
  });

  it("returns 0 when there are no active-status orders", () => {
    const groups = [
      { status: "delivered", _count: { _all: 100 } },
      { status: "cancelled", _count: { _all: 30 } },
    ];
    expect(computeActiveOrderCount(groups)).toBe(0);
  });

  it("returns 0 for an empty groupBy result", () => {
    expect(computeActiveOrderCount([])).toBe(0);
  });

  it("sums only pending/confirmed/shipped — ignores other statuses", () => {
    const groups = [
      { status: "pending", _count: { _all: 5 } },
      { status: "confirmed", _count: { _all: 7 } },
      { status: "shipped", _count: { _all: 3 } },
      { status: "delivered", _count: { _all: 999 } },
      { status: "returned", _count: { _all: 999 } },
      { status: "cancelled", _count: { _all: 999 } },
      { status: "draft", _count: { _all: 999 } },
      { status: "refused", _count: { _all: 999 } },
    ];
    expect(computeActiveOrderCount(groups)).toBe(5 + 7 + 3);
  });

  it("treats a missing status as 0 (no NaN)", () => {
    const groups = [
      { status: "pending", _count: { _all: 10 } },
      // confirmed + shipped absent
    ];
    expect(computeActiveOrderCount(groups)).toBe(10);
  });
});
