/**
 * Canonical revenue + delivery-rate metrics — Phase 4 consolidation.
 *
 * Single source of truth for the revenue + delivery-rate formulas that
 * previously drifted across dashboard / analytics / accounting / reports
 * / AI (six revenue formulas + three delivery-rate formulas — see
 * DATA_INTEGRITY_PLAN.md Phase 4, lines 263-313).
 *
 * Canonical definitions (with the founder):
 *   - Gross revenue (period)     = sum(order.totalPrice) where createdAt
 *     in period AND status NOT IN [cancelled, draft].
 *   - Realized revenue (period)  = sum(order.totalPrice) where deliveredAt
 *     in period AND status = "delivered".
 *   - Net revenue (period)       = realized revenue − refunds in period
 *     − delivery costs in period.
 *   - Delivery rate (period)     = delivered orders in period / total
 *     orders in period (by order.status, NOT delivery.status — because
 *     not all orders have a Delivery row).
 *   - Courier delivery rate (all-time) = from the Delivery table
 *     (separate metric — courier performance).
 *
 * Money is integer DZD. All queries apply `deletedAt: null` on tables
 * that support soft-delete (Order, Delivery). Refund has no deletedAt
 * column (refunds are append-only — once issued, they cannot be deleted;
 * a wrong refund gets a compensating reverse entry via `reverseRefund`
 * (W3-2, Session 39), not a soft-delete). The `Refund.reversed` boolean
 * marks reversed refunds; `netRevenue` below filters `reversed: false`
 * so reversed refunds no longer reduce net revenue.
 *
 * Periods are half-open intervals `[from, to)` — `from` is inclusive,
 * `to` is exclusive. This lets adjacent periods chain cleanly
 * (yesterday.to === today.from) without double-counting boundary orders.
 *
 * All functions accept a `DbClient` (the PII-extended Prisma client from
 * src/lib/db.ts). In tests, a raw `PrismaClient` is passed via
 * `as never` — the PII extension is transparent for the fields these
 * queries touch (totalPrice, status, createdAt, deliveredAt, cost,
 * amount) because none of them are PII-encrypted.
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
 * Realized revenue (period) — what was actually collected.
 *
 * Sum of `order.totalPrice` for orders DELIVERED in the period (filter
 * by `deliveredAt`, not `createdAt`) whose status is currently
 * `delivered`. An order created yesterday and delivered today counts
 * in TODAY's realized revenue, not yesterday's.
 *
 * The `status: "delivered"` filter is defense-in-depth: an order with
 * `deliveredAt` set should always have `status = "delivered"`, but if
 * the row was later transitioned to `returned`, the status filter
 * excludes it (return reverses the realization).
 */
export async function realizedRevenue(db: DbClient, period: Period): Promise<number> {
  const agg = await db.order.aggregate({
    where: {
      deliveredAt: { gte: period.from, lt: period.to },
      status: "delivered",
      deletedAt: null,
    },
    _sum: { totalPrice: true },
  });
  return agg._sum.totalPrice ?? 0;
}

/**
 * Net revenue (period) — for the accounting P&L.
 *
 * Realized revenue minus refunds issued in the period minus delivery
 * costs incurred in the period.
 *
 * - Refunds: `refund.amount` where `status = "completed"` (pending /
 *   failed refunds don't reduce net — they may never complete).
 * - Delivery costs: `delivery.cost` where the Delivery row was created
 *   in the period (the cost is incurred when the parcel is shipped to
 *   the courier, not when it's delivered — couriers bill on pickup).
 */
export async function netRevenue(db: DbClient, period: Period): Promise<number> {
  const [realized, refundsAgg, deliveryCostsAgg] = await Promise.all([
    realizedRevenue(db, period),
    db.refund.aggregate({
      where: {
        createdAt: { gte: period.from, lt: period.to },
        status: "completed",
        // W3-2 (Session 39): exclude reversed refunds — they no longer
        // represent money returned to the customer.
        reversed: false,
      },
      _sum: { amount: true },
    }),
    db.delivery.aggregate({
      where: {
        createdAt: { gte: period.from, lt: period.to },
        deletedAt: null,
        cost: { not: null },
      },
      _sum: { cost: true },
    }),
  ]);
  const refunds = refundsAgg._sum.amount ?? 0;
  const deliveryCosts = deliveryCostsAgg._sum.cost ?? 0;
  return realized - refunds - deliveryCosts;
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
