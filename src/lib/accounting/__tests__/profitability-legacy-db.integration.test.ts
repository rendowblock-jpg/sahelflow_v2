/**
 * The governed profitability projection on real SQLite, for orders that have no
 * canonical facts (the legacy compatibility path).
 *
 * These cases used to be tested through `realizedRevenue()` and `netRevenue()` in
 * lib/data/metrics.ts, two thin wrappers nobody called (MNY-05). The wrappers are
 * gone; what they proved about the projection is kept here, called directly:
 * only delivered, not soft-deleted orders count; the period is half-open on
 * `deliveredAt`; only completed refunds inside the period reduce net revenue.
 * Dates are fixed, so the cases do not depend on the time of day they run.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { getProfitabilityProjection } from "@/lib/accounting/profitability";
import {
  createTestPrisma,
  seedCustomer,
  teardownTestPrisma,
  uniquePhone,
} from "@/lib/data/__tests__/helpers";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
});
afterEach(async () => {
  await teardownTestPrisma(db);
});

const from = new Date("2026-07-01T00:00:00.000Z");
const to = new Date("2026-08-01T00:00:00.000Z");
const period = { from, to };
const inside = new Date("2026-07-15T12:00:00.000Z");
const before = new Date("2026-06-20T12:00:00.000Z");
const after = new Date("2026-08-15T12:00:00.000Z");

async function seedOrder(opts: {
  status?: string;
  totalPrice?: number;
  createdAt?: Date;
  deliveredAt?: Date;
}) {
  const customer = await seedCustomer(db, { phone: uniquePhone() });
  const counter = await db.counter.upsert({
    where: { name: "ORD" },
    update: { value: { increment: 1 } },
    create: { name: "ORD", value: 1 },
  });
  return db.order.create({
    data: {
      orderNumber: `ORD-${String(counter.value).padStart(4, "0")}`,
      status: opts.status ?? "pending",
      customerId: customer.id,
      totalPrice: opts.totalPrice ?? 1000,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123",
      phone: uniquePhone(),
      source: "manual",
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      ...(opts.deliveredAt ? { deliveredAt: opts.deliveredAt } : {}),
    },
  });
}

async function seedRefund(
  orderId: string,
  amount: number,
  opts: { status?: string; createdAt?: Date } = {},
) {
  return db.refund.create({
    data: {
      orderId,
      amount,
      method: "cash",
      status: opts.status ?? "completed",
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
}

describe("profitability projection, legacy orders on SQLite: earned revenue", () => {
  it("is 0 on an empty database", async () => {
    const projection = await getProfitabilityProjection(db as never, period);
    expect(projection.grossRevenue).toBe(0);
    expect(projection.netRevenue).toBe(0);
  });

  it("is 0 when no order has been delivered", async () => {
    await seedOrder({ status: "pending", totalPrice: 1000, createdAt: inside });
    await seedOrder({ status: "shipped", totalPrice: 2000, createdAt: inside });
    expect((await getProfitabilityProjection(db as never, period)).grossRevenue).toBe(0);
  });

  it("sums the total of orders delivered inside the period", async () => {
    await seedOrder({ status: "delivered", totalPrice: 1000, deliveredAt: inside });
    await seedOrder({ status: "delivered", totalPrice: 2000, deliveredAt: inside });
    expect((await getProfitabilityProjection(db as never, period)).grossRevenue).toBe(3000);
  });

  it("does not count an order that was delivered inside the period but is now returned", async () => {
    await seedOrder({ status: "returned", totalPrice: 1000, deliveredAt: inside });
    expect((await getProfitabilityProjection(db as never, period)).grossRevenue).toBe(0);
  });

  it("dates revenue by deliveredAt, not createdAt", async () => {
    // Created before the period, delivered inside it: counts.
    await seedOrder({ status: "delivered", totalPrice: 1000, createdAt: before, deliveredAt: inside });
    // Created inside the period, delivered after it: does not count.
    await seedOrder({ status: "delivered", totalPrice: 7000, createdAt: inside, deliveredAt: after });
    expect((await getProfitabilityProjection(db as never, period)).grossRevenue).toBe(1000);
  });

  it("does not count an order that was delivered before the period started", async () => {
    await seedOrder({ status: "delivered", totalPrice: 4000, createdAt: before, deliveredAt: before });
    await seedOrder({ status: "delivered", totalPrice: 1000, deliveredAt: inside });
    expect((await getProfitabilityProjection(db as never, period)).grossRevenue).toBe(1000);
  });

  it("treats the period as half-open: the start counts, the end does not", async () => {
    await seedOrder({ status: "delivered", totalPrice: 1000, deliveredAt: from });
    await seedOrder({ status: "delivered", totalPrice: 5000, deliveredAt: to });
    expect((await getProfitabilityProjection(db as never, period)).grossRevenue).toBe(1000);
  });

  it("leaves out soft-deleted orders", async () => {
    const gone = await seedOrder({ status: "delivered", totalPrice: 9000, deliveredAt: inside });
    await seedOrder({ status: "delivered", totalPrice: 1000, deliveredAt: inside });
    await db.order.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    expect((await getProfitabilityProjection(db as never, period)).grossRevenue).toBe(1000);
  });
});

describe("profitability projection, legacy orders on SQLite: refunds", () => {
  it("net revenue equals earned revenue when there are no refunds", async () => {
    await seedOrder({ status: "delivered", totalPrice: 5000, deliveredAt: inside });
    const projection = await getProfitabilityProjection(db as never, period);
    expect(projection.grossRevenue).toBe(5000);
    expect(projection.netRevenue).toBe(5000);
  });

  it("subtracts a completed refund made inside the period", async () => {
    const order = await seedOrder({ status: "delivered", totalPrice: 5000, deliveredAt: inside });
    await seedRefund(order.id, 1000, { status: "completed", createdAt: inside });
    const projection = await getProfitabilityProjection(db as never, period);
    expect(projection.grossRevenue).toBe(5000);
    expect(projection.refunds).toBe(1000);
    expect(projection.netRevenue).toBe(4000);
  });

  it("does not subtract pending or failed refunds", async () => {
    const order = await seedOrder({ status: "delivered", totalPrice: 5000, deliveredAt: inside });
    await seedRefund(order.id, 1000, { status: "pending", createdAt: inside });
    await seedRefund(order.id, 500, { status: "failed", createdAt: inside });
    const projection = await getProfitabilityProjection(db as never, period);
    expect(projection.refunds).toBe(0);
    expect(projection.netRevenue).toBe(5000);
  });

  it("does not subtract a refund that was reversed", async () => {
    const order = await seedOrder({ status: "delivered", totalPrice: 5000, deliveredAt: inside });
    const refund = await seedRefund(order.id, 1000, { status: "completed", createdAt: inside });
    await db.refund.update({ where: { id: refund.id }, data: { reversed: true } });
    const projection = await getProfitabilityProjection(db as never, period);
    expect(projection.refunds).toBe(0);
    expect(projection.netRevenue).toBe(5000);
  });

  it("does not subtract a refund made outside the period", async () => {
    const order = await seedOrder({ status: "delivered", totalPrice: 5000, deliveredAt: inside });
    await seedRefund(order.id, 1000, { status: "completed", createdAt: before });
    await seedRefund(order.id, 2000, { status: "completed", createdAt: to });
    const projection = await getProfitabilityProjection(db as never, period);
    expect(projection.refunds).toBe(0);
    expect(projection.netRevenue).toBe(5000);
  });
});
