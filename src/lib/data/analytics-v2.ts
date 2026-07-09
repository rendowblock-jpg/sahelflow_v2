/**
 * Analytics v2 service (Phase 7).
 *
 * Adds: return-rate analytics (by wilaya/product/courier), period-over-period
 * comparison, SKU P&L, wilaya P&L, courier comparison. These are the
 * insights that make SahelFlow a real analytics tool, not just counts.
 */
import "server-only";
import { db } from "@/lib/db";
// Phase 4: canonical revenue-exclusion set -- shared with
// `metrics.grossRevenue`. Previously this module excluded
// returned/refused from the revenue sum (4-status exclusion), but the
// canonical definition (DATA_INTEGRITY_PLAN.md Phase 4) excludes only
// cancelled + draft -- returned/refused ARE gross (the order was
// placed; the return is a separate downstream event tracked by the
// return-rate metric). Using the shared constant keeps the period-
// comparison revenue aligned with the dashboard + analytics + reports.
import { REVENUE_EXCLUDED_STATUSES } from "@/lib/data/metrics";

export interface DateRange {
  from: Date;
  to: Date;
}

/** Get a date range for the last N days (ending now). */
export function getLastNDays(days: number): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from, to };
}

/** Get the previous period of the same length (for comparison). */
export function getPreviousPeriod(range: DateRange): DateRange {
  const diff = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from);
  const from = new Date(to.getTime() - diff);
  return { from, to };
}

/** Return-rate analytics by wilaya (the killer COD metric). */
export async function getReturnRateByWilaya(range: DateRange) {
  const orders = await db.order.findMany({
    where: {
      createdAt: { gte: range.from, lte: range.to },
      deletedAt: null,
      status: { in: ["delivered", "returned", "refused"] },
    },
    select: { wilaya: true, status: true },
  });

  const byWilaya: Record<string, { total: number; returned: number }> = {};
  for (const o of orders) {
    if (!byWilaya[o.wilaya]) byWilaya[o.wilaya] = { total: 0, returned: 0 };
    byWilaya[o.wilaya]!.total++;
    if (o.status === "returned" || o.status === "refused") {
      byWilaya[o.wilaya]!.returned++;
    }
  }

  return Object.entries(byWilaya)
    .map(([wilaya, data]) => ({
      wilaya,
      total: data.total,
      returned: data.returned,
      returnRate: data.total > 0 ? (data.returned / data.total) * 100 : 0,
    }))
    .sort((a, b) => b.returnRate - a.returnRate);
}

/** Return-rate analytics by product. */
export async function getReturnRateByProduct(range: DateRange) {
  const items = await db.orderItem.findMany({
    where: {
      order: {
        createdAt: { gte: range.from, lte: range.to },
        deletedAt: null,
        status: { in: ["delivered", "returned", "refused"] },
      },
    },
    select: { productName: true, order: { select: { status: true } } },
  });

  const byProduct: Record<string, { total: number; returned: number }> = {};
  for (const item of items) {
    if (!byProduct[item.productName]) byProduct[item.productName] = { total: 0, returned: 0 };
    byProduct[item.productName]!.total++;
    if (item.order.status === "returned" || item.order.status === "refused") {
      byProduct[item.productName]!.returned++;
    }
  }

  return Object.entries(byProduct)
    .map(([product, data]) => ({
      product,
      total: data.total,
      returned: data.returned,
      returnRate: data.total > 0 ? (data.returned / data.total) * 100 : 0,
    }))
    .sort((a, b) => b.returnRate - a.returnRate)
    .slice(0, 20);
}

