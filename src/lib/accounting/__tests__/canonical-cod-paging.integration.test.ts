process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getCanonicalCodOrderPosition,
  getCanonicalCodWorkspaceSummary,
} from "@/lib/accounting/canonical-cod-projections";
import type { ServiceContext } from "@/lib/data/service-base";
import { trustedManualOrderSourceMetadata } from "@/lib/orders/manual-order-authority";

/**
 * MNY-01 against a REAL SQLite database. canonical-cod-isolation.test.ts proves the paging logic against an in-memory stand-in;
 * this file proves that the id-keyset paging on the real table returns every delivered order exactly once, newest delivery first.
 *
 * 2,300 orders were delivered at the SAME instant (a bulk import, a courier sync): the delivery date alone cannot order them, so only
 * the id decides the page boundaries. 2,300 = three pages (1,000 + 1,000 + 300), which crosses two page boundaries. Two more orders
 * test the order of the list: one delivered a day LATER (it must come first although its id may sort anywhere) and one with NO
 * delivery date (it must come last).
 *
 * The orders have no receivable record on purpose: the projection then reports each one as flagged (receivable_missing), a per-order
 * answer that carries the order id, so completeness, uniqueness and order can be read from `flaggedOrders` without writing the money
 * facts. NOT covered here: the settlement side (it needs settlement rows; the stand-in test covers it).
 */

const db = new PrismaClient();
const context = { prisma: db as never } satisfies ServiceContext;

const SAME_INSTANT = 2_300;
const PREFIX = "PAGING-";
const AT = new Date("2026-10-01T10:00:00.000Z");

async function clean(): Promise<void> {
  await db.order.deleteMany({ where: { orderNumber: { startsWith: PREFIX } } });
  await db.customer.deleteMany({ where: { phone: "paging-customer" } });
}

beforeAll(async () => {
  await clean();
  const customer = await db.customer.create({
    data: { name: "Paging customer", phone: "paging-customer", nameBlindIndex: "paging-customer", wilaya: "Alger", commune: "Alger Centre", address: "Test" },
  });
  const sourceMetadata = trustedManualOrderSourceMetadata();
  const row = (orderNumber: string, deliveredAt: Date | null) => ({
    orderNumber,
    status: "delivered",
    deliveryState: "delivered",
    codState: "receivable",
    deliveredAt,
    version: 1,
    customerId: customer.id,
    totalPrice: 2_500,
    deliveryCost: 0,
    wilaya: "Alger",
    commune: "Alger Centre",
    address: "Test",
    phone: `paging-${orderNumber}`,
    source: "manual",
    sourceMetadata,
  });
  for (let from = 0; from < SAME_INSTANT; from += 500) {
    await db.order.createMany({
      data: Array.from({ length: Math.min(500, SAME_INSTANT - from) }, (_, offset) => row(`${PREFIX}${String(from + offset).padStart(5, "0")}`, AT)),
    });
  }
  await db.order.create({ data: row(`${PREFIX}ZZZ-NEWEST`, new Date("2026-10-02T10:00:00.000Z")) });
  await db.order.create({ data: row(`${PREFIX}AAA-UNDATED`, null) });
}, 120_000);

afterAll(async () => {
  await clean();
  await db.$disconnect();
}, 120_000);

describe("COD reconciliation paging on a real SQLite database (MNY-01)", () => {
  it("reads every one of 2,302 orders exactly once across three pages, the same-instant ones included", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(context as never);
    const mine = summary.flaggedOrders.filter((entry) => entry.orderNumber.startsWith(PREFIX));
    expect(mine).toHaveLength(SAME_INSTANT + 2);
    expect(new Set(mine.map((entry) => entry.orderId)).size).toBe(SAME_INSTANT + 2);
    expect(new Set(mine.map((entry) => entry.orderNumber)).size).toBe(SAME_INSTANT + 2);
    expect(mine.every((entry) => entry.reason === "receivable_missing")).toBe(true);
    expect(summary.truncated).toEqual({ orders: false, settlements: false });
  }, 120_000);

  it("lists the later delivery first and the order with no delivery date last", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(context as never);
    const mine = summary.flaggedOrders.filter((entry) => entry.orderNumber.startsWith(PREFIX));
    expect(mine[0]?.orderNumber).toBe(`${PREFIX}ZZZ-NEWEST`);
    expect(mine[mine.length - 1]?.orderNumber).toBe(`${PREFIX}AAA-UNDATED`);
  }, 120_000);

  it("finds the position of one order through a direct query (it fails closed because this order has no receivable)", async () => {
    const last = await db.order.findFirstOrThrow({ where: { orderNumber: `${PREFIX}${String(SAME_INSTANT - 1).padStart(5, "0")}` }, select: { id: true } });
    await expect(getCanonicalCodOrderPosition(context as never, last.id)).rejects.toThrow(/requires exactly one positive delivered receivable/);
  });
});
