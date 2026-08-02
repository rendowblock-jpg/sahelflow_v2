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
}>;

type DashboardProjectionSource = Readonly<{
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
    wilaya: string;
    totalPrice: number;
    items: readonly unknown[];
    customer: Readonly<{ name: string | null }>;
  }>[];
  analytics: Readonly<{
    revenueSeries: readonly Readonly<{ revenue: number; orders: number }>[];
    customerGrowth?: readonly Readonly<{ newCustomers: number }>[];
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

/** Resolve every dashboard field decision before any private data is queried. */
export function resolveDashboardFieldAccess(
  actorContext: TrustedActorContext,
): DashboardFieldAccess {
  assertTrustedAction(actorContext, "shops.read", {
    shopId: actorContext.shop.shopId,
  });
  const orders = allowed(actorContext, "orders.read");
  const analytics = allowed(actorContext, "analytics.read");
  return Object.freeze({
    orders,
    orderFinancials:
      orders && allowed(actorContext, "orders.financials.read"),
    customerContact: allowed(actorContext, "customers.contact.read"),
    customers: allowed(actorContext, "customers.read"),
    conversations: allowed(actorContext, "conversations.read"),
    deliveries: allowed(actorContext, "deliveries.read"),
    products: allowed(actorContext, "products.read"),
    analytics,
    analyticsFinancials:
      analytics && allowed(actorContext, "analytics.financials.read"),
  });
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
  });

  const recentOrders = fieldAccess.orders
    ? source.recentOrders.map((order) =>
        Object.freeze({
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          customerName: fieldAccess.customerContact
            ? order.customer.name
            : null,
          wilaya: fieldAccess.customerContact ? order.wilaya : null,
          itemCount: order.items.length,
          totalPrice: fieldAccess.orderFinancials ? order.totalPrice : null,
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
                Object.freeze({ newCustomers: entry.newCustomers }),
              ),
            )
          : Object.freeze([]),
      deliveryPerformance: fieldAccess.deliveries
        ? Object.freeze({ ...source.analytics.deliveryPerformance })
        : null,
    }),
  });
}
