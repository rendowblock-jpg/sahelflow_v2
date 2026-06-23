/**
 * Tests for the analytics service (src/lib/data/analytics.ts).
 * Covers the pure aggregation builders with mock order/customer data.
 * The DB-backed getReport() is not tested here (would need a test DB);
 * the builders are the computational core and are fully unit-tested.
 */

import { describe, it, expect } from "vitest";
import { analyticsService } from "@/lib/data/analytics";

// ── Mock data ────────────────────────────────────────────────────────────────

type MockOrder = {
  totalPrice: number;
  status: string;
  wilaya: string;
  createdAt: Date;
  deliveredAt: Date | null;
  items: Array<{ productId: string | null; productName: string; quantity: number; total: number }>;
  delivery: { provider: string; status: string } | null;
};

function makeOrder(overrides: Partial<MockOrder> = {}): MockOrder {
  return {
    totalPrice: 1000,
    status: "delivered",
    wilaya: "Alger",
    createdAt: new Date("2026-06-15T10:00:00Z"),
    deliveredAt: new Date("2026-06-16T10:00:00Z"),
    items: [{ productId: "p1", productName: "Product A", quantity: 1, total: 1000 }],
    delivery: { provider: "yalidine", status: "delivered" },
    ...overrides,
  };
}

// ── buildSummary ─────────────────────────────────────────────────────────────

describe("analyticsService.buildSummary", () => {
  it("computes revenue excluding cancelled and draft", () => {
    const period = [
      makeOrder({ totalPrice: 1000, status: "delivered" }),
      makeOrder({ totalPrice: 500, status: "cancelled" }),
      makeOrder({ totalPrice: 300, status: "draft" }),
      makeOrder({ totalPrice: 2000, status: "pending" }),
    ];
    const summary = analyticsService.buildSummary(period, []);
    expect(summary.totalRevenue).toBe(3000); // 1000 + 2000
    expect(summary.totalOrders).toBe(4);
  });

  it("computes AOV and delivery rate", () => {
    const period = [
      makeOrder({ totalPrice: 1000, status: "delivered" }),
      makeOrder({ totalPrice: 2000, status: "delivered" }),
      makeOrder({ totalPrice: 500, status: "pending" }),
    ];
    const summary = analyticsService.buildSummary(period, []);
    expect(summary.avgOrderValue).toBe(Math.round(3500 / 3));
    expect(summary.deliveryRate).toBe(Math.round((2 / 3) * 100));
  });

  it("computes period-over-period deltas", () => {
    const period = [
      makeOrder({ totalPrice: 1500, status: "delivered" }),
    ];
    const prev = [
      makeOrder({ totalPrice: 1000, status: "delivered" }),
    ];
    const summary = analyticsService.buildSummary(period, prev);
    expect(summary.revenueDelta).toBe(50); // +50%
    expect(summary.ordersDelta).toBe(0); // 1 vs 1
  });

  it("handles empty periods without division errors", () => {
    const summary = analyticsService.buildSummary([], []);
    expect(summary.totalRevenue).toBe(0);
    expect(summary.totalOrders).toBe(0);
    expect(summary.avgOrderValue).toBe(0);
    expect(summary.deliveryRate).toBe(0);
    expect(summary.revenueDelta).toBe(0);
  });
});

// ── buildStatusDistribution ──────────────────────────────────────────────────

describe("analyticsService.buildStatusDistribution", () => {
  it("counts orders by status and sorts descending", () => {
    const orders = [
      makeOrder({ status: "delivered" }),
      makeOrder({ status: "delivered" }),
      makeOrder({ status: "pending" }),
      makeOrder({ status: "cancelled" }),
    ];
    const dist = analyticsService.buildStatusDistribution(orders);
    expect(dist).toHaveLength(3);
    expect(dist[0]!.key).toBe("delivered");
    expect(dist[0]!.value).toBe(2);
    expect(dist[1]!.value).toBe(1);
  });
});

// ── buildTopProducts ─────────────────────────────────────────────────────────

describe("analyticsService.buildTopProducts", () => {
  it("aggregates revenue, units, and orders per product", () => {
    const orders = [
      makeOrder({
        items: [
          { productId: "p1", productName: "A", quantity: 2, total: 2000 },
          { productId: "p2", productName: "B", quantity: 1, total: 500 },
        ],
      }),
      makeOrder({
        items: [{ productId: "p1", productName: "A", quantity: 1, total: 1000 }],
      }),
    ];
    const top = analyticsService.buildTopProducts(orders, 5);
    expect(top).toHaveLength(2);
    const a = top.find((p) => p.key === "p1")!;
    expect(a.revenue).toBe(3000);
    expect(a.units).toBe(3);
    expect(a.orders).toBe(2);
  });

  it("limits to the requested count", () => {
    const orders = [
      makeOrder({ items: [{ productId: "p1", productName: "A", quantity: 1, total: 100 }] }),
      makeOrder({ items: [{ productId: "p2", productName: "B", quantity: 1, total: 200 }] }),
      makeOrder({ items: [{ productId: "p3", productName: "C", quantity: 1, total: 300 }] }),
    ];
    expect(analyticsService.buildTopProducts(orders, 2)).toHaveLength(2);
  });
});

