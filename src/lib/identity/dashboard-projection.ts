import "server-only";

import {
  assertTrustedAction,
  trustedActionAllowed,
} from "./authorization";
import type { TrustedActorContext } from "./trusted-actor";

export type DashboardFieldAccess = Readonly<{
  orders: boolean;
  orderFinancials: boolean;
  customerContact: boolean;
  customers: boolean;
  conversations: boolean;
  deliveries: boolean;
  products: boolean;
  analytics: boolean;
  analyticsFinancials: boolean;
  risk: boolean;
}>;

/**
 * Exact counts the desktop read for the phone's Today screen. null or missing
 * means "unknown" (not asked, or the read failed); 0 is a real answer.
 */
export type DashboardTodayCounts = Readonly<{
  ordersWaiting?: number | null;
  whatsappHeld?: number | null;
  codToCollectDzd?: number | null;
}>;

type DashboardProjectionSource = Readonly<{
  todayCounts?: DashboardTodayCounts;
  stats: Readonly<{
    ordersToday: number;
    ordersTrend: number;
    revenueToday: number;
    revenueTrend: number;
    realizedRevenueToday: number;
    realizedRevenueTrend: number;
    newCustomers: number;
    activeConversations: number;
    pendingDeliveries: number;
    lowStockProducts: number;
  }>;
  recentOrders: readonly Readonly<{
    id: string;
    orderNumber: string;
    status: string;
    wilaya?: string;
    totalPrice?: number;
    items: readonly unknown[];
    customer?: Readonly<{ name: string | null }> | null;
  }>[];
  analytics: Readonly<{
    revenueSeries: readonly Readonly<{ date?: string; revenue: number; orders: number }>[];
    customerGrowth?: readonly Readonly<{ date?: string; newCustomers: number }>[];
    deliveryPerformance: Readonly<{
      deliveryRate: number;
      delivered: number;
      inTransit: number;
      pending: number;
      returned: number;
    }>;
  }>;
}>;

function allowed(
  actorContext: TrustedActorContext,
  action: Parameters<typeof trustedActionAllowed>[1],
): boolean {
  return trustedActionAllowed(actorContext, action, {
    shopId: actorContext.shop.shopId,
  });
}

/** Resolve every dashboard field decision before private rows are queried. */
export function resolveDashboardFieldAccess(
  actorContext: TrustedActorContext,
): DashboardFieldAccess {
  assertTrustedAction(actorContext, "shops.read", {
    shopId: actorContext.shop.shopId,
  });
  const orders = allowed(actorContext, "orders.read");
  const analytics = allowed(actorContext, "analytics.read");
  const customerContact = allowed(actorContext, "customers.contact.read");
  const customers = allowed(actorContext, "customers.read");
  const canReadOrderFinancials = allowed(actorContext, "orders.financials.read");
  const orderFinancials = orders && canReadOrderFinancials;
  return Object.freeze({
    orders,
    orderFinancials,
    customerContact,
    customers,
    conversations: allowed(actorContext, "conversations.read"),
    deliveries: allowed(actorContext, "deliveries.read"),
    products: allowed(actorContext, "products.read"),
    analytics,
    analyticsFinancials:
      analytics && allowed(actorContext, "analytics.financials.read"),
    // Risk analytics combines customer history/contact with order financials.
    // Match the full Risk Engine's assessment boundary exactly before running
    // its underlying report on the dashboard.
    risk:
      allowed(actorContext, "risk.read") &&
      customers &&
      customerContact &&
      canReadOrderFinancials,
  });
}

function isWholeCount(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * The phone's exact numbers. A key exists only when the viewer may see it AND
 * the desktop has a real answer: absent = unknown, never null, never a made-up 0.
 */
function todayCountsForActor(
  counts: DashboardTodayCounts,
  fieldAccess: DashboardFieldAccess,
): { ordersWaiting?: number; whatsappHeld?: number; codToCollectDzd?: number } {
  const out: { ordersWaiting?: number; whatsappHeld?: number; codToCollectDzd?: number } = {};
  if (fieldAccess.orders && isWholeCount(counts.ordersWaiting)) {
    out.ordersWaiting = counts.ordersWaiting;
  }
  if (fieldAccess.conversations && isWholeCount(counts.whatsappHeld)) {
    out.whatsappHeld = counts.whatsappHeld;
  }
  // A money amount: same gate as the order totals.
  if (fieldAccess.orderFinancials && isWholeCount(counts.codToCollectDzd)) {
    out.codToCollectDzd = counts.codToCollectDzd;
  }
  return out;
}

/** Project the server-rendered dashboard into the actor's exact allowlist. */
export function projectDashboardForTrustedActor(
  source: DashboardProjectionSource,
  fieldAccess: DashboardFieldAccess,
) {
  const stats = Object.freeze({
    ordersToday: fieldAccess.orders ? source.stats.ordersToday : null,
    ordersTrend: fieldAccess.orders ? source.stats.ordersTrend : null,
    revenueToday: fieldAccess.analyticsFinancials
      ? source.stats.revenueToday
      : null,
    revenueTrend: fieldAccess.analyticsFinancials
      ? source.stats.revenueTrend
      : null,
    realizedRevenueToday: fieldAccess.analyticsFinancials
      ? source.stats.realizedRevenueToday
      : null,
    newCustomers: fieldAccess.customers ? source.stats.newCustomers : null,
    activeConversations: fieldAccess.conversations
      ? source.stats.activeConversations
      : null,
    pendingDeliveries: fieldAccess.deliveries
      ? source.stats.pendingDeliveries
      : null,
    lowStockProducts: fieldAccess.products
      ? source.stats.lowStockProducts
      : null,
    ...todayCountsForActor(source.todayCounts ?? {}, fieldAccess),
  });

  const recentOrders = fieldAccess.orders
    ? source.recentOrders.map((order) =>
        Object.freeze({
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          customerName: fieldAccess.customerContact
            ? order.customer?.name ?? null
            : null,
          wilaya: fieldAccess.customerContact ? order.wilaya ?? null : null,
          itemCount: order.items.length,
          totalPrice: fieldAccess.orderFinancials
            ? order.totalPrice ?? null
            : null,
        }),
      )
    : [];

  return Object.freeze({
    fieldAccess,
    stats,
    recentOrders: Object.freeze(recentOrders),
    analytics: Object.freeze({
      revenueSeries: fieldAccess.analytics
        ? Object.freeze(
            source.analytics.revenueSeries.map((entry) =>
              Object.freeze({
                // The day is presentation metadata (the chart read-out), never
                // a financial or customer field.
                date: entry.date,
                orders: entry.orders,
                revenue: fieldAccess.analyticsFinancials
                  ? entry.revenue
                  : null,
              }),
            ),
          )
        : Object.freeze([]),
      customerGrowth:
        fieldAccess.analytics && fieldAccess.customers
          ? Object.freeze(
              (source.analytics.customerGrowth ?? []).map((entry) =>
                Object.freeze({
                  date: entry.date,
                  newCustomers: entry.newCustomers,
                }),
              ),
            )
          : Object.freeze([]),
      deliveryPerformance: fieldAccess.deliveries
        ? Object.freeze({ ...source.analytics.deliveryPerformance })
        : null,
    }),
  });
}
