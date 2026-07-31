/**
 * Analytics service — aggregated business intelligence for the dashboard
 * and analytics pages. Server-only. Follows the ServiceContext pattern.
 *
 * All money values are integer DZD. Dates are bucketed in the server's
 * timezone (UTC for the headless server; the Tauri app runs locally so
 * this matches the merchant's clock).
 *
 * Queries are scoped to the active shop via the DbClient routing in
 * src/lib/db.ts (multi-shop), so no explicit shopId filter is needed.
 */
import "server-only";
import type { ServiceContext } from "./service-base";
import type { OrderStatus } from "@/types/domain";
import { REVENUE_EXCLUDED_STATUSES } from "./metrics";
import {
  getProfitabilitySeries,
  type ProfitabilityProjection,
} from "@/lib/accounting/profitability";

export interface TimeSeriesPoint {
  date: string;
  label: string;
  revenue: number;
  orders: number;
  aov: number;
}

export interface StatusSlice {
  key: string;
  label: string;
  value: number;
}

export interface TopProduct {
  key: string;
  name: string;
  revenue: number;
  units: number;
  orders: number;
}

export interface TopWilaya {
  key: string;
  name: string;
  orders: number;
  revenue: number;
}

export interface HourBucket {
  hour: number;
  orders: number;
  revenue: number;
}

export interface DeliveryPerformance {
  deliveryRate: number;
  delivered: number;
  inTransit: number;
  pending: number;
  returned: number;
  byProvider: Array<{ key: string; label: string; value: number }>;
}

export interface CustomerGrowthPoint {
  date: string;
  label: string;
  newCustomers: number;
  cumulative: number;
}

export interface AnalyticsSummary {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  deliveryRate: number;
  revenueDelta: number;
  ordersDelta: number;
  aovDelta: number;
}

export interface AnalyticsReport {
  summary: AnalyticsSummary;
  revenueTimeSeries: TimeSeriesPoint[];
  aovTimeSeries: TimeSeriesPoint[];
  statusDistribution: StatusSlice[];
  topProducts: TopProduct[];
  topWilayas: TopWilaya[];
  salesByHour: HourBucket[];
  deliveryPerformance: DeliveryPerformance;
  customerGrowth: CustomerGrowthPoint[];
}

const EXCLUDED_FROM_REVENUE: OrderStatus[] = [
  ...REVENUE_EXCLUDED_STATUSES,
] as OrderStatus[];

