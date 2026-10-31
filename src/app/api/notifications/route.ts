import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { notificationQuerySchema } from "@/lib/notifications/contracts";
import { listLegacyOperationalNotifications } from "@/lib/notifications/legacy-operational-feed";
import { listNotifications } from "@/lib/notifications/notification-center";
import {
  filterDismissedAlerts,
  readDismissedAlerts,
} from "@/lib/notifications/operational-dismissals";

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
  const [result, legacy, dismissed] = await Promise.all([
    listNotifications(actorContext, query),
    query.cursor || query.category || query.severity || query.state === "archived"
      ? Promise.resolve([])
      : listLegacyOperationalNotifications(),
    readDismissedAlerts(actorContext),
  ]);
  const { t } = await getI18n();
  const visibleLegacy = legacy
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
      // Audit S3-19: legacy rows previously fabricated createdAt = now, so
      // relative times ("2 minutes ago") lied for stale stock/alert rows.
      // The feed now derives a real timestamp from the underlying record;
      // aggregate rows without one carry `approximate: true` (additive field)
      // so the UI can stop promising false relative times later.
      createdAt: notification.createdAt ?? new Date().toISOString(),
      approximate: !notification.createdAt,
      nativePending: false,
    }));
  // Alerts this member cleared stay cleared, across restarts: the server
  // remembers them (see operational-dismissals.ts). One whose text has
  // changed since is a different situation and is shown again.
  const compatibleLegacy = filterDismissedAlerts(visibleLegacy, dismissed);
  return NextResponse.json({
    ...result,
    notifications: [
      ...result.notifications.map((notification) => ({
        ...notification,
        title: t(notification.titleKey),
        body: notification.count === null ? t(notification.bodyKey) : t(notification.bodyKey, { count: notification.count }),
        ...(notification.digestCount
          ? {
              nativeTitle: t("notifications.events.digest.title"),
              nativeBody: t("notifications.events.digest.body", { count: notification.digestCount }),
            }
          : {}),
        time: relativeTime(notification.createdAt, t),
      })),
      ...compatibleLegacy,
    ],
    unreadCount:
      result.unreadCount +
      compatibleLegacy.filter((notification) => !notification.read).length,
  });
}, "GET /api/notifications");
