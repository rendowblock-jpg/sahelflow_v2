import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { notificationQuerySchema } from "@/lib/notifications/contracts";
import { listLegacyOperationalNotifications } from "@/lib/notifications/legacy-operational-feed";
import { listNotifications } from "@/lib/notifications/notification-center";

export const dynamic = "force-dynamic";

function relativeTime(
  createdAt: string,
  translate: (key: string, params?: Record<string, string | number>) => string,
): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60_000));
  if (minutes < 1) return translate("notif.time.now");
  if (minutes < 60) return translate("notif.time.minutes", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return translate("notif.time.hours", { count: hours });
  return translate("notif.time.days", { count: Math.round(hours / 24) });
}

/** Durable, per-actor Notification Center projection with cursor pagination. */
export const GET = withErrorHandler(async (request?: NextRequest) => {
  const actorContext = await requireTrustedAction("conversations.read");
  const query = notificationQuerySchema.parse(
    request
      ? Object.fromEntries(request.nextUrl.searchParams.entries())
      : {},
  );
  const [result, legacy] = await Promise.all([
    listNotifications(actorContext, query),
    query.cursor || query.category || query.severity || query.state === "archived"
      ? Promise.resolve([])
      : listLegacyOperationalNotifications(),
  ]);
  const { t } = await getI18n();
  const compatibleLegacy = legacy
    .filter((notification) =>
      query.state === "read"
        ? notification.read
        : query.state === "unread"
          ? !notification.read
          : true,
    )
    .map((notification) => ({
      ...notification,
      durable: false,
      category: notification.type,
      severity: notification.type === "alert"
        ? "critical"
        : notification.type === "stock"
          ? "warning"
          : "info",
      archived: false,
      createdAt: new Date().toISOString(),
      nativePending: false,
    }));
  return NextResponse.json({
    ...result,
    notifications: [
      ...result.notifications.map((notification) => ({
        ...notification,
        title: t(notification.titleKey),
        body: t(notification.bodyKey),
        time: relativeTime(notification.createdAt, t),
      })),
      ...compatibleLegacy,
    ],
    unreadCount:
      result.unreadCount +
      compatibleLegacy.filter((notification) => !notification.read).length,
  });
}, "GET /api/notifications");
