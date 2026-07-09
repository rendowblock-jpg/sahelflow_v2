/**
 * Phase 4 — canonical metrics tests (pure-function edge cases).
 *
 * Each `describe` block seeds a known scenario with the raw PrismaClient
 * (no PII extension needed — the metrics queries touch only non-PII
 * fields: totalPrice, status, createdAt, deliveredAt, cost, amount) and
 * asserts the canonical formula's output. Edge cases per
 * DATA_INTEGRITY_PLAN.md Phase 4 (lines 263-313):
 *
 *   - No orders in period       → gross=0, realized=0, net=0, rate=0/0
 *   - All cancelled             → gross=0 (cancelled excluded)
 *   - All draft                 → gross=0 (draft excluded)
 *   - Mixed statuses            → gross INCLUDES returned/refused
 *   - Period boundaries         → [from, to) half-open (from inclusive,
 *                                  to exclusive)
 *   - deliveredAt vs createdAt → realized uses deliveredAt, not createdAt
 *   - Refund status             → only "completed" refunds reduce net
 *   - Delivery cost null        → null costs contribute 0 to net
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";

import {
  grossRevenue,
  realizedRevenue,
  netRevenue,
  deliveryRate,
  courierDeliveryRate,
  REVENUE_EXCLUDED_STATUSES,
} from "@/lib/data/metrics";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedCustomer,
  uniquePhone,
} from "./helpers";

let db: PrismaClient;

beforeEach(async () => { db = await createTestPrisma(); });
afterEach(async () => { await disconnectTestPrisma(db); });

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a half-open period `[from, to)` from two offset-in-days values. */
function periodFromDays(fromOffset: number, toOffset: number) {
  const now = Date.now();
  return {
    from: new Date(now + fromOffset * 86_400_000),
    to: new Date(now + toOffset * 86_400_000),
  };
}

/** Today as a half-open period [startOfDay, startOfTomorrow). */
function todayPeriod() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfDay);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  return { from: startOfDay, to: startOfTomorrow };
}

/** Create an order with a specific status + totalPrice + createdAt. */
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

