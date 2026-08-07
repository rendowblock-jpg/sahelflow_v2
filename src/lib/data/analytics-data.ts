/**
 * Analytics data facade — server-side entry points used by the dashboard
 * and analytics pages. Delegates full reports to analyticsService while the
 * Dashboard may request a permission-bounded lightweight projection.
 */
import "server-only";

import { db, shopContext } from "@/lib/db";
import { analyticsService, type AnalyticsReport } from "@/lib/data/analytics";
import type { DashboardFieldAccess } from "@/lib/identity/dashboard-projection";

/** Full report for the analytics page (default 30 days). */
export async function getAnalyticsReport(days = 30): Promise<AnalyticsReport> {
  return analyticsService.getReport({ prisma: db, shop: shopContext }, days);
}

type DashboardAnalytics = Readonly<{
  revenueSeries: AnalyticsReport["revenueTimeSeries"];
  customerGrowth: AnalyticsReport["customerGrowth"];
  statusDistribution: AnalyticsReport["statusDistribution"];
  topProducts: AnalyticsReport["topProducts"];
  salesByHour: AnalyticsReport["salesByHour"];
  deliveryPerformance: AnalyticsReport["deliveryPerformance"];
  summary: AnalyticsReport["summary"];
}>;

type DashboardSeriesOrder = {
  status: string;
  createdAt: Date;
  totalPrice: number;
};

function startOfLocalDay(value: Date): Date {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addLocalDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

const EMPTY_DELIVERY_PERFORMANCE: AnalyticsReport["deliveryPerformance"] = {
  deliveryRate: 0,
  delivered: 0,
  inTransit: 0,
  pending: 0,
  returned: 0,
  byProvider: [],
};

const EMPTY_SUMMARY: AnalyticsReport["summary"] = {
  totalRevenue: 0,
  totalOrders: 0,
  avgOrderValue: 0,
  deliveryRate: 0,
  realizedRevenue: 0,
  netRevenue: 0,
  netProfit: 0,
  profitabilityComplete: false,
  revenueDelta: 0,
  ordersDelta: 0,
  aovDelta: 0,
};

/**
 * Lightweight 7-day Dashboard analytics.
 *
 * With no field access argument this preserves the historical full-authority
 * facade for trusted internal callers. The Dashboard passes its resolved access,
 * which keeps financial order values, customer rows and delivery aggregates out
 * of the query plan entirely when the actor lacks those domains. Both paths keep
 * one stable return shape so downstream code never weakens its type contract.
 */
export async function getDashboardAnalytics(
  fieldAccess?: DashboardFieldAccess,
): Promise<DashboardAnalytics> {
  if (!fieldAccess) {
    const report = await analyticsService.getReport(
      { prisma: db, shop: shopContext },
      7,
    );
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

  const now = new Date();
  const periodStart = startOfLocalDay(addLocalDays(now, -6));

  const orderRowsPromise: Promise<DashboardSeriesOrder[]> = !fieldAccess.analytics
    ? Promise.resolve([])
    : fieldAccess.analyticsFinancials
      ? db.order.findMany({
          where: { createdAt: { gte: periodStart }, deletedAt: null },
          select: { status: true, createdAt: true, totalPrice: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
      : db.order
          .findMany({
            where: { createdAt: { gte: periodStart }, deletedAt: null },
            select: { status: true, createdAt: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          })
          .then((rows) =>
            rows.map((row) => ({ ...row, totalPrice: 0 })),
          );

  const [orderRows, customerRows, deliveryPerformance] = await Promise.all([
    orderRowsPromise,
    fieldAccess.analytics && fieldAccess.customers
      ? db.customer.findMany({
          where: { createdAt: { gte: periodStart }, deletedAt: null },
          select: { createdAt: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
      : Promise.resolve([]),
    fieldAccess.deliveries
      ? getDeliveryPerformance()
      : Promise.resolve(EMPTY_DELIVERY_PERFORMANCE),
  ]);

  return {
    revenueSeries: fieldAccess.analytics
      ? analyticsService.buildTimeSeries(orderRows, periodStart, now)
      : [],
    customerGrowth:
      fieldAccess.analytics && fieldAccess.customers
        ? analyticsService.buildCustomerGrowth(customerRows, periodStart, now)
        : [],
    statusDistribution: [],
    topProducts: [],
    salesByHour: [],
    deliveryPerformance,
    summary: EMPTY_SUMMARY,
  };
}

/** All-time delivery performance from the Delivery model (matches /deliveries). */
async function getDeliveryPerformance(): Promise<
  AnalyticsReport["deliveryPerformance"]
> {
  const groups = await db.delivery.groupBy({
    by: ["status"],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  const count = (status: string) =>
    groups.find((group) => group.status === status)?._count._all ?? 0;
  const delivered = count("delivered");
  const inTransit =
    count("picked_up") +
    count("in_transit") +
    count("at_hub") +
    count("out_for_delivery");
  const pending = count("pending") + count("created");
  const returned = count("returned");
  const total = groups.reduce((sum, group) => sum + group._count._all, 0);
  const byProvider = await db.delivery.groupBy({
    by: ["provider"],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  return {
    deliveryRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
    delivered,
    inTransit,
    pending,
    returned,
    byProvider: byProvider.map((group) => ({
      key: group.provider,
      label: group.provider,
      value: group._count._all,
    })),
  };
}
