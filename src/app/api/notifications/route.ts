import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRouteAuth } from "@/lib/auth/route-authority";
import { db } from "@/lib/db";
import type { Locale } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";

/** Convert snake_case delivery status to camelCase for i18n lookup. */
function statusToCamel(status: string): string {
  return status.replace(/_([a-z])/g, (_, character: string) =>
    character.toUpperCase(),
  );
}

function deliveryStatusLabel(
  status: string,
  translate: (key: string) => string,
): string {
  const key = `deliveries.status.${statusToCamel(status)}`;
  const translated = translate(key);
  return translated === key
    ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")
    : translated;
}

function formatRelativeTime(
  minutesAgo: number,
  translate: (
    key: string,
    params?: Record<string, string | number>,
  ) => string,
): string {
  if (minutesAgo < 1) return translate("notif.time.now");
  if (minutesAgo < 60) {
    return translate("notif.time.minutes", { count: minutesAgo });
  }
  const hours = Math.round(minutesAgo / 60);
  if (hours < 24) return translate("notif.time.hours", { count: hours });
  return translate("notif.time.days", { count: Math.round(hours / 24) });
}

function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-DZ" : locale === "en" ? "en-US" : "fr-FR";
}

/** GET /api/notifications — compute real-time operational notifications. */
export const GET = withErrorHandler(async (request?: NextRequest) => {
  await requireRouteAuth(request, { allowMissingRequestInTests: true });
  const { t, locale } = await getI18n();
  const numLocale = intlLocale(locale);
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

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

  const lowStockProducts = await db.product.findMany({
    where: {
      stock: { lte: db.product.fields.lowStockThreshold },
      isActive: true,
      deletedAt: null,
    },
    take: 5,
    select: {
      id: true,
      name: true,
      stock: true,
      lowStockThreshold: true,
    },
  });

  const recentReturns = await db.return.findMany({
    where: { createdAt: { gte: oneDayAgo }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      id: true,
      reason: true,
      type: true,
      createdAt: true,
      order: { select: { id: true, orderNumber: true } },
    },
  });

  const staleThreshold = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const staleOrders = await db.order.count({
    where: {
      status: "pending",
      createdAt: { lt: staleThreshold },
      deletedAt: null,
    },
  });

  const notifications: Array<{
    id: string;
    type: "alert" | "order" | "delivery" | "stock" | "return";
    title: string;
    body: string;
    time: string;
    read: boolean;
    link: string;
  }> = [];

  if (staleOrders > 0) {
    notifications.push({
      id: "stale-queue",
      type: "alert",
      title: t("notif.staleQueue.title", { count: staleOrders }),
      body: t("notif.staleQueue.body"),
      time: t("notif.time.now"),
      read: false,
      link: "/orders/confirmation-queue",
    });
  }

  for (const order of recentOrders.slice(0, 5)) {
    const minutesAgo = Math.round(
      (now.getTime() - order.createdAt.getTime()) / 60_000,
    );
    notifications.push({
      id: `order-${order.id}`,
      type: "order",
      title: t("notif.newOrder.title", { orderNumber: order.orderNumber }),
      body: t("notif.newOrder.body", {
        customer: order.customer?.name ?? t("common.unknown"),
        wilaya: order.wilaya,
        total: order.totalPrice.toLocaleString(numLocale),
      }),
      time: formatRelativeTime(minutesAgo, t),
      read: minutesAgo > 60,
      link: `/orders/${order.id}`,
    });
  }

  for (const delivery of recentDeliveries) {
    const minutesAgo = Math.round(
      (now.getTime() - delivery.updatedAt.getTime()) / 60_000,
    );
    notifications.push({
      id: `delivery-${delivery.id}`,
      type: "delivery",
      title: t("notif.delivery.title", {
        status: deliveryStatusLabel(delivery.status, t),
      }),
      body: t("notif.delivery.body", {
        orderNumber: delivery.order?.orderNumber ?? "—",
        provider: delivery.provider,
        tracking: delivery.trackingNumber ?? t("deliveries.noTracking"),
      }),
      time: formatRelativeTime(minutesAgo, t),
      read: minutesAgo > 120,
      link: delivery.order?.id
        ? `/orders/${delivery.order.id}`
        : "/deliveries",
    });
  }

  for (const product of lowStockProducts) {
    notifications.push({
      id: `stock-${product.id}`,
      type: "stock",
      title: t("notif.lowStock.title", { name: product.name }),
      body: t("notif.lowStock.body", {
        stock: product.stock,
        threshold: product.lowStockThreshold,
      }),
      time: "",
      read: false,
      link: `/products/${product.id}`,
    });
  }

  for (const item of recentReturns) {
    const minutesAgo = Math.round(
      (now.getTime() - item.createdAt.getTime()) / 60_000,
    );
    const typeLabel =
      item.type === "exchange"
        ? t("returns.type.exchange")
        : item.type === "refund"
          ? t("returns.type.refund")
          : t("returns.type.return");
    notifications.push({
      id: `return-${item.id}`,
      type: "return",
      title: t("notif.return.title", { type: typeLabel }),
      body: t("notif.return.body", {
        orderNumber: item.order?.orderNumber ?? "—",
        reason:
          item.reason.slice(0, 60) + (item.reason.length > 60 ? "…" : ""),
      }),
      time: formatRelativeTime(minutesAgo, t),
      read: minutesAgo > 120,
      link: item.order?.id ? `/orders/${item.order.id}` : "/returns",
    });
  }

  notifications.sort((left, right) => {
    if (left.read !== right.read) return left.read ? 1 : -1;
    if (!left.time && right.time) return -1;
    if (left.time && !right.time) return 1;
    return 0;
  });

  return NextResponse.json({ notifications: notifications.slice(0, 12) });
}, "GET /api/notifications");
