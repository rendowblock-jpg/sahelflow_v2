import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

/**
 * GET /api/notifications — Compute real-time notifications from recent events.
 *
 * Derives notifications from:
 *  1. New orders in the last 24h (unconfirmed) — with customer name + total
 *  2. Recent deliveries status changes — with tracking + provider
 *  3. Low-stock products — with stock level + threshold
 *  4. Returns in the last 24h — with reason + order number
 *  5. Stale confirmation queue — orders pending > 2h
 *
 * Returns rich notification objects with title, description, icon type, link, time.
 */
export const GET = withErrorHandler(async () => {
  await requireAuth();
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 1. New orders (pending/draft) in last 24h — with customer + total
  const recentOrders = await db.order.findMany({
    where: {
      createdAt: { gte: oneDayAgo },
      status: { in: ["pending", "draft"] },
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      status: true,
      totalPrice: true,
      wilaya: true,
      customer: { select: { name: true } },
    },
  });

  // 2. Recent deliveries (status updates in last 24h) — with provider
  const recentDeliveries = await db.delivery.findMany({
    where: { updatedAt: { gte: oneDayAgo }, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: {
      id: true,
      trackingNumber: true,
      status: true,
      updatedAt: true,
      provider: true,
      order: { select: { id: true, orderNumber: true } },
    },
  });

  // 3. Low-stock products
  const lowStockProducts = await db.product.findMany({
    where: { stock: { lte: db.product.fields.lowStockThreshold }, isActive: true, deletedAt: null },
    take: 5,
    select: { id: true, name: true, stock: true, lowStockThreshold: true },
  });

  // 4. Recent returns (last 24h)
  const recentReturns = await db.return.findMany({
    where: { createdAt: { gte: oneDayAgo }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, reason: true, type: true, createdAt: true, order: { select: { id: true, orderNumber: true } } },
  });

  // 5. Stale confirmation queue (pending > 2h)
  const staleThreshold = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const staleOrders = await db.order.count({
    where: { status: "pending", createdAt: { lt: staleThreshold }, deletedAt: null },
  });

  // Build rich notification list
  const notifications = [];

  // Stale confirmation queue (highest priority)
  if (staleOrders > 0) {
    notifications.push({
      id: "stale-queue",
      type: "alert" as const,
      title: `${staleOrders} order${staleOrders > 1 ? "s" : ""} need confirmation`,
      body: `Pending for over 2 hours — call customers to reduce refusal rate`,
      time: "now",
      read: false,
      link: "/orders/confirmation-queue",
    });
  }

  // New orders
  for (const order of recentOrders.slice(0, 5)) {
    const minutesAgo = Math.round((now.getTime() - order.createdAt.getTime()) / 60000);
    const customerName = order.customer?.name ?? "Unknown";
    notifications.push({
      id: `order-${order.id}`,
      type: "order" as const,
      title: `New order ${order.orderNumber}`,
      body: `${customerName} · ${order.wilaya} · ${order.totalPrice.toLocaleString()} DZD`,
      time: formatRelativeTime(minutesAgo),
      read: minutesAgo > 60,
      link: `/orders/${order.id}`,
    });
  }

  // Delivery updates
  for (const delivery of recentDeliveries) {
    const minutesAgo = Math.round((now.getTime() - delivery.updatedAt.getTime()) / 60000);
    const orderNum = delivery.order?.orderNumber ?? "—";
    notifications.push({
      id: `delivery-${delivery.id}`,
      type: "delivery" as const,
      title: `Delivery ${delivery.status}`,
      body: `${orderNum} · ${delivery.provider} · ${delivery.trackingNumber ?? "No tracking"}`,
      time: formatRelativeTime(minutesAgo),
      read: minutesAgo > 120,
      link: delivery.order?.id ? `/orders/${delivery.order.id}` : "/deliveries",
    });
  }

  // Low stock
  for (const product of lowStockProducts) {
    notifications.push({
      id: `stock-${product.id}`,
      type: "stock" as const,
      title: `Low stock: ${product.name}`,
      body: `${product.stock} left (threshold: ${product.lowStockThreshold})`,
      time: "",
      read: false,
      link: `/products/${product.id}`,
    });
  }

  // Returns
  for (const ret of recentReturns) {
    const minutesAgo = Math.round((now.getTime() - ret.createdAt.getTime()) / 60000);
    const orderNum = ret.order?.orderNumber ?? "—";
    notifications.push({
      id: `return-${ret.id}`,
      type: "return" as const,
      title: `${ret.type === "exchange" ? "Exchange" : "Return"} requested`,
      body: `${orderNum} · ${ret.reason.slice(0, 60)}${ret.reason.length > 60 ? "…" : ""}`,
      time: formatRelativeTime(minutesAgo),
      read: minutesAgo > 120,
      link: ret.order?.id ? `/orders/${ret.order.id}` : "/returns",
    });
  }

  // Sort by unread first, then newest (empty time = highest priority)
  notifications.sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    if (!a.time && b.time) return -1;
    if (a.time && !b.time) return 1;
    return 0;
  });

  return NextResponse.json({ notifications: notifications.slice(0, 12) });
}, "GET /api/notifications");

function formatRelativeTime(minutesAgo: number): string {
  if (minutesAgo < 1) return "now";
  if (minutesAgo < 60) return `${minutesAgo}m`;
  const hours = Math.round(minutesAgo / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}
