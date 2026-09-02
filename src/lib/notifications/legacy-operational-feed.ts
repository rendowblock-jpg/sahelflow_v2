import { openAutomationNotificationBody } from "@/lib/automations/notification-codec";
import { db, shopContext } from "@/lib/db";
import { trustedActionAllowed } from "@/lib/identity/authorization";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
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

/** Preserve the existing permission-filtered operational alert projection. */
export async function listLegacyOperationalNotifications() {
  const actorContext = await requireTrustedActor();
  const canReadOrders = trustedActionAllowed(actorContext, "orders.read");
  const canReadContacts = trustedActionAllowed(
    actorContext,
    "customers.contact.read",
  );
  const canReadFinancials = trustedActionAllowed(
    actorContext,
    "orders.financials.read",
  );
  const canReadDeliveries = trustedActionAllowed(
    actorContext,
    "deliveries.read",
  );
  const canReadProducts = trustedActionAllowed(actorContext, "products.read");
  const canReadConversations = trustedActionAllowed(
    actorContext,
    "conversations.read",
  );
  const canReadAutomations = trustedActionAllowed(
    actorContext,
    "automations.read",
  );
  const { t, locale } = await getI18n();
  const numLocale = intlLocale(locale);
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const notificationContext = { prisma: db, shop: shopContext };

  const recentOrders = canReadOrders ? await db.order.findMany({
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
  }) : [];

  const recentDeliveries = canReadDeliveries ? await db.delivery.findMany({
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
  }) : [];

  const lowStockProducts = canReadProducts ? await db.product.findMany({
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
      updatedAt: true,
    },
  }) : [];

  const recentReturns = canReadOrders ? await db.return.findMany({
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
  }) : [];

  // Filter automation alerts by the underlying source authority *before* the
  // Bell limit and before opening their protected bodies. Newer unauthorized
  // notices therefore cannot starve older authorized notices or cause PII to
  // be decrypted for an actor who cannot read the originating business data.
  const allowedAutomationTriggers: string[] = [];
  if (canReadOrders && canReadContacts && canReadFinancials) {
    allowedAutomationTriggers.push(
      "order.created",
      "order.confirmed",
      "order.shipped",
      "order.delivered",
      "order.returned",
      "order.refused",
      "order.cancelled",
    );
  }
  if (canReadContacts) allowedAutomationTriggers.push("customer.blacklisted");
  if (canReadConversations && canReadContacts) {
    allowedAutomationTriggers.push("message.received");
  }
  if (canReadProducts) allowedAutomationTriggers.push("stock.low");

  const storedAutomationNotifications =
    canReadAutomations && allowedAutomationTriggers.length > 0
      ? await db.automationNotification.findMany({
          where: {
            run: {
              triggerType: { in: allowedAutomationTriggers },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 8,
          select: {
            id: true,
            notificationKey: true,
            title: true,
            body: true,
            link: true,
            readAt: true,
            createdAt: true,
          },
        })
      : [];
  const automationNotifications = await Promise.all(
    storedAutomationNotifications.map(async (notification) => ({
      ...notification,
      body: await openAutomationNotificationBody(notificationContext, {
        notificationId: notification.id,
        notificationKey: notification.notificationKey,
        protectedBody: notification.body,
      }),
    })),
  );

  const staleThreshold = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const staleOrders = canReadOrders ? await db.order.count({
    where: {
      status: "pending",
      createdAt: { lt: staleThreshold },
      deletedAt: null,
    },
  }) : 0;

  const notifications: Array<{
    id: string;
    type: "alert" | "order" | "delivery" | "stock" | "return" | "info";
    title: string;
    body: string;
    time: string;
    read: boolean;
    link: string;
    /** Audit S3-19: real timestamp of the underlying record when one exists.
     *  Aggregate rows (e.g. stale-queue) have none and are marked approximate
     *  by the route instead of fabricating "now". */
    createdAt?: string;
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

  for (const notification of automationNotifications) {
    const minutesAgo = Math.max(
      0,
      Math.round((now.getTime() - notification.createdAt.getTime()) / 60_000),
    );
    notifications.push({
      id: `automation-${notification.id}`,
      type: "info",
      title: notification.title,
      body: notification.body,
      time: formatRelativeTime(minutesAgo, t),
      // The current Bell projection is age-based for operational notices too.
      // Persist readAt for the future explicit read command while preventing an
      // old automation alert from pinning the global unread badge forever.
      read: Boolean(notification.readAt) || minutesAgo > 24 * 60,
      link: notification.link ?? "/automations?tab=activity",
      createdAt: notification.createdAt.toISOString(),
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
      body:
        canReadContacts && canReadFinancials
          ? t("notif.newOrder.body", {
              customer: order.customer?.name ?? t("common.unknown"),
              wilaya: order.wilaya,
              total: order.totalPrice.toLocaleString(numLocale),
            })
          : canReadContacts
            ? `${order.customer?.name ?? t("common.unknown")} · ${order.wilaya}`
            : canReadFinancials
              ? `${order.wilaya} · ${order.totalPrice.toLocaleString(numLocale)}`
              : order.wilaya,
      time: formatRelativeTime(minutesAgo, t),
      read: minutesAgo > 60,
      link: `/orders/${order.id}`,
      createdAt: order.createdAt.toISOString(),
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
      createdAt: delivery.updatedAt.toISOString(),
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
      createdAt: product.updatedAt.toISOString(),
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
        reason: canReadContacts
          ? item.reason.slice(0, 60) + (item.reason.length > 60 ? "…" : "")
          : t("common.unknown"),
      }),
      time: formatRelativeTime(minutesAgo, t),
      read: minutesAgo > 120,
      link: item.order?.id ? `/orders/${item.order.id}` : "/returns",
      createdAt: item.createdAt.toISOString(),
    });
  }

  notifications.sort((left, right) => {
    if (left.read !== right.read) return left.read ? 1 : -1;
    if (!left.time && right.time) return -1;
    if (left.time && !right.time) return 1;
    return 0;
  });

  return notifications.slice(0, 12);
}