function localDateString(d: Date): string {
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function pct(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return Math.round(((curr - prev) / prev) * 100);
}

export const analyticsService = {
  async getReport(ctx: ServiceContext, days = 30): Promise<AnalyticsReport> {
    const now = new Date();
    const periodStart = startOfDay(addDays(now, -(days - 1)));
    const prevPeriodStart = startOfDay(addDays(periodStart, -days));

    const dailyPeriods = Array.from({ length: days }, (_, index) => {
      const from = startOfDay(addDays(periodStart, index));
      const nextDay = startOfDay(addDays(from, 1));
      const to = nextDay <= now ? nextDay : now > from ? now : nextDay;
      return {
        key: `day:${localDateString(from)}`,
        period: { from, to },
      };
    });
    const profitabilityPeriods = [
      { key: "current", period: { from: periodStart, to: now } },
      { key: "previous", period: { from: prevPeriodStart, to: periodStart } },
      ...dailyPeriods,
    ];

    const [periodOrders, prevOrders, customers, profitabilityEntries] =
      await Promise.all([
        ctx.prisma.order.findMany({
          where: { createdAt: { gte: periodStart }, deletedAt: null },
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
        ctx.prisma.order.findMany({
          where: {
            createdAt: { gte: prevPeriodStart, lt: periodStart },
            deletedAt: null,
          },
          select: {
            totalPrice: true,
            status: true,
            createdAt: true,
            deliveredAt: true,
          },
        }),
        ctx.prisma.customer.findMany({
          where: { createdAt: { gte: periodStart }, deletedAt: null },
          select: { createdAt: true },
          orderBy: { createdAt: "asc" },
        }),
        getProfitabilitySeries(ctx.prisma, profitabilityPeriods),
      ]);
    const profitabilityByKey = new Map(
      profitabilityEntries.map((entry) => [entry.key, entry.projection]),
    );
    const currentProfitability = profitabilityByKey.get("current");
    const previousProfitability = profitabilityByKey.get("previous");
    if (!currentProfitability || !previousProfitability) {
      throw new Error(
        "Profitability projection did not return the requested analytics periods",
      );
    }
    const governedSeries = this.buildProfitabilityTimeSeries(
      dailyPeriods,
      profitabilityByKey,
    );

    return {
      summary: this.buildSummary(periodOrders, prevOrders, {
        current: currentProfitability,
        previous: previousProfitability,
      }),
      revenueTimeSeries: governedSeries,
      aovTimeSeries: governedSeries,
      statusDistribution: this.buildStatusDistribution(periodOrders),
      topProducts: this.buildTopProducts(periodOrders),
      topWilayas: this.buildTopWilayas(periodOrders),
      salesByHour: this.buildSalesByHour(periodOrders),
      deliveryPerformance: this.buildDeliveryPerformance(periodOrders),
      customerGrowth: this.buildCustomerGrowth(customers, periodStart, now),
    };
  },

  buildSummary(
    period: Array<{
      totalPrice: number;
      status: string;
      deliveredAt: Date | null;
    }>,
    prev: Array<{ totalPrice: number; status: string }>,
    financial?: {
      current: ProfitabilityProjection;
      previous: ProfitabilityProjection;
    },
  ): AnalyticsSummary {
    const rev = (rows: Array<{ totalPrice: number; status: string }>) =>
      rows
        .filter(
          (order) =>
            !EXCLUDED_FROM_REVENUE.includes(order.status as OrderStatus),
        )
        .reduce((sum, order) => sum + order.totalPrice, 0);

    const totalRevenue = financial?.current.grossRevenue ?? rev(period);
    const prevRevenue = financial?.previous.grossRevenue ?? rev(prev);
    const totalOrders = period.length;
    const prevOrders = prev.length;
    const currentRevenueOrders =
      financial?.current.recognizedOrderCount ?? totalOrders;
    const previousRevenueOrders =
      financial?.previous.recognizedOrderCount ?? prevOrders;
    const avgOrderValue =
      currentRevenueOrders > 0
        ? Math.round(totalRevenue / currentRevenueOrders)
        : 0;
    const prevAov =
      previousRevenueOrders > 0
        ? Math.round(prevRevenue / previousRevenueOrders)
        : 0;
    const delivered = period.filter(
      (order) => order.status === "delivered",
    ).length;
    const deliveryRate =
      totalOrders > 0 ? Math.round((delivered / totalOrders) * 100) : 0;

    return {
      totalRevenue,
      totalOrders,
      avgOrderValue,
      deliveryRate,
      revenueDelta: pct(totalRevenue, prevRevenue),
      ordersDelta: pct(totalOrders, prevOrders),
      aovDelta: pct(avgOrderValue, prevAov),
    };
  },

  buildProfitabilityTimeSeries(
    periods: ReadonlyArray<{
      key: string;
      period: { from: Date; to: Date };
    }>,
    projections: ReadonlyMap<string, ProfitabilityProjection>,
  ): TimeSeriesPoint[] {
    return periods.map((entry) => {
      const projection = projections.get(entry.key);
      if (!projection) {
        throw new Error(`Missing profitability projection for '${entry.key}'`);
      }
      const date = localDateString(entry.period.from);
      return {
        date,
        label: date,
        revenue: projection.grossRevenue,
        orders: projection.recognizedOrderCount,
        aov:
          projection.recognizedOrderCount > 0
            ? Math.round(
                projection.grossRevenue / projection.recognizedOrderCount,
              )
            : 0,
      };
    });
  },

  buildTimeSeries(
    orders: Array<{ totalPrice: number; status: string; createdAt: Date }>,
    start: Date,
    now: Date,
  ): TimeSeriesPoint[] {
    const buckets: TimeSeriesPoint[] = [];
    const dayCount = Math.max(
      1,
      Math.round((now.getTime() - start.getTime()) / 86_400_000) + 1,
    );
    for (let index = 0; index < dayCount; index++) {
      const date = addDays(start, index);
      const iso = localDateString(date);
      buckets.push({
        date: iso,
        label: iso,
        revenue: 0,
        orders: 0,
        aov: 0,
      });
    }
    const indexByDate = new Map(
      buckets.map((bucket, index) => [bucket.date, index]),
    );

    for (const order of orders) {
      const iso = localDateString(order.createdAt);
      const index = indexByDate.get(iso);
      if (index === undefined) continue;
      const bucket = buckets[index]!;
      bucket.orders += 1;
      if (!EXCLUDED_FROM_REVENUE.includes(order.status as OrderStatus)) {
        bucket.revenue += order.totalPrice;
      }
    }
    for (const bucket of buckets) {
      bucket.aov =
        bucket.orders > 0 ? Math.round(bucket.revenue / bucket.orders) : 0;
    }
    return buckets;
  },

  buildStatusDistribution(orders: Array<{ status: string }>): StatusSlice[] {
    const counts = new Map<string, number>();
    for (const order of orders) {
      counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([key, value]) => ({ key, label: key, value }))
      .sort((a, b) => b.value - a.value);
  },

  buildTopProducts(
    orders: Array<{
      items: Array<{
        productId: string | null;
        productName: string;
        quantity: number;
        total: number;
      }>;
    }>,
    limit = 6,
  ): TopProduct[] {
    const map = new Map<string, TopProduct>();
    for (const order of orders) {
      for (const item of order.items) {
        const key = item.productId ?? item.productName;
        const existing = map.get(key);
        if (existing) {
          existing.revenue += item.total;
          existing.units += item.quantity;
          existing.orders += 1;
        } else {
          map.set(key, {
            key,
            name: item.productName,
            revenue: item.total,
            units: item.quantity,
            orders: 1,
          });
        }
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  },

  buildTopWilayas(
    orders: Array<{ wilaya: string; totalPrice: number; status: string }>,
    limit = 8,
  ): TopWilaya[] {
    const map = new Map<string, TopWilaya>();
    for (const order of orders) {
      const existing = map.get(order.wilaya);
      if (existing) {
        existing.orders += 1;
        if (!EXCLUDED_FROM_REVENUE.includes(order.status as OrderStatus)) {
          existing.revenue += order.totalPrice;
        }
      } else {
        map.set(order.wilaya, {
          key: order.wilaya,
          name: order.wilaya,
          orders: 1,
          revenue: EXCLUDED_FROM_REVENUE.includes(order.status as OrderStatus)
            ? 0
            : order.totalPrice,
        });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.orders - a.orders)
      .slice(0, limit);
  },

  buildSalesByHour(
    orders: Array<{ totalPrice: number; status: string; createdAt: Date }>,
  ): HourBucket[] {
    const buckets: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      orders: 0,
      revenue: 0,
    }));
    for (const order of orders) {
      const bucket = buckets[order.createdAt.getHours()]!;
      bucket.orders += 1;
      if (!EXCLUDED_FROM_REVENUE.includes(order.status as OrderStatus)) {
        bucket.revenue += order.totalPrice;
      }
    }
    return buckets;
  },

  buildDeliveryPerformance(
    orders: Array<{
      status: string;
      delivery: { provider: string; status: string } | null;
    }>,
  ): DeliveryPerformance {
    const delivered = orders.filter(
      (order) => order.status === "delivered",
    ).length;
    const inTransit = orders.filter(
      (order) =>
        order.status === "shipped" || order.status === "confirmed",
    ).length;
    const pending = orders.filter(
      (order) => order.status === "pending",
    ).length;
    const returned = orders.filter(
      (order) =>
        order.status === "returned" || order.status === "refused",
    ).length;
    const total = orders.length;
    const deliveryRate =
      total > 0 ? Math.round((delivered / total) * 100) : 0;

    const providerCounts = new Map<string, number>();
    for (const order of orders) {
      if (order.delivery) {
        providerCounts.set(
          order.delivery.provider,
          (providerCounts.get(order.delivery.provider) ?? 0) + 1,
        );
      }
    }
    const byProvider = Array.from(providerCounts.entries())
      .map(([key, value]) => ({ key, label: key, value }))
      .sort((a, b) => b.value - a.value);

    return {
      deliveryRate,
      delivered,
      inTransit,
      pending,
      returned,
      byProvider,
    };
  },

  buildCustomerGrowth(
    customers: Array<{ createdAt: Date }>,
    start: Date,
    now: Date,
  ): CustomerGrowthPoint[] {
    const buckets: CustomerGrowthPoint[] = [];
    const dayCount = Math.max(
      1,
      Math.round((now.getTime() - start.getTime()) / 86_400_000) + 1,
    );
    for (let index = 0; index < dayCount; index++) {
      const date = addDays(start, index);
      const iso = localDateString(date);
      buckets.push({
        date: iso,
        label: iso,
        newCustomers: 0,
        cumulative: 0,
      });
    }
    const indexByDate = new Map(
      buckets.map((bucket, index) => [bucket.date, index]),
    );
    for (const customer of customers) {
      const iso = localDateString(customer.createdAt);
      const index = indexByDate.get(iso);
      if (index !== undefined) buckets[index]!.newCustomers += 1;
    }
    let running = 0;
    for (const bucket of buckets) {
      running += bucket.newCustomers;
      bucket.cumulative = running;
    }
    return buckets;
  },
};
