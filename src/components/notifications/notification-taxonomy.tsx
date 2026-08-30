"use client";

import { useEffect, useRef, useState } from "react";
import {
  Info,
  MessageSquare,
  Package,
  ShieldAlert,
  ShoppingBag,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import type { NotificationCenterItem } from "@/hooks/use-notification-center";
import type { Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";

export interface NotificationPresentation {
  icon: LucideIcon;
  /** Tone chip classes (StateSurface/operational-state tone language). */
  className: string;
  /** i18n key for the accessible, type-specific label. */
  labelKey: string;
}

/**
 * Typed visual taxonomy for the six notification types. Every type renders a
 * distinct icon with a subtle semantic tone — no shared Bell, no universal
 * "inbox" badge.
 */
const TYPE_PRESENTATION: Record<
  NotificationCenterItem["type"],
  NotificationPresentation
> = {
  order: {
    icon: ShoppingBag,
    className: "bg-primary/10 text-primary",
    labelKey: "notifications.type.order",
  },
  delivery: {
    icon: Truck,
    className: "bg-info/10 text-info",
    labelKey: "notifications.type.delivery",
  },
  stock: {
    icon: Package,
    className: "bg-warning/10 text-warning",
    labelKey: "notifications.type.stock",
  },
  return: {
    icon: Undo2,
    className: "bg-warning/10 text-warning",
    labelKey: "notifications.type.return",
  },
  alert: {
    icon: ShieldAlert,
    className: "bg-destructive/10 text-destructive",
    labelKey: "notifications.type.alert",
  },
  info: {
    icon: Info,
    className: "bg-muted text-muted-foreground",
    labelKey: "notifications.type.info",
  },
};

const INBOX_PRESENTATION: NotificationPresentation = {
  icon: MessageSquare,
  className: "bg-primary/10 text-primary",
  labelKey: "notifications.inboxCategory",
};

/**
 * Durable rows collapse every category to `type: "info"`; the inbox category
 * keeps the WhatsApp distinction so the flagship loop reads as messages, not
 * as generic system notices.
 */
export function getNotificationPresentation(
  item: Pick<NotificationCenterItem, "type" | "category">,
): NotificationPresentation {
  return item.category === "inbox"
    ? INBOX_PRESENTATION
    : TYPE_PRESENTATION[item.type];
}

function dayKey(value: Date): string {
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

export interface NotificationDayGroup {
  key: string;
  label: string;
  items: NotificationCenterItem[];
}

/**
 * Group newest-first notifications into calendar-day sections. Headers use the
 * existing i18n keys for Today/Yesterday and the canonical localized date
 * formatter for older days; legacy (non-durable) items always carry the server
 * render time, so they group under Today.
 */
export function groupNotificationsByDay(
  items: NotificationCenterItem[],
  locale: Locale,
  t: (key: string, params?: Record<string, string | number>) => string,
  now: Date = new Date(),
): NotificationDayGroup[] {
  const groups: NotificationDayGroup[] = [];
  const byKey = new Map<string, NotificationDayGroup>();
  const todayKey = dayKey(now);
  const yesterdayKey = dayKey(new Date(now.getTime() - 86_400_000));
  for (const item of items) {
    const created = new Date(item.createdAt);
    const key = dayKey(created);
    let group = byKey.get(key);
    if (!group) {
      const label =
        key === todayKey
          ? t("analytics.today")
          : key === yesterdayKey
            ? t("inbox.yesterday")
            : formatDate(created, locale);
      group = { key, label, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/**
 * Polite live region announcing newly arrived notifications (the newest item's
 * already-localized title) without re-announcing the backlog on mount.
 * Rendered once by the topbar so the whole app announces new activity.
 */
export function NotificationAnnouncer({
  notifications,
}: {
  notifications: NotificationCenterItem[];
}) {
  const [announcement, setAnnouncement] = useState("");
  const seenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const seen = seenRef.current;
    if (seen === null) {
      // Seed with the first real projection so existing unread items are not
      // announced as new when the shell first mounts or finishes loading.
      if (notifications.length === 0) return;
      seenRef.current = new Set(notifications.map((item) => item.id));
      return;
    }
    const fresh = notifications.filter((item) => !seen.has(item.id));
    for (const item of notifications) seen.add(item.id);
    const newest = fresh[0];
    if (newest) setAnnouncement(newest.title);
  }, [notifications]);

  return (
    <p role="status" aria-live="polite" className="sr-only">
      {announcement}
    </p>
  );
}
