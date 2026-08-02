/**
 * Analytics-data facade tests — getAnalyticsReport + getDashboardAnalytics.
 *
 * Verifies the facade delegates correctly to analyticsService and returns the
 * expected shapes. Seeds orders + items + deliveries for a meaningful report.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getAnalyticsReport, getDashboardAnalytics } from "../analytics-data";
import { getPeriodComparison, getSkuPnl } from "../analytics-v2";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedTestCustomer,
  uniquePhone,
} from "./helpers";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

async function seedOrderWithItem(opts: {
  status?: string;
  totalPrice?: number;
  productName?: string;
  quantity?: number;
  unitPrice?: number;
  deliveryStatus?: string;
  deliveryProvider?: string;
  createdAt?: Date;
} = {}) {
  const customer = await seedTestCustomer(db, { phone: uniquePhone() });
  const counter = await db.counter.upsert({
    where: { name: "ORD" },
    update: { value: { increment: 1 } },
    create: { name: "ORD", value: 1 },
  });
  const qty = opts.quantity ?? 1;
  const unitPrice = opts.unitPrice ?? 2500;
  const total = opts.totalPrice ?? qty * unitPrice;
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-${String(counter.value).padStart(4, "0")}`,
      status: opts.status ?? "confirmed",
      customerId: customer.id,
      totalPrice: total,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue",
      phone: uniquePhone(),
      source: "manual",
      createdAt: opts.createdAt ?? new Date(),
      ...(["delivered", "returned"].includes(opts.status ?? "confirmed")
        ? { deliveredAt: opts.createdAt ?? new Date() }
        : {}),
      items: {
        create: [
          {
            productName: opts.productName ?? "Test Product",
            quantity: qty,
            unitPrice,
            total,
          },
        ],
      },
    },
  });
  if (opts.deliveryStatus) {
    await db.delivery.create({
      data: {
        orderId: order.id,
        provider: opts.deliveryProvider ?? "yalidine",
        status: opts.deliveryStatus,
      },
    });
  }
  return order;
}

describe("getAnalyticsReport", () => {
  it("returns a well-formed AnalyticsReport on an empty DB", async () => {
    const report = await getAnalyticsReport(30);
    expect(report.summary).toBeDefined();
    expect(report.summary.totalRevenue).toBe(0);
    expect(report.summary.totalOrders).toBe(0);
    expect(report.summary.avgOrderValue).toBe(0);
    expect(report.summary.deliveryRate).toBe(0);
    expect(report.summary.revenueDelta).toBe(0);
    expect(report.summary.ordersDelta).toBe(0);
    expect(report.summary.aovDelta).toBe(0);
    expect(Array.isArray(report.revenueTimeSeries)).toBe(true);
    expect(Array.isArray(report.aovTimeSeries)).toBe(true);
    expect(Array.isArray(report.statusDistribution)).toBe(true);
    expect(Array.isArray(report.topProducts)).toBe(true);
    expect(Array.isArray(report.topWilayas)).toBe(true);
    expect(Array.isArray(report.salesByHour)).toBe(true);
    expect(report.deliveryPerformance).toBeDefined();
    expect(Array.isArray(report.customerGrowth)).toBe(true);
  });

  it("computes summary from seeded orders (within the window)", async () => {
    await seedOrderWithItem({ totalPrice: 5000, status: "confirmed" });
    await seedOrderWithItem({ totalPrice: 3000, status: "delivered" });
    await seedOrderWithItem({ totalPrice: 9999, status: "cancelled" });

    const report = await getAnalyticsReport(30);
    expect(report.summary.totalOrders).toBe(3);
    expect(report.summary.totalRevenue).toBe(8000);
    expect(report.summary.realizedRevenue).toBe(3000);
    expect(report.summary.netRevenue).toBe(3000);
  });

  it("populates statusDistribution from seeded orders", async () => {
    await seedOrderWithItem({ status: "delivered" });
    await seedOrderWithItem({ status: "delivered" });
    await seedOrderWithItem({ status: "pending" });

    const report = await getAnalyticsReport(30);
    const delivered = report.statusDistribution.find((slice) => slice.key === "delivered");
    expect(delivered).toBeDefined();
    expect(delivered!.value).toBe(2);
    const pending = report.statusDistribution.find((slice) => slice.key === "pending");
    expect(pending!.value).toBe(1);
  });

  it("populates topProducts from order items", async () => {
    await seedOrderWithItem({ productName: "Widget", quantity: 2, unitPrice: 1000 });
    await seedOrderWithItem({ productName: "Widget", quantity: 1, unitPrice: 1000 });
    await seedOrderWithItem({ productName: "Gadget", quantity: 1, unitPrice: 500 });

    const report = await getAnalyticsReport(30);
    const widget = report.topProducts.find((product) => product.name === "Widget");
    expect(widget).toBeDefined();
    expect(widget!.units).toBe(3);
    expect(widget!.revenue).toBe(3000);
  });

  it("populates salesByHour (24 buckets)", async () => {
    await seedOrderWithItem({});
    const report = await getAnalyticsReport(30);
    expect(report.salesByHour).toHaveLength(24);
    const total = report.salesByHour.reduce((sum, hour) => sum + hour.orders, 0);
    expect(total).toBeGreaterThanOrEqual(1);
  });

  it("respects the days window (older orders excluded)", async () => {
    const old = new Date();
    old.setDate(old.getDate() - 60);
    await seedOrderWithItem({ totalPrice: 9999, createdAt: old });

    const report = await getAnalyticsReport(30);
    expect(report.summary.totalOrders).toBe(0);
  });
});

describe("getDashboardAnalytics", () => {
  it("returns the dashboard shape with all expected keys", async () => {
    await seedOrderWithItem({ status: "delivered", deliveryStatus: "delivered" });
    const dashboard = await getDashboardAnalytics();
    expect(dashboard).toHaveProperty("revenueSeries");
    expect(dashboard).toHaveProperty("customerGrowth");
    expect(dashboard).toHaveProperty("statusDistribution");
    expect(dashboard).toHaveProperty("topProducts");
    expect(dashboard).toHaveProperty("salesByHour");
    expect(dashboard).toHaveProperty("deliveryPerformance");
    expect(dashboard).toHaveProperty("summary");
    expect(dashboard.topProducts.length).toBeLessThanOrEqual(5);
    expect(dashboard.salesByHour).toHaveLength(24);
    expect(Array.isArray(dashboard.revenueSeries)).toBe(true);
  });

  it("deliveryPerformance reflects the Delivery model (all-time)", async () => {
    await seedOrderWithItem({ deliveryStatus: "delivered" });
    await seedOrderWithItem({ deliveryStatus: "delivered" });
    await seedOrderWithItem({ deliveryStatus: "in_transit" });

    const dashboard = await getDashboardAnalytics();
    expect(dashboard.deliveryPerformance.delivered).toBe(2);
    expect(dashboard.deliveryPerformance.inTransit).toBe(1);
    expect(dashboard.deliveryPerformance.deliveryRate).toBeGreaterThan(0);
  });

  it("deliveryPerformance.byProvider groups deliveries by provider", async () => {
    await seedOrderWithItem({ deliveryStatus: "delivered", deliveryProvider: "yalidine" });
    await seedOrderWithItem({ deliveryStatus: "delivered", deliveryProvider: "yalidine" });
    await seedOrderWithItem({ deliveryStatus: "delivered", deliveryProvider: "maystro" });

    const dashboard = await getDashboardAnalytics();
    const yalidine = dashboard.deliveryPerformance.byProvider.find((provider) => provider.key === "yalidine");
    expect(yalidine).toBeDefined();
    expect(yalidine!.value).toBe(2);
    const maystro = dashboard.deliveryPerformance.byProvider.find((provider) => provider.key === "maystro");
    expect(maystro!.value).toBe(1);
  });

  it("summary is computed from the 7-day window", async () => {
    await seedOrderWithItem({ totalPrice: 4000, status: "delivered" });
    const dashboard = await getDashboardAnalytics();
    expect(dashboard.summary.totalOrders).toBeGreaterThanOrEqual(1);
    expect(dashboard.summary.totalRevenue).toBe(4000);
  });

  it("returns empty-but-shaped result on an empty DB", async () => {
    const dashboard = await getDashboardAnalytics();
    expect(dashboard.summary.totalOrders).toBe(0);
    expect(dashboard.summary.totalRevenue).toBe(0);
    expect(dashboard.deliveryPerformance.delivered).toBe(0);
    expect(dashboard.deliveryPerformance.deliveryRate).toBe(0);
    expect(dashboard.deliveryPerformance.byProvider).toEqual([]);
    expect(dashboard.topProducts).toEqual([]);
  });
});

describe("advanced analytics profitability authority", () => {
  it("uses realized delivery revenue for period comparison", async () => {
    const now = new Date();
    await seedOrderWithItem({ status: "delivered", totalPrice: 3000, createdAt: now });
    await seedOrderWithItem({ status: "pending", totalPrice: 9000, createdAt: now });
    const current = {
      from: new Date(now.getTime() - 86_400_000),
      to: new Date(now.getTime() + 1_000),
    };
    const previous = {
      from: new Date(now.getTime() - 2 * 86_400_000),
      to: current.from,
    };
    const comparison = await getPeriodComparison(current, previous);
    expect(comparison.current.orders).toBe(2);
    expect(comparison.current.revenue).toBe(3000);
  });

  it("uses the immutable delivery-time cost snapshot for SKU margin", async () => {
    const category = await db.category.create({ data: { name: "P&L" } });
    const product = await db.product.create({
      data: {
        name: "Snapshot Product",
        price: 3000,
        cost: 1000,
        stock: 5,
        lowStockThreshold: 1,
        categoryId: category.id,
      },
    });
    const customer = await seedTestCustomer(db, { phone: uniquePhone() });
    const recognizedAt = new Date();
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-SKU-PNL",
        status: "delivered",
        customerId: customer.id,
        totalPrice: 3000,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue",
        phone: uniquePhone(),
        source: "manual",
        deliveredAt: recognizedAt,
        items: {
          create: {
            productId: product.id,
            productName: product.name,
            quantity: 1,
            unitPrice: 3000,
            total: 3000,
          },
        },
      },
      include: { items: true },
    });
    const item = order.items[0]!;
    await db.profitabilityCostSnapshot.create({
      data: {
        id: "snapshot-sku-pnl",
        snapshotKey: "snapshot-sku-pnl",
        commandId: "command-sku-pnl",
        orderId: order.id,
        orderItemId: item.id,
        productId: product.id,
        quantity: 1,
        unitCost: 1000,
        costBasis: "delivery_catalog_cost_v1",
        isExact: true,
        recognizedAt,
      },
    });
    await db.product.update({ where: { id: product.id }, data: { cost: 2500 } });

    const rows = await getSkuPnl({
      from: new Date(recognizedAt.getTime() - 1_000),
      to: new Date(recognizedAt.getTime() + 1_000),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sku: "Snapshot Product",
      revenue: 3000,
      cost: 1000,
      margin: 2000,
      profitabilityComplete: true,
    });
  });
});