/** Create a Delivery row for an order with an optional cost. */
async function seedDelivery(orderId: string, opts: { status?: string; cost?: number | null; createdAt?: Date } = {}) {
  return db.delivery.create({
    data: {
      orderId,
      provider: "yalidine",
      status: opts.status ?? "pending",
      ...(opts.cost !== undefined ? { cost: opts.cost } : { cost: null }),
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
}

/** Create a Refund row for an order with a status (default completed). */
async function seedRefund(orderId: string, amount: number, opts: { status?: string; createdAt?: Date } = {}) {
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

// ── REVENUE_EXCLUDED_STATUSES constant ──────────────────────────────────────

describe("REVENUE_EXCLUDED_STATUSES", () => {
  it("excludes only cancelled + draft (returned/refused are gross)", () => {
    expect([...REVENUE_EXCLUDED_STATUSES]).toEqual(["cancelled", "draft"]);
  });
});

// ── grossRevenue ────────────────────────────────────────────────────────────

describe("grossRevenue", () => {
  it("returns 0 on an empty database", async () => {
    expect(await grossRevenue(db as never, todayPeriod())).toBe(0);
  });

  it("returns 0 when all orders are cancelled", async () => {
    await seedOrder({ status: "cancelled", totalPrice: 1000, createdAt: new Date() });
    await seedOrder({ status: "cancelled", totalPrice: 2000, createdAt: new Date() });
    expect(await grossRevenue(db as never, todayPeriod())).toBe(0);
  });

  it("returns 0 when all orders are draft", async () => {
    await seedOrder({ status: "draft", totalPrice: 1000, createdAt: new Date() });
    expect(await grossRevenue(db as never, todayPeriod())).toBe(0);
  });

  it("excludes cancelled + draft but INCLUDES returned/refused/pending/confirmed/shipped/delivered", async () => {
    await seedOrder({ status: "delivered", totalPrice: 1000, createdAt: new Date() });
    await seedOrder({ status: "pending", totalPrice: 2000, createdAt: new Date() });
    await seedOrder({ status: "confirmed", totalPrice: 4000, createdAt: new Date() });
    await seedOrder({ status: "shipped", totalPrice: 5000, createdAt: new Date() });
    await seedOrder({ status: "returned", totalPrice: 6000, createdAt: new Date() });
    await seedOrder({ status: "refused", totalPrice: 7000, createdAt: new Date() });
    await seedOrder({ status: "cancelled", totalPrice: 9999, createdAt: new Date() });
    await seedOrder({ status: "draft", totalPrice: 9999, createdAt: new Date() });
    // 1000 + 2000 + 4000 + 5000 + 6000 + 7000 = 25000
    expect(await grossRevenue(db as never, todayPeriod())).toBe(25000);
  });

  it("period is half-open [from, to) — order at exactly `to` is EXCLUDED", async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfDay);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    // Order at exactly startOfDay (from) — INCLUDED.
    await seedOrder({ totalPrice: 1000, createdAt: startOfDay });
    // Order 1ms before startOfTomorrow — INCLUDED.
    await seedOrder({
      totalPrice: 2000,
      createdAt: new Date(startOfTomorrow.getTime() - 1),
    });
    // Order at exactly startOfTomorrow (to) — EXCLUDED.
    await seedOrder({ totalPrice: 9999, createdAt: startOfTomorrow });

    expect(await grossRevenue(db as never, { from: startOfDay, to: startOfTomorrow })).toBe(3000);
  });

  it("excludes soft-deleted orders", async () => {
    const o1 = await seedOrder({ totalPrice: 1000, createdAt: new Date() });
    await seedOrder({ totalPrice: 2000, createdAt: new Date() });
    await db.order.update({ where: { id: o1.id }, data: { deletedAt: new Date() } });
    expect(await grossRevenue(db as never, todayPeriod())).toBe(2000);
  });

  it("respects the period window — orders outside are excluded", async () => {
    // Yesterday's order — outside today's period.
    const yesterday = new Date(Date.now() - 86_400_000);
    await seedOrder({ totalPrice: 5000, createdAt: yesterday });
    // Today's order — inside.
    await seedOrder({ totalPrice: 1000, createdAt: new Date() });
    expect(await grossRevenue(db as never, todayPeriod())).toBe(1000);
  });
});

// ── realizedRevenue ─────────────────────────────────────────────────────────

describe("realizedRevenue", () => {
  it("returns 0 on an empty database", async () => {
    expect(await realizedRevenue(db as never, todayPeriod())).toBe(0);
  });

  it("returns 0 when no orders have been delivered", async () => {
    await seedOrder({ status: "pending", totalPrice: 1000, createdAt: new Date() });
    await seedOrder({ status: "shipped", totalPrice: 2000, createdAt: new Date() });
    expect(await realizedRevenue(db as never, todayPeriod())).toBe(0);
  });

  it("sums totalPrice where deliveredAt in period AND status = delivered", async () => {
    const now = new Date();
    await seedOrder({ status: "delivered", totalPrice: 1000, deliveredAt: now });
    await seedOrder({ status: "delivered", totalPrice: 2000, deliveredAt: now });
    expect(await realizedRevenue(db as never, todayPeriod())).toBe(3000);
  });

  it("EXCLUDES deliveredAt in period but status now returned (defense-in-depth)", async () => {
    // An order that was delivered today but is now returned — should NOT
    // count as realized (the return reverses the realization).
    await seedOrder({
      status: "returned",
      totalPrice: 1000,
      deliveredAt: new Date(),
    });
    expect(await realizedRevenue(db as never, todayPeriod())).toBe(0);
  });

  it("uses deliveredAt (NOT createdAt) — order created yesterday, delivered today counts in today", async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    const today = new Date();
    // Created yesterday, delivered today.
    await seedOrder({
      status: "delivered",
      totalPrice: 5000,
      createdAt: yesterday,
      deliveredAt: today,
    });
    // Created today, delivered yesterday (rare, but possible with backdated
    // syncs) — should NOT count in today's realized.
    await seedOrder({
      status: "delivered",
      totalPrice: 9999,
      createdAt: today,
      deliveredAt: yesterday,
    });
    expect(await realizedRevenue(db as never, todayPeriod())).toBe(5000);
  });

  it("period is half-open [from, to) — deliveredAt at exactly `to` is EXCLUDED", async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfDay);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    await seedOrder({
      status: "delivered",
      totalPrice: 1000,
      deliveredAt: startOfDay, // from — INCLUDED
    });
    await seedOrder({
      status: "delivered",
      totalPrice: 9999,
      deliveredAt: startOfTomorrow, // to — EXCLUDED
    });
    expect(await realizedRevenue(db as never, { from: startOfDay, to: startOfTomorrow })).toBe(1000);
  });

  it("excludes soft-deleted orders", async () => {
    const o1 = await seedOrder({
      status: "delivered",
      totalPrice: 1000,
      deliveredAt: new Date(),
    });
    await seedOrder({
      status: "delivered",
      totalPrice: 2000,
      deliveredAt: new Date(),
    });
    await db.order.update({ where: { id: o1.id }, data: { deletedAt: new Date() } });
    expect(await realizedRevenue(db as never, todayPeriod())).toBe(2000);
  });
});

// ── netRevenue ──────────────────────────────────────────────────────────────

