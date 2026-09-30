import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import { readCanonicalSourceOrderAuthority } from "@/lib/orders/manual-order-authority";

/**
 * Per-store sales, read from the orders each storefront actually produced.
 *
 * Attribution rides the canonical order authority (`sourceIdentity` is the
 * store slug recorded at checkout) — never a string match on raw metadata.
 * Revenue is product revenue (order total minus delivery), the same basis as
 * landing-page stats. Visits are not tracked, so no conversion rate is shown
 * rather than an invented one.
 */

export const STOREFRONT_PERFORMANCE_DAYS = 30;
export const STOREFRONT_TREND_DAYS = 14;

export interface StorefrontPerformance {
  orders: number;
  revenue: number;
  delivered: number;
  cancelled: number;
  lastOrderAt: string | null;
  /** Orders per day, oldest → latest, for the trend line. */
  trend: Array<{ date: string; value: number }>;
}

const CANCELLED = new Set(["cancelled", "refused", "failed"]);

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function emptyTrend(now: Date): Array<{ date: string; value: number }> {
  const trend: Array<{ date: string; value: number }> = [];
  for (let offset = STOREFRONT_TREND_DAYS - 1; offset >= 0; offset -= 1) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - offset);
    trend.push({ date: dayKey(day), value: 0 });
  }
  return trend;
}

export function emptyStorefrontPerformance(now = new Date()): StorefrontPerformance {
  return {
    orders: 0,
    revenue: 0,
    delivered: 0,
    cancelled: 0,
    lastOrderAt: null,
    trend: emptyTrend(now),
  };
}

export async function collectStorefrontPerformance(
  context: ServiceContext,
  slugs: readonly string[],
  now = new Date(),
): Promise<Map<string, StorefrontPerformance>> {
  const stats = new Map<string, StorefrontPerformance>();
  for (const slug of slugs) stats.set(slug, emptyStorefrontPerformance(now));
  if (slugs.length === 0) return stats;

  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - STOREFRONT_PERFORMANCE_DAYS);
  const orders = (await context.prisma.order.findMany({
    where: { source: "storefront", deletedAt: null, createdAt: { gte: since } },
    select: {
      source: true,
      sourceMetadata: true,
      status: true,
      totalPrice: true,
      deliveryCost: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  })) as Array<{
    source: string;
    sourceMetadata: string | null;
    status: string;
    totalPrice: number;
    deliveryCost: number | null;
    createdAt: Date;
  }>;

  for (const order of orders) {
    const authority = readCanonicalSourceOrderAuthority(order.source, order.sourceMetadata);
    if (!authority || authority.source !== "storefront") continue;
    const entry = stats.get(authority.sourceIdentity);
    if (!entry) continue;
    entry.orders += 1;
    if (order.status === "delivered") entry.delivered += 1;
    if (CANCELLED.has(order.status)) {
      entry.cancelled += 1;
    } else {
      entry.revenue += order.totalPrice - (order.deliveryCost ?? 0);
    }
    entry.lastOrderAt = order.createdAt.toISOString();
    const point = entry.trend.find((day) => day.date === dayKey(order.createdAt));
    if (point) point.value += 1;
  }
  return stats;
}
