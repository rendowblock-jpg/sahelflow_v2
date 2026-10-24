/**
 * MNY-13: "today", the period starts and the hour buckets are cut at Algeria
 * midnight (UTC+1), not at the computer's own midnight. The clock is faked to
 * 23:30 UTC = 00:30 on the next day in Algeria; an order 20 minutes earlier
 * (23:10 UTC) is already "today", one at 22:30 UTC is still "yesterday".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { statsService } from "@/lib/data/stats-service";
import { orderService } from "@/lib/data/order-service";
import { analyticsService } from "@/lib/data/analytics";
import { getDashboardAnalytics } from "@/lib/data/analytics-data";
import { HOST_TIME_ZONES, useHostTimeZone } from "@/test-utils/host-tz";
import {
  createTestPrisma,
  disconnectTestPrisma,
  makeContext,
  seedCustomer,
  uniquePhone,
} from "./helpers";

const NOW = new Date("2026-10-24T23:30:00.000Z");
const LAST_NIGHT = new Date("2026-10-24T22:30:00.000Z"); // 23:30 on the 24th in Algeria
const JUST_AFTER_MIDNIGHT = new Date("2026-10-24T23:10:00.000Z"); // 00:10 on the 25th

let db: PrismaClient;

async function seedOrders(): Promise<void> {
  const customer = await seedCustomer(db, { phone: uniquePhone() });
  const base = {
    status: "delivered", customerId: customer.id, totalPrice: 1000, wilaya: "A",
    commune: "B", address: "C", phone: "0555123456", source: "manual",
  };
  await db.order.create({ data: { ...base, orderNumber: "ORD-0001", createdAt: LAST_NIGHT } });
  await db.order.create({ data: { ...base, orderNumber: "ORD-0002", createdAt: JUST_AFTER_MIDNIGHT } });
}

describe.each(HOST_TIME_ZONES)("shop day boundaries with the host set to %s", (zone) => {
  useHostTimeZone(zone);

  beforeEach(async () => {
    db = await createTestPrisma();
    await seedOrders();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(async () => {
    vi.useRealTimers();
    await disconnectTestPrisma(db);
  });

  it("statsService.getDashboard counts today and yesterday by shop day", async () => {
    const stats = await statsService.getDashboard({ prisma: db as never });
    expect(stats.ordersToday).toBe(1);
    expect(stats.revenueToday).toBe(1000);
  });

  it("orderService.listToday returns only the orders after shop midnight", async () => {
    const rows = await orderService.listToday({ prisma: db as never });
    expect(rows.map((row) => row.orderNumber)).toEqual(["ORD-0002"]);
  });

  it("analyticsService.getReport buckets days and hours in shop time", async () => {
    const report = await analyticsService.getReport(makeContext(db), 3);
    expect(report.revenueTimeSeries.map((point) => point.date)).toEqual([
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(report.revenueTimeSeries.map((point) => point.orders)).toEqual([0, 1, 1]);
    expect(report.salesByHour[0]!.orders).toBe(1); // 00:10 shop time
    expect(report.salesByHour[23]!.orders).toBe(1); // 23:30 shop time
  });

  it("getDashboardAnalytics (limited path) starts its 7 days at shop midnight", async () => {
    const series = await getDashboardAnalytics({
      orders: true, orderFinancials: true, customerContact: false, customers: false,
      conversations: false, deliveries: false, products: false, analytics: true,
      analyticsFinancials: true, risk: false,
    });
    expect(series.revenueSeries.map((point) => point.date)).toEqual([
      "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22",
      "2026-10-23", "2026-10-24", "2026-10-25",
    ]);
    expect(series.revenueSeries.at(-1)!.orders).toBe(1);
    expect(series.revenueSeries.at(-2)!.orders).toBe(1);
  });
});
