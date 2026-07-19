/**
 * Analytics data facade — server-side entry points used by the dashboard
 * and analytics pages. Delegates to analyticsService.
 */
import "server-only";
import { db, shopContext } from "@/lib/db";
import { analyticsService, type AnalyticsReport } from "@/lib/data/analytics";

/** Full report for the analytics page (default 30 days). */
export async function getAnalyticsReport(days = 30): Promise<AnalyticsReport> {
  return analyticsService.getReport({ prisma: db, shop: shopContext }, days);
}

/** Lightweight 7-day series + status breakdown for the dashboard. */
export async function getDashboardAnalytics() {
  const report = await analyticsService.getReport({ prisma: db, shop: shopContext }, 7);
  // Delivery performance is computed from the Delivery model directly (all-time,
  // by delivery.status) so the dashboard card matches the /deliveries page.
  // Previously it was derived from 7-day-old orders by order.status, which showed
  // "Livré 0" on the dashboard while /deliveries showed 21 delivered — because
  // delivered orders were created >7 days ago and excluded from the window.
  const deliveryPerformance = await getDeliveryPerformance();
  return {
    revenueSeries: report.revenueTimeSeries,
    customerGrowth: report.customerGrowth,
    statusDistribution: report.statusDistribution,
    topProducts: report.topProducts.slice(0, 5),
    salesByHour: report.salesByHour,
    deliveryPerformance,
    summary: report.summary,
  };
}

/** All-time delivery performance from the Delivery model (matches /deliveries). */
async function getDeliveryPerformance() {
  const groups = await db.delivery.groupBy({
    by: ["status"],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  const count = (status: string) =>
    groups.find((g) => g.status === status)?._count._all ?? 0;
  const delivered = count("delivered");
  const inTransit =
    count("picked_up") + count("in_transit") + count("at_hub") + count("out_for_delivery");
  const pending = count("pending") + count("created");
  const returned = count("returned");
  const total = groups.reduce((s, g) => s + g._count._all, 0);
  const byProvider = await db.delivery.groupBy({
    by: ["provider"],
    _count: { _all: true },
  });
  return {
    deliveryRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
    delivered,
    inTransit,
    pending,
    returned,
    byProvider: byProvider.map((g) => ({
      key: g.provider,
      label: g.provider,
      value: g._count._all,
    })),
  };
}
