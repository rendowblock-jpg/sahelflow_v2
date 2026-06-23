import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/notifications — Compute real-time notifications from recent events.
 *
 * Instead of a dedicated Notification table, we derive notifications from:
 *  1. New orders in the last 24h (unconfirmed)
 *  2. Recent deliveries status changes
 *  3. Low-stock products
 *
 * This is a hybrid approach — lightweight, zero schema migration, and always up-to-date.
 */
export async function GET() {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. New orders (pending) in last 24h
    const recentOrders = await db.order.findMany({
      where: {
        createdAt: { gte: oneDayAgo },
        status: { in: ["pending", "draft"] },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, orderNumber: true, createdAt: true, status: true },
    });

    // 2. Recent deliveries (status updates in last 24h)
    const recentDeliveries = await db.delivery.findMany({
      where: { updatedAt: { gte: oneDayAgo } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, trackingNumber: true, status: true, updatedAt: true },
    });

    // 3. Low-stock products (per-product threshold, not hardcoded 5)
    const lowStockProducts = await db.product.findMany({
      where: { stock: { lte: db.product.fields.lowStockThreshold }, isActive: true },
      take: 5,
      select: { id: true, name: true, stock: true },
    });

    // Build notification list
    const notifications = [];

    for (const order of recentOrders) {
      const minutesAgo = Math.round((now.getTime() - order.createdAt.getTime()) / 60000);
      notifications.push({
        id: `order-${order.id}`,
        type: "order" as const,
        title: `${order.orderNumber}`,
        body: order.status,
        time: formatRelativeTime(minutesAgo),
        read: false,
      });
    }

    for (const delivery of recentDeliveries) {
      const minutesAgo = Math.round((now.getTime() - delivery.updatedAt.getTime()) / 60000);
      notifications.push({
        id: `delivery-${delivery.id}`,
        type: "delivery" as const,
        title: delivery.trackingNumber ?? "Delivery",
        body: delivery.status,
        time: formatRelativeTime(minutesAgo),
        read: minutesAgo > 60, // Mark as read if older than 1h
      });
    }

    for (const product of lowStockProducts) {
      notifications.push({
        id: `stock-${product.id}`,
        type: "stock" as const,
        title: product.name,
        body: `Stock: ${product.stock}`,
        time: "",
        read: false,
      });
    }

    // Sort by unread first, then newest
    notifications.sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      return 0;
    });

    return NextResponse.json({ notifications: notifications.slice(0, 10) });
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ notifications: [] });
  }
}

function formatRelativeTime(minutesAgo: number): string {
  if (minutesAgo < 1) return "now";
  if (minutesAgo < 60) return `${minutesAgo}m`;
  const hours = Math.round(minutesAgo / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}
