/**
 * Average order value: the numerator (revenue) and the denominator (order
 * count) must count the SAME orders. Cancelled and draft orders are in
 * neither. The card (buildSummary) and the chart (buildTimeSeries) agree.
 */
import { describe, expect, it } from "vitest";
import { analyticsService } from "@/lib/data/analytics";

const row = (totalPrice: number, status: string) => ({
  totalPrice,
  status,
  deliveredAt: null,
});
const day = new Date("2026-06-15T00:00:00Z");
const at = (totalPrice: number, status: string) => ({
  totalPrice,
  status,
  createdAt: new Date("2026-06-15T10:00:00Z"),
});

describe("average order value counts the same orders top and bottom", () => {
  it("card: a cancelled order is in neither the revenue nor the count", () => {
    const s = analyticsService.buildSummary(
      [row(1000, "delivered"), row(3000, "confirmed"), row(2000, "cancelled")],
      [],
    );
    expect(s.totalRevenue).toBe(4000);
    expect(s.avgOrderValue).toBe(2000);
    expect(s.totalOrders).toBe(3); // orders placed: unchanged
  });

  it("card: a draft is excluded from both too", () => {
    const s = analyticsService.buildSummary([row(5000, "delivered"), row(7000, "draft")], []);
    expect(s.avgOrderValue).toBe(5000);
  });

  it("card: the previous period follows the same rule, so the delta is honest", () => {
    const s = analyticsService.buildSummary(
      [row(2000, "delivered"), row(2000, "delivered")],
      [row(1000, "delivered"), row(9000, "cancelled")],
    );
    expect(s.avgOrderValue).toBe(2000);
    expect(s.aovDelta).toBe(100);
  });

  it("card: only cancelled orders gives 0, not NaN", () => {
    const s = analyticsService.buildSummary([row(4000, "cancelled")], []);
    expect(s.avgOrderValue).toBe(0);
  });

  it("chart: the day bucket divides by the orders it adds up", () => {
    const [bucket] = analyticsService.buildTimeSeries(
      [at(1000, "delivered"), at(3000, "confirmed"), at(2000, "cancelled")],
      day,
      day,
    );
    expect(bucket?.revenue).toBe(4000);
    expect(bucket?.aov).toBe(2000);
    expect(bucket?.orders).toBe(3); // orders placed that day: unchanged
  });

  it("card and chart give the same number for the same orders", () => {
    const orders = [at(1500, "delivered"), at(2500, "shipped"), at(9000, "cancelled"), at(100, "draft")];
    const card = analyticsService.buildSummary(
      orders.map((o) => ({ ...o, deliveredAt: null })),
      [],
    );
    const [bucket] = analyticsService.buildTimeSeries(orders, day, day);
    expect(bucket?.aov).toBe(card.avgOrderValue);
    expect(card.avgOrderValue).toBe(2000);
  });
});
