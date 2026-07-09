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
// Phase 4: import the canonical revenue-exclusion set so this service
// can never drift from `metrics.grossRevenue`'s definition. The local
// in-memory aggregation (buildSummary/buildTimeSeries/etc.) cannot
// call `grossRevenue(db, period)` directly without sacrificing the
// single-fetch optimization (one findMany -> many in-memory aggregates),
// so we reuse the constant instead. The exclusion set is the ONLY thing
// that could drift -- the period filter (createdAt in period) already
// matches the canonical half-open [from, to) semantics.
import { REVENUE_EXCLUDED_STATUSES } from "./metrics";

export interface TimeSeriesPoint {
  date: string; // ISO yyyy-mm-dd
  label: string; // localized short date (set by caller)
  revenue: number;
  orders: number;
  aov: number;
}

export interface StatusSlice {
  key: string;
  label: string; // raw status key; caller i18n-maps it
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
  deliveryRate: number; // 0-100
  delivered: number;
  inTransit: number; // shipped + confirmed
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
  // previous-period deltas (for trend arrows)
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

// Phase 4: canonical exclusion set -- same constant as
// `metrics.grossRevenue`. Aliased locally for the in-memory aggregators
// below (which filter already-fetched rows by status, not by DB query).
const EXCLUDED_FROM_REVENUE: OrderStatus[] = [...REVENUE_EXCLUDED_STATUSES] as OrderStatus[];

/**
 * Returns a yyyy-mm-dd date string in the server's LOCAL timezone (not UTC).
 *
 * `toISOString().slice(0, 10)` uses UTC, which causes a 23:30 local-time
 * order to appear in tomorrow's analytics bucket. This helper adjusts for
 * the timezone offset so dates are bucketed correctly in local time.
 */
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
  /** Full analytics report for a given number of days (default 30). */
  async getReport(ctx: ServiceContext, days = 30): Promise<AnalyticsReport> {
    const now = new Date();
    const periodStart = startOfDay(addDays(now, -(days - 1)));
    const prevPeriodStart = startOfDay(addDays(periodStart, -days));

    // Single fetch of the period's orders with the fields we need.
    // (PII fields like phone/address are encrypted in-place; we don't
    //  select them, so no decryption overhead on the analytics path.)
    const [periodOrders, prevOrders, customers] = await Promise.all([
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
          items: { select: { productId: true, productName: true, quantity: true, total: true } },
          delivery: { select: { provider: true, status: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      ctx.prisma.order.findMany({
        where: { createdAt: { gte: prevPeriodStart, lt: periodStart }, deletedAt: null },
        select: { totalPrice: true, status: true, createdAt: true, deliveredAt: true },
      }),
      ctx.prisma.customer.findMany({
        where: { createdAt: { gte: periodStart }, deletedAt: null },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return {
      summary: this.buildSummary(periodOrders, prevOrders),
      revenueTimeSeries: this.buildTimeSeries(periodOrders, periodStart, now),
      aovTimeSeries: this.buildTimeSeries(periodOrders, periodStart, now),
      statusDistribution: this.buildStatusDistribution(periodOrders),
      topProducts: this.buildTopProducts(periodOrders),
      topWilayas: this.buildTopWilayas(periodOrders),
      salesByHour: this.buildSalesByHour(periodOrders),
      deliveryPerformance: this.buildDeliveryPerformance(periodOrders),
      customerGrowth: this.buildCustomerGrowth(customers, periodStart, now),
    };
  },

  buildSummary(
    period: Array<{ totalPrice: number; status: string; deliveredAt: Date | null }>,
    prev: Array<{ totalPrice: number; status: string }>,
  ): AnalyticsSummary {
    const rev = (rows: Array<{ totalPrice: number; status: string }>) =>
      rows
        .filter((o) => !EXCLUDED_FROM_REVENUE.includes(o.status as OrderStatus))
        .reduce((s, o) => s + o.totalPrice, 0);

    const totalRevenue = rev(period);
    const prevRevenue = rev(prev);
    const totalOrders = period.length;
    const prevOrders = prev.length;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    const prevAov = prevOrders > 0 ? Math.round(prevRevenue / prevOrders) : 0;
    const delivered = period.filter((o) => o.status === "delivered").length;
    const deliveryRate = totalOrders > 0 ? Math.round((delivered / totalOrders) * 100) : 0;

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
    for (let i = 0; i < dayCount; i++) {
      const d = addDays(start, i);
      const iso = localDateString(d);
      buckets.push({ date: iso, label: iso, revenue: 0, orders: 0, aov: 0 });
    }
    const idx = new Map(buckets.map((b, i) => [b.date, i]));

    for (const o of orders) {
      const iso = localDateString(o.createdAt);
      const i = idx.get(iso);
      if (i === undefined) continue;
      const b = buckets[i]!;
      b.orders += 1;
      if (!EXCLUDED_FROM_REVENUE.includes(o.status as OrderStatus)) {
        b.revenue += o.totalPrice;
      }
    }
    for (const b of buckets) {
      b.aov = b.orders > 0 ? Math.round(b.revenue / b.orders) : 0;
    }
    return buckets;
  },

  buildStatusDistribution(orders: Array<{ status: string }>): StatusSlice[] {
    const counts = new Map<string, number>();
    for (const o of orders) {
      counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([key, value]) => ({ key, label: key, value }))
      .sort((a, b) => b.value - a.value);
  },

  buildTopProducts(
    orders: Array<{
      items: Array<{ productId: string | null; productName: string; quantity: number; total: number }>;
    }>,
    limit = 6,
  ): TopProduct[] {
    const map = new Map<string, TopProduct>();
    for (const o of orders) {
      for (const it of o.items) {
        const key = it.productId ?? it.productName;
        const existing = map.get(key);
        if (existing) {
          existing.revenue += it.total;
          existing.units += it.quantity;
          existing.orders += 1;
        } else {
          map.set(key, {
            key,
            name: it.productName,
            revenue: it.total,
            units: it.quantity,
            orders: 1,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, limit);
  },

  buildTopWilayas(
    orders: Array<{ wilaya: string; totalPrice: number; status: string }>,
    limit = 8,
  ): TopWilaya[] {
    const map = new Map<string, TopWilaya>();
    for (const o of orders) {
      const existing = map.get(o.wilaya);
      if (existing) {
        existing.orders += 1;
        if (!EXCLUDED_FROM_REVENUE.includes(o.status as OrderStatus)) {
          existing.revenue += o.totalPrice;
        }
      } else {
        map.set(o.wilaya, {
          key: o.wilaya,
          name: o.wilaya,
          orders: 1,
          revenue: EXCLUDED_FROM_REVENUE.includes(o.status as OrderStatus) ? 0 : o.totalPrice,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.orders - a.orders).slice(0, limit);
  },

  buildSalesByHour(orders: Array<{ totalPrice: number; status: string; createdAt: Date }>): HourBucket[] {
    const buckets: HourBucket[] = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, revenue: 0 }));
    for (const o of orders) {
      const h = o.createdAt.getHours();
      const b = buckets[h]!;
      b.orders += 1;
      if (!EXCLUDED_FROM_REVENUE.includes(o.status as OrderStatus)) {
        b.revenue += o.totalPrice;
      }
    }
    return buckets;
  },

  buildDeliveryPerformance(
    orders: Array<{ status: string; delivery: { provider: string; status: string } | null }>,
  ): DeliveryPerformance {
    const delivered = orders.filter((o) => o.status === "delivered").length;
    const inTransit = orders.filter((o) => o.status === "shipped" || o.status === "confirmed").length;
    const pending = orders.filter((o) => o.status === "pending").length;
    const returned = orders.filter((o) => o.status === "returned" || o.status === "refused").length;
    const total = orders.length;
    const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0;

    const provMap = new Map<string, number>();
    for (const o of orders) {
      if (o.delivery) {
        provMap.set(o.delivery.provider, (provMap.get(o.delivery.provider) ?? 0) + 1);
      }
    }
    const byProvider = Array.from(provMap.entries())
      .map(([key, value]) => ({ key, label: key, value }))
      .sort((a, b) => b.value - a.value);

    return { deliveryRate, delivered, inTransit, pending, returned, byProvider };
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
    for (let i = 0; i < dayCount; i++) {
      const d = addDays(start, i);
      // SV-L9: use localDateString (not toISOString().slice(0,10)) so
      // customer-growth buckets agree with buildTimeSeries buckets
      // near midnight. Previously this used UTC, causing a 23:30 local
      // "new customer" to land in tomorrow's bucket while the same
      // customer's order (in buildTimeSeries) landed in today's.
      const iso = localDateString(d);
      buckets.push({ date: iso, label: iso, newCustomers: 0, cumulative: 0 });
    }
    const idx = new Map(buckets.map((b, i) => [b.date, i]));
    for (const c of customers) {
      const iso = localDateString(c.createdAt);
      const i = idx.get(iso);
      if (i !== undefined) buckets[i]!.newCustomers += 1;
    }
    let running = 0;
    for (const b of buckets) {
      running += b.newCustomers;
      b.cumulative = running;
    }
    return buckets;
  },
};
