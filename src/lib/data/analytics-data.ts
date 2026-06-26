/**
 * Analytics data facade — server-side entry points used by the dashboard
 * and analytics pages. Delegates to analyticsService.
 */
import "server-only";
import { db } from "@/lib/db";
import { analyticsService, type AnalyticsReport } from "@/lib/data/analytics";

/** Full report for the analytics page (default 30 days). */
export async function getAnalyticsReport(days = 30): Promise<AnalyticsReport> {
  return analyticsService.getReport({ prisma: db }, days);
}

/** Lightweight 7-day series + status breakdown for the dashboard. */
export async function getDashboardAnalytics() {
  const report = await analyticsService.getReport({ prisma: db }, 7);
  return {
    revenueSeries: report.revenueTimeSeries,
    customerGrowth: report.customerGrowth,
    statusDistribution: report.statusDistribution,
    topProducts: report.topProducts.slice(0, 5),
    salesByHour: report.salesByHour,
    deliveryPerformance: report.deliveryPerformance,
    summary: report.summary,
  };
}
