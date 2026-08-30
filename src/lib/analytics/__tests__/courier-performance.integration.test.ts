/**
 * DB-backed integration tests for the R4-d analytics loaders
 * (getCourierPerformance + getAnalyticsReportForRange) — verifies the
 * shop-scoped queries respect the resolved range window, the Delivery→Order
 * projection and the fee coalescing (Delivery.cost ?? Order.deliveryCost).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { resolveAnalyticsRange } from "@/lib/analytics/range";
import { getAnalyticsReportForRange } from "@/lib/analytics/report";
import { getCourierPerformance } from "@/lib/analytics/courier-performance";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedTestCustomer,
  uniquePhone,
} from "@/lib/data/__tests__/helpers";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

async function seedShipment(options: {
  provider: string;
  deliveryStatus: string;
  orderStatus: string;
  orderDeliveryCost?: number | null;
  deliveryCost?: number | null;
  createdAt?: Date;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
  wilaya?: string;
}) {
  const customer = await seedTestCustomer(db, { phone: uniquePhone() });
  const counter = await db.counter.upsert({
    where: { name: "ORD" },
    update: { value: { increment: 1 } },
    create: { name: "ORD", value: 1 },
  });
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-${String(counter.value).padStart(4, "0")}`,
      status: options.orderStatus,
      customerId: customer.id,
      totalPrice: 5000,
      deliveryCost: options.orderDeliveryCost ?? null,
      wilaya: options.wilaya ?? "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue",
      phone: uniquePhone(),
      source: "manual",
      createdAt: options.createdAt ?? new Date(),
      ...(options.shippedAt ? { shippedAt: options.shippedAt } : {}),
      ...(options.deliveredAt ? { deliveredAt: options.deliveredAt } : {}),
    },
  });
  return db.delivery.create({
    data: {
      orderId: order.id,
      provider: options.provider,
      status: options.deliveryStatus,
      cost: options.deliveryCost ?? null,
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    },
  });
}

describe("getCourierPerformance", () => {
  it("aggregates per-courier COD economics inside the resolved window", async () => {
    const now = new Date();
    const inRange = new Date(now.getTime() - 86_400_000);
    const outOfRange = new Date(now.getTime() - 40 * 86_400_000);

    await seedShipment({
      provider: "yalidine",
      deliveryStatus: "delivered",
      orderStatus: "delivered",
      deliveryCost: 600,
      createdAt: inRange,
      shippedAt: new Date(inRange.getTime() - 86_400_000),
      deliveredAt: inRange,
    });
    await seedShipment({
      provider: "yalidine",
      deliveryStatus: "returned",
      orderStatus: "returned",
      orderDeliveryCost: 700,
      createdAt: inRange,
    });
    await seedShipment({
      provider: "maystro",
      deliveryStatus: "in_transit",
      orderStatus: "shipped",
      createdAt: inRange,
      wilaya: "Oran",
    });
    // Outside the 7d window — must not count.
    await seedShipment({
      provider: "maystro",
      deliveryStatus: "delivered",
      orderStatus: "delivered",
      createdAt: outOfRange,
    });

    const range = resolveAnalyticsRange({ range: "7d" });
    const result = await getCourierPerformance(range, { includeFees: true });

    expect(result.totalShipments).toBe(3);
    expect(result.feesIncluded).toBe(true);

    const yalidine = result.providers.find((p) => p.provider === "yalidine")!;
    expect(yalidine.shipments).toBe(2);
    expect(yalidine.delivered).toBe(1);
    expect(yalidine.returned).toBe(1);
    expect(yalidine.deliveryRate).toBe(50);
    expect(yalidine.avgDeliveryDays).toBe(1);
    // Delivery.cost=600 + Order.deliveryCost fallback=700.
    expect(yalidine.totalFees).toBe(1300);

    const maystro = result.providers.find((p) => p.provider === "maystro")!;
    expect(maystro.shipments).toBe(1);
    expect(maystro.inTransit).toBe(1);
    expect(maystro.avgDeliveryDays).toBeNull();

    expect(result.matrix.wilayas).toContain("Alger");
    const algerCell = result.matrix.cells.find(
      (cell) => cell.wilaya === "Alger" && cell.provider === "yalidine",
    )!;
    expect(algerCell.shipments).toBe(2);
    expect(algerCell.delivered).toBe(1);
    expect(algerCell.successRate).toBe(50);
  });

  it("hides fee data entirely when financial field access is denied", async () => {
    const inRange = new Date(Date.now() - 3_600_000);
    await seedShipment({
      provider: "yalidine",
      deliveryStatus: "delivered",
      orderStatus: "delivered",
      deliveryCost: 600,
      createdAt: inRange,
    });
    const range = resolveAnalyticsRange({ range: "7d" });
    const result = await getCourierPerformance(range, { includeFees: false });
    expect(result.feesIncluded).toBe(false);
    expect(result.providers[0]!.totalFees).toBeNull();
  });
});

describe("getAnalyticsReportForRange", () => {
  it("computes the report for a custom window with day-aligned buckets", async () => {
    const from = new Date();
    from.setDate(from.getDate() - 3);
    from.setHours(0, 0, 0, 0);

    await seedShipment({
      provider: "yalidine",
      deliveryStatus: "delivered",
      orderStatus: "delivered",
      deliveryCost: 500,
      createdAt: from,
    });
    await seedShipment({
      provider: "maystro",
      deliveryStatus: "pending",
      orderStatus: "pending",
      createdAt: new Date(),
    });

    const range = resolveAnalyticsRange({
      range: "custom",
      from: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`,
      to: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
    });

    const report = await getAnalyticsReportForRange(range);
    expect(range.days).toBe(4);
    expect(report.summary.totalOrders).toBe(2);
    expect(report.summary.deliveryRate).toBe(50);
    // Exactly one bucket per inclusive day of the window.
    expect(report.revenueTimeSeries).toHaveLength(range.days);
    expect(report.customerGrowth).toHaveLength(range.days);
    expect(report.statusDistribution.map((slice) => slice.key).sort()).toEqual(
      ["delivered", "pending"],
    );
    expect(report.deliveryPerformance.byProvider).toHaveLength(2);
  });
});