// ── buildTopWilayas ──────────────────────────────────────────────────────────

describe("analyticsService.buildTopWilayas", () => {
  it("groups by wilaya and sorts by order count", () => {
    const orders = [
      makeOrder({ wilaya: "Oran", totalPrice: 1000, status: "delivered" }),
      makeOrder({ wilaya: "Oran", totalPrice: 500, status: "delivered" }),
      makeOrder({ wilaya: "Alger", totalPrice: 2000, status: "delivered" }),
    ];
    const top = analyticsService.buildTopWilayas(orders, 5);
    expect(top[0]!.name).toBe("Oran");
    expect(top[0]!.orders).toBe(2);
    expect(top[0]!.revenue).toBe(1500);
  });

  it("excludes cancelled revenue but counts the order", () => {
    const orders = [
      makeOrder({ wilaya: "Alger", totalPrice: 1000, status: "delivered" }),
      makeOrder({ wilaya: "Alger", totalPrice: 999, status: "cancelled" }),
    ];
    const top = analyticsService.buildTopWilayas(orders, 5);
    expect(top[0]!.orders).toBe(2);
    expect(top[0]!.revenue).toBe(1000); // cancelled excluded
  });
});

// ── buildSalesByHour ─────────────────────────────────────────────────────────

describe("analyticsService.buildSalesByHour", () => {
  it("produces 24 buckets and assigns orders to the correct hour", () => {
    const orders = [
      makeOrder({ createdAt: new Date("2026-06-15T08:00:00Z"), totalPrice: 100, status: "delivered" }),
      makeOrder({ createdAt: new Date("2026-06-15T08:30:00Z"), totalPrice: 200, status: "delivered" }),
      makeOrder({ createdAt: new Date("2026-06-15T14:00:00Z"), totalPrice: 300, status: "delivered" }),
    ];
    const buckets = analyticsService.buildSalesByHour(orders);
    expect(buckets).toHaveLength(24);
    expect(buckets[8]!.orders).toBe(2);
    expect(buckets[8]!.revenue).toBe(300);
    expect(buckets[14]!.orders).toBe(1);
    expect(buckets[0]!.orders).toBe(0);
  });
});

// ── buildDeliveryPerformance ─────────────────────────────────────────────────

describe("analyticsService.buildDeliveryPerformance", () => {
  it("computes delivery rate and status breakdowns", () => {
    const orders = [
      makeOrder({ status: "delivered", delivery: { provider: "yalidine", status: "delivered" } }),
      makeOrder({ status: "delivered", delivery: { provider: "maystro", status: "delivered" } }),
      makeOrder({ status: "shipped", delivery: { provider: "yalidine", status: "in_transit" } }),
      makeOrder({ status: "pending", delivery: null }),
      makeOrder({ status: "returned", delivery: { provider: "yalidine", status: "returned" } }),
    ];
    const dp = analyticsService.buildDeliveryPerformance(orders);
    expect(dp.delivered).toBe(2);
    expect(dp.inTransit).toBe(1);
    expect(dp.pending).toBe(1);
    expect(dp.returned).toBe(1);
    expect(dp.deliveryRate).toBe(Math.round((2 / 5) * 100));
  });

  it("groups deliveries by provider", () => {
    const orders = [
      makeOrder({ delivery: { provider: "yalidine", status: "delivered" } }),
      makeOrder({ delivery: { provider: "yalidine", status: "delivered" } }),
      makeOrder({ delivery: { provider: "maystro", status: "delivered" } }),
      makeOrder({ delivery: null }),
    ];
    const dp = analyticsService.buildDeliveryPerformance(orders);
    expect(dp.byProvider).toHaveLength(2);
    expect(dp.byProvider[0]!.key).toBe("yalidine");
    expect(dp.byProvider[0]!.value).toBe(2);
  });
});

// ── buildCustomerGrowth ──────────────────────────────────────────────────────

describe("analyticsService.buildCustomerGrowth", () => {
  it("cumulatively sums new customers across days", () => {
    const start = new Date("2026-06-15T00:00:00Z");
    const now = new Date("2026-06-17T12:00:00Z");
    const customers = [
      { createdAt: new Date("2026-06-15T10:00:00Z") },
      { createdAt: new Date("2026-06-15T14:00:00Z") },
      { createdAt: new Date("2026-06-16T09:00:00Z") },
    ];
    const growth = analyticsService.buildCustomerGrowth(customers, start, now);
    expect(growth[0]!.newCustomers).toBe(2);
    expect(growth[0]!.cumulative).toBe(2);
    expect(growth[1]!.newCustomers).toBe(1);
    expect(growth[1]!.cumulative).toBe(3);
  });
});
