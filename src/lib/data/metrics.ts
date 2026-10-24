/**
 * Shared operational and accounting metric entry points.
 *
 * - Gross order value is an operational measure based on orders placed in the
 *   period, excluding cancelled and draft rows.
 * - Earned (realized) and net revenue are not computed here. Read them from
 *   `getProfitabilityProjection()` in `@/lib/accounting/profitability`, the one
 *   authority for them.
 *
 * All periods are half-open `[from, to)` and all money is integer DZD.
 */
import "server-only";

import type { DbClient } from "@/lib/db";

/** Half-open period window `[from, to)`. */
export interface Period {
  from: Date;
  to: Date;
}

/**
 * Canonical revenue-exclusion set: cancelled + draft orders are never
 * revenue. Returned/refused orders ARE included in gross (the order was
 * placed — the return is a downstream event tracked separately by the
 * return-rate metric, not by shrinking gross).
 *
 * Exported so analytics-v2.ts (period-over-period) can reuse the same
 * exclusion list without duplicating the constant.
 */
export const REVENUE_EXCLUDED_STATUSES = ["cancelled", "draft"] as const;

/** Result of a delivery-rate computation. */
export interface DeliveryRateResult {
  /** 0-100 (percentage rounded to nearest int). 0 when total = 0. */
  rate: number;
  delivered: number;
  total: number;
}

/**
 * Gross revenue (period) — what was ordered.
 *
 * Sum of `order.totalPrice` for orders created in the period whose
 * status is NOT cancelled or draft. Returned/refused orders ARE
 * included (the order was placed — the return is a separate downstream
 * event tracked by the return-rate metric, not by inflating the
 * gross-down).
 */
export async function grossRevenue(db: DbClient, period: Period): Promise<number> {
  const agg = await db.order.aggregate({
    where: {
      createdAt: { gte: period.from, lt: period.to },
      status: { notIn: [...REVENUE_EXCLUDED_STATUSES] },
      deletedAt: null,
    },
    _sum: { totalPrice: true },
  });
  return agg._sum.totalPrice ?? 0;
}

/**
 * Delivery rate (period) — by `order.status`, NOT `delivery.status`.
 *
 * Delivered orders created in the period / total orders created in the
 * period. Uses order.status (not delivery.status) because not all
 * orders have a Delivery row (e.g. an order cancelled before shipping
 * never gets a Delivery row, but it IS in the denominator — it's an
 * order that didn't get delivered).
 *
 * This is the OPERATIONAL metric: "of the orders I placed, how many
 * ended up delivered?" For courier performance (parcel-level), see
 * `courierDeliveryRate` below.
 */
export async function deliveryRate(
  db: DbClient,
  period: Period,
): Promise<DeliveryRateResult> {
  const [delivered, total] = await Promise.all([
    db.order.count({
      where: {
        createdAt: { gte: period.from, lt: period.to },
        status: "delivered",
        deletedAt: null,
      },
    }),
    db.order.count({
      where: {
        createdAt: { gte: period.from, lt: period.to },
        deletedAt: null,
      },
    }),
  ]);
  return {
    rate: total > 0 ? Math.round((delivered / total) * 100) : 0,
    delivered,
    total,
  };
}

/**
 * Courier delivery rate (all-time) — from the Delivery table.
 *
 * Separate metric from `deliveryRate` (period). This measures COURIER
 * performance: of all Delivery rows ever created, what fraction ended
 * up delivered? Uses `delivery.status` because we want the courier's
 * outcome (parcel-level), not the order's outcome. An order can be
 * marked delivered in `order.status` while the Delivery row has a
 * different terminal status if it was synced late or auto-closed.
 *
 * All-time because courier performance is a long-run metric — weekly
 * windows are too noisy for small shops (10 parcels/week → one return
 * swings the rate by 10%).
 */
export async function courierDeliveryRate(db: DbClient): Promise<DeliveryRateResult> {
  const [delivered, total] = await Promise.all([
    db.delivery.count({
      where: { status: "delivered", deletedAt: null },
    }),
    db.delivery.count({
      where: { deletedAt: null },
    }),
  ]);
  return {
    rate: total > 0 ? Math.round((delivered / total) * 100) : 0,
    delivered,
    total,
  };
}