describe("netRevenue", () => {
  it("returns 0 on an empty database", async () => {
    expect(await netRevenue(db as never, todayPeriod())).toBe(0);
  });

  it("equals realized when no refunds + no delivery costs", async () => {
    await seedOrder({
      status: "delivered",
      totalPrice: 5000,
      deliveredAt: new Date(),
    });
    expect(await netRevenue(db as never, todayPeriod())).toBe(5000);
  });

  it("subtracts completed refunds in period", async () => {
    const o1 = await seedOrder({
      status: "delivered",
      totalPrice: 5000,
      deliveredAt: new Date(),
    });
    await seedRefund(o1.id, 1000, { status: "completed", createdAt: new Date() });
    // realized(5000) - refunds(1000) - deliveryCosts(0) = 4000
    expect(await netRevenue(db as never, todayPeriod())).toBe(4000);
  });

  it("does NOT subtract pending/failed refunds", async () => {
    const o1 = await seedOrder({
      status: "delivered",
      totalPrice: 5000,
      deliveredAt: new Date(),
    });
    await seedRefund(o1.id, 1000, { status: "pending", createdAt: new Date() });
    await seedRefund(o1.id, 500, { status: "failed", createdAt: new Date() });
    // realized(5000) - refunds(0, only completed counts) - deliveryCosts(0) = 5000
    expect(await netRevenue(db as never, todayPeriod())).toBe(5000);
  });

  it("subtracts delivery costs in period (cost on Delivery row)", async () => {
    const o1 = await seedOrder({
      status: "delivered",
      totalPrice: 5000,
      deliveredAt: new Date(),
    });
    await seedDelivery(o1.id, { status: "delivered", cost: 400, createdAt: new Date() });
    // realized(5000) - refunds(0) - deliveryCosts(400) = 4600
    expect(await netRevenue(db as never, todayPeriod())).toBe(4600);
  });

  it("treats null delivery cost as 0 (doesn't subtract)", async () => {
    const o1 = await seedOrder({
      status: "delivered",
      totalPrice: 5000,
      deliveredAt: new Date(),
    });
    await seedDelivery(o1.id, { status: "delivered", cost: null, createdAt: new Date() });
    // realized(5000) - refunds(0) - deliveryCosts(0, null cost) = 5000
    expect(await netRevenue(db as never, todayPeriod())).toBe(5000);
  });

  it("subtracts BOTH refunds + delivery costs in period", async () => {
    const o1 = await seedOrder({
      status: "delivered",
      totalPrice: 5000,
      deliveredAt: new Date(),
    });
    await seedRefund(o1.id, 1000, { status: "completed", createdAt: new Date() });
    await seedDelivery(o1.id, { status: "delivered", cost: 400, createdAt: new Date() });
    // realized(5000) - refunds(1000) - deliveryCosts(400) = 3600
    expect(await netRevenue(db as never, todayPeriod())).toBe(3600);
  });

  it("does NOT subtract refunds outside the period", async () => {
    const o1 = await seedOrder({
      status: "delivered",
      totalPrice: 5000,
      deliveredAt: new Date(),
    });
    // Refund issued 60 days ago — outside the 30d period.
    const oldRefund = new Date(Date.now() - 60 * 86_400_000);
    await seedRefund(o1.id, 1000, { status: "completed", createdAt: oldRefund });
    const last30d = periodFromDays(-30, 1);
    // realized(5000, delivered today) - refunds(0, outside period) - deliveryCosts(0) = 5000
    expect(await netRevenue(db as never, last30d)).toBe(5000);
  });

  it("excludes soft-deleted deliveries from the cost subtraction", async () => {
    const o1 = await seedOrder({
      status: "delivered",
      totalPrice: 5000,
      deliveredAt: new Date(),
    });
    const d1 = await seedDelivery(o1.id, { status: "delivered", cost: 400, createdAt: new Date() });
    await db.delivery.update({ where: { id: d1.id }, data: { deletedAt: new Date() } });
    // realized(5000) - refunds(0) - deliveryCosts(0, soft-deleted) = 5000
    expect(await netRevenue(db as never, todayPeriod())).toBe(5000);
  });
});

// ── deliveryRate (period, by order.status) ──────────────────────────────────