/** SKU P&L — per-product revenue, cost, margin. */
export async function getSkuPnl(range: DateRange) {
  const items = await db.orderItem.findMany({
    where: {
      order: {
        createdAt: { gte: range.from, lte: range.to },
        deletedAt: null,
        status: { notIn: ["cancelled", "draft"] },
      },
    },
    select: {
      productName: true,
      quantity: true,
      unitPrice: true,
      total: true,
      product: { select: { cost: true } },
    },
  });

  const bySku: Record<string, { revenue: number; cost: number; quantity: number }> = {};
  for (const item of items) {
    if (!bySku[item.productName]) bySku[item.productName] = { revenue: 0, cost: 0, quantity: 0 };
    bySku[item.productName]!.revenue += item.total;
    bySku[item.productName]!.cost += (item.product?.cost ?? 0) * item.quantity;
    bySku[item.productName]!.quantity += item.quantity;
  }

  return Object.entries(bySku)
    .map(([sku, data]) => ({
      sku,
      revenue: data.revenue,
      cost: data.cost,
      margin: data.revenue - data.cost,
      marginPct: data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue) * 100 : 0,
      quantity: data.quantity,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * Period-over-period comparison (current vs previous).
 *
 * Phase 4 (replaces SV-M9): revenue now uses the CANONICAL gross definition
 * from `metrics.grossRevenue` -- sum of totalPrice where status NOT IN
 * [cancelled, draft]. Returned/refused orders ARE included in gross (the
 * order was placed; the return is a separate downstream event tracked by
 * the return-rate metric, not by shrinking gross). The order count +
 * return-rate calcs still use the full status set (they need
 * returned/refused to compute the return rate).
 */
export async function getPeriodComparison(current: DateRange, previous: DateRange) {
  // Phase 4: canonical exclusion set -- cancelled + draft only.
  // Returned/refused orders ARE gross (the order was placed; the return
  // is a separate downstream event). Shared with `metrics.grossRevenue`.
  const EXCLUDED_FROM_REVENUE = [...REVENUE_EXCLUDED_STATUSES] as const;
  const isRevenueStatus = (s: string) =>
    !EXCLUDED_FROM_REVENUE.includes(s as typeof EXCLUDED_FROM_REVENUE[number]);

  const [currentOrders, previousOrders] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: current.from, lte: current.to }, deletedAt: null },
      select: { totalPrice: true, status: true, deliveryCost: true },
    }),
    db.order.findMany({
      where: { createdAt: { gte: previous.from, lte: previous.to }, deletedAt: null },
      select: { totalPrice: true, status: true, deliveryCost: true },
    }),
  ]);

  // Phase 4: canonical gross -- exclude cancelled + draft only.
  const sum = (orders: typeof currentOrders) =>
    orders.reduce((s, o) => (isRevenueStatus(o.status) ? s + o.totalPrice : s), 0);
  const currentRevenue = sum(currentOrders);
  const previousRevenue = sum(previousOrders);
  const currentDelivered = currentOrders.filter((o) => o.status === "delivered").length;
  const previousDelivered = previousOrders.filter((o) => o.status === "delivered").length;
  const currentReturned = currentOrders.filter((o) => o.status === "returned" || o.status === "refused").length;
  const previousReturned = previousOrders.filter((o) => o.status === "returned" || o.status === "refused").length;

  const pctChange = (curr: number, prev: number) =>
    prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;

  return {
    current: {
      orders: currentOrders.length,
      revenue: currentRevenue,
      delivered: currentDelivered,
      returned: currentReturned,
      returnRate: (currentDelivered + currentReturned) > 0 ? (currentReturned / (currentDelivered + currentReturned)) * 100 : 0,
    },
    previous: {
      orders: previousOrders.length,
      revenue: previousRevenue,
      delivered: previousDelivered,
      returned: previousReturned,
      returnRate: (previousDelivered + previousReturned) > 0 ? (previousReturned / (previousDelivered + previousReturned)) * 100 : 0,
    },
    changes: {
      orders: pctChange(currentOrders.length, previousOrders.length),
      revenue: pctChange(currentRevenue, previousRevenue),
      delivered: pctChange(currentDelivered, previousDelivered),
      returnRate: pctChange(
        (currentDelivered + currentReturned) > 0 ? (currentReturned / (currentDelivered + currentReturned)) * 100 : 0,
        (previousDelivered + previousReturned) > 0 ? (previousReturned / (previousDelivered + previousReturned)) * 100 : 0,
      ),
    },
  };
}
