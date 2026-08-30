/**
 * Range-aware analytics report (R4-d).
 *
 * The Phase-7 analyticsService computes its report from a trailing `days` count
 * ending "now", which cannot express a custom historical window. This loader
 * keeps the exact same AnalyticsReport shape and the same pure builders
 * (analyticsService.build*) but resolves the window from the shared analytics
 * range authority, so presets and custom ranges flow through ONE code path.
 *
 * Shop scoping is inherited from the shop-routed db client in src/lib/db.ts
 * (same authority as every other analytics query).
 */
import "server-only";

import { getProfitabilitySeries } from "@/lib/accounting/profitability";
import { db } from "@/lib/db";
import { analyticsService, type AnalyticsReport } from "@/lib/data/analytics";
import {
  resolvePreviousRange,
  type ResolvedAnalyticsRange,
} from "@/lib/analytics/range";

/**
 * Deterministic bucket end for the pure time-series builders: from + (days-1)
 * produces exactly `days` day buckets regardless of the wall clock.
 */
function seriesBucketEnd(range: ResolvedAnalyticsRange): Date {
  const end = new Date(range.from);
  end.setDate(end.getDate() + (range.days - 1));
  return end;
}

/** Full analytics report for an arbitrary resolved range (presets + custom). */
export async function getAnalyticsReportForRange(
  range: ResolvedAnalyticsRange,
): Promise<AnalyticsReport> {
  const previous = resolvePreviousRange(range);
  const bucketEnd = seriesBucketEnd(range);

  const [periodOrders, prevOrders, customers, profitability] = await Promise.all(
    [
      db.order.findMany({
        where: {
          createdAt: { gte: range.from, lt: range.toExclusive },
          deletedAt: null,
        },
        select: {
          id: true,
          status: true,
          totalPrice: true,
          deliveryCost: true,
          wilaya: true,
          createdAt: true,
          deliveredAt: true,
          items: {
            select: {
              productId: true,
              productName: true,
              quantity: true,
              total: true,
            },
          },
          delivery: { select: { provider: true, status: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.order.findMany({
        where: {
          createdAt: { gte: previous.from, lt: range.from },
          deletedAt: null,
        },
        select: { totalPrice: true, status: true, createdAt: true, deliveredAt: true },
      }),
      db.customer.findMany({
        where: {
          createdAt: { gte: range.from, lt: range.toExclusive },
          deletedAt: null,
        },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      getProfitabilitySeries(db, [
        { key: "current", period: { from: range.from, to: range.toExclusive } },
        { key: "previous", period: { from: previous.from, to: range.from } },
      ]),
    ],
  );

  const projections = new Map(
    profitability.map((entry) => [entry.key, entry.projection]),
  );
  const currentProfitability = projections.get("current");
  const previousProfitability = projections.get("previous");
  if (!currentProfitability || !previousProfitability) {
    throw new Error(
      "Profitability projection did not return the requested analytics periods",
    );
  }

  return {
    summary: analyticsService.buildSummary(periodOrders, prevOrders, {
      current: currentProfitability,
      previous: previousProfitability,
    }),
    revenueTimeSeries: analyticsService.buildTimeSeries(
      periodOrders,
      range.from,
      bucketEnd,
    ),
    aovTimeSeries: analyticsService.buildTimeSeries(
      periodOrders,
      range.from,
      bucketEnd,
    ),
    statusDistribution: analyticsService.buildStatusDistribution(periodOrders),
    topProducts: analyticsService.buildTopProducts(periodOrders),
    topWilayas: analyticsService.buildTopWilayas(periodOrders),
    salesByHour: analyticsService.buildSalesByHour(periodOrders),
    deliveryPerformance: analyticsService.buildDeliveryPerformance(periodOrders),
    customerGrowth: analyticsService.buildCustomerGrowth(
      customers,
      range.from,
      bucketEnd,
    ),
  };
}