describe("deliveryRate", () => {
  it("returns {rate:0, delivered:0, total:0} on empty database", async () => {
    expect(await deliveryRate(db as never, todayPeriod())).toEqual({
      rate: 0,
      delivered: 0,
      total: 0,
    });
  });

  it("counts ALL non-soft-deleted orders in denominator (by order.status, not delivery.status)", async () => {
    // Mix of statuses — only "delivered" counts in the numerator.
    await seedOrder({ status: "delivered", totalPrice: 1000, createdAt: new Date() });
    await seedOrder({ status: "pending", totalPrice: 2000, createdAt: new Date() });
    await seedOrder({ status: "cancelled", totalPrice: 4000, createdAt: new Date() });
    await seedOrder({ status: "returned", totalPrice: 6000, createdAt: new Date() });
    // 1 delivered / 4 total = 25%
    expect(await deliveryRate(db as never, todayPeriod())).toEqual({
      rate: 25,
      delivered: 1,
      total: 4,
    });
  });

  it("returns rate:100 when all orders are delivered", async () => {
    await seedOrder({ status: "delivered", totalPrice: 1000, createdAt: new Date() });
    await seedOrder({ status: "delivered", totalPrice: 2000, createdAt: new Date() });
    expect(await deliveryRate(db as never, todayPeriod())).toEqual({
      rate: 100,
      delivered: 2,
      total: 2,
    });
  });

  it("returns rate:0 when no orders are delivered (but orders exist)", async () => {
    await seedOrder({ status: "pending", totalPrice: 1000, createdAt: new Date() });
    await seedOrder({ status: "cancelled", totalPrice: 2000, createdAt: new Date() });
    expect(await deliveryRate(db as never, todayPeriod())).toEqual({
      rate: 0,
      delivered: 0,
      total: 2,
    });
  });

  it("respects the period window (orders outside don't count in numerator OR denominator)", async () => {
    // Yesterday's delivered order — outside today's period.
    const yesterday = new Date(Date.now() - 86_400_000);
    await seedOrder({ status: "delivered", totalPrice: 9999, createdAt: yesterday });
    // Today's pending order — inside.
    await seedOrder({ status: "pending", totalPrice: 1000, createdAt: new Date() });
    // 0 delivered / 1 total = 0%
    expect(await deliveryRate(db as never, todayPeriod())).toEqual({
      rate: 0,
      delivered: 0,
      total: 1,
    });
  });

  it("excludes soft-deleted orders from numerator + denominator", async () => {
    const o1 = await seedOrder({ status: "delivered", totalPrice: 1000, createdAt: new Date() });
    await seedOrder({ status: "pending", totalPrice: 2000, createdAt: new Date() });
    await db.order.update({ where: { id: o1.id }, data: { deletedAt: new Date() } });
    // 0 delivered / 1 total = 0%
    expect(await deliveryRate(db as never, todayPeriod())).toEqual({
      rate: 0,
      delivered: 0,
      total: 1,
    });
  });
});

// ── courierDeliveryRate (all-time, from Delivery table) ─────────────────────

describe("courierDeliveryRate", () => {
  it("returns {rate:0, delivered:0, total:0} on empty database", async () => {
    expect(await courierDeliveryRate(db as never)).toEqual({
      rate: 0,
      delivered: 0,
      total: 0,
    });
  });

  it("counts by delivery.status (NOT order.status) — separate metric from deliveryRate", async () => {
    const o1 = await seedOrder({ status: "delivered", totalPrice: 1000, createdAt: new Date() });
    const o2 = await seedOrder({ status: "delivered", totalPrice: 2000, createdAt: new Date() });
    const o3 = await seedOrder({ status: "delivered", totalPrice: 3000, createdAt: new Date() });
    const o4 = await seedOrder({ status: "delivered", totalPrice: 4000, createdAt: new Date() });

    // 2 deliveries marked delivered, 1 returned, 1 pending.
    await seedDelivery(o1.id, { status: "delivered" });
    await seedDelivery(o2.id, { status: "delivered" });
    await seedDelivery(o3.id, { status: "returned" });
    await seedDelivery(o4.id, { status: "pending" });

    // 2 delivered / 4 total = 50%
    expect(await courierDeliveryRate(db as never)).toEqual({
      rate: 50,
      delivered: 2,
      total: 4,
    });
  });

  it("is all-time (no period filter) — old deliveries still count", async () => {
    const o1 = await seedOrder({ status: "delivered", totalPrice: 1000, createdAt: new Date() });
    // Delivery created 1 year ago.
    const oldDate = new Date(Date.now() - 365 * 86_400_000);
    await seedDelivery(o1.id, { status: "delivered", createdAt: oldDate });
    expect(await courierDeliveryRate(db as never)).toEqual({
      rate: 100,
      delivered: 1,
      total: 1,
    });
  });

  it("excludes soft-deleted deliveries", async () => {
    const o1 = await seedOrder({ status: "delivered", totalPrice: 1000, createdAt: new Date() });
    const o2 = await seedOrder({ status: "delivered", totalPrice: 2000, createdAt: new Date() });
    const d1 = await seedDelivery(o1.id, { status: "delivered" });
    await seedDelivery(o2.id, { status: "returned" });
    await db.delivery.update({ where: { id: d1.id }, data: { deletedAt: new Date() } });
    // 0 delivered / 1 total = 0% (soft-deleted delivery excluded)
    expect(await courierDeliveryRate(db as never)).toEqual({
      rate: 0,
      delivered: 0,
      total: 1,
    });
  });
});
