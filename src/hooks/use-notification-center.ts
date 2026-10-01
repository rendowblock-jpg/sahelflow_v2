"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";

import { useWhatsAppSocket } from "@/hooks/use-whatsapp-socket";
import {
  listenForDesktopNotificationActions,
  sendDesktopNotification,
} from "@/lib/notifications/native-client";
import { fetcher } from "@/lib/swr/fetcher";
import { mutatePrefix } from "@/lib/swr/mutate";

/**
 * Single polling authority for the notification center.
 *
 * One SWR query (the live key below, `refreshInterval`-driven) feeds BOTH the
 * topbar bell and the notifications workspace default view, replacing the
 * former dual cadence (one interval timer in this hook plus an independent
 * fetch stream in the workspace). Secondary filter views in the workspace use
 * non-polling queries that share the same SWR cache and are revalidated by the
 * socket bridge and by lifecycle mutations via `mutatePrefix`, so there is
 * exactly one interval-driven network cadence app-wide.
 */
// The WhatsApp socket bridge below revalidates within 250 ms of a new inbound
// message, so this interval is only the fallback. At 3 s it ran a sync write
// plus a list read every 3 s on every page, which a low-end laptop paid for on
// every click.
const NOTIFICATION_POLL_MS = 15_000;
const NOTIFICATIONS_SWR_PREFIX = "/api/notifications";
// The topbar list scrolls, so it carries the API maximum page.
const NOTIFICATION_PAGE_LIMIT = 50;
const LIVE_QUERY_KEY = `${NOTIFICATIONS_SWR_PREFIX}?state=active&limit=${NOTIFICATION_PAGE_LIMIT}`;

export type NotificationFeedState = "active" | "unread" | "read" | "archived";

export interface NotificationCenterItem {
  id: string;
  durable: boolean;
  type: "info" | "alert" | "order" | "delivery" | "stock" | "return";
  category: "inbox" | "alert" | "order" | "delivery" | "stock" | "return";
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  time: string;
  read: boolean;
  archived: boolean;
  link: string;
  createdAt: string;
  nativePending: boolean;
}

export interface NotificationCenterPreference {
  inboxEnabled: boolean;
  nativeEnabled: boolean;
  soundEnabled: boolean;
  previewEnabled: boolean;
  quietStartMinute: number | null;
  quietEndMinute: number | null;
  mutedUntil: string | null;
  retentionDays: number;
}

interface NotificationCenterResponse {
  notifications: NotificationCenterItem[];
  unreadCount: number;
  nextCursor: string | null;
  preference: NotificationCenterPreference;
}

/**
 * Shared fetcher for every notification query: recover durable event markers
 * into this actor's projection, then read it. Network-level failures (and
 * non-OK list responses via `fetcher`) propagate to the SWR error object so
 * surfaces surface them instead of silently swallowing them.
 */
async function notificationsFetcher(
  url: string,
): Promise<NotificationCenterResponse> {
  await fetch(`${NOTIFICATIONS_SWR_PREFIX}/sync`, { method: "POST" });
  return fetcher<NotificationCenterResponse>(url);
}

async function lifecycle(id: string, action: "read" | "archive" | "recover") {
  return fetch(`/api/notifications/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

/*
 * Dismissal of computed operational alerts ("Low stock: X", "9 orders need
 * confirmation"). They are derived from live shop state, not stored rows, so a
 * dismissal is remembered for the exact state it was shown for: the id plus
 * its rendered text. When the situation changes (stock drops further, more
 * orders pile up) the text changes and the alert returns — a real problem is
 * never hidden forever. Durable notifications use the server archive instead.
 */
const DISMISSED_STORAGE_KEY = "sahelflow-dismissed-notifications";
const DISMISSED_LIMIT = 200;
type DismissedMap = Record<string, string>;
const dismissedListeners = new Set<() => void>();
let dismissedCache: DismissedMap | null = null;
const EMPTY_DISMISSED: DismissedMap = {};

function readDismissed(): DismissedMap {
  if (dismissedCache) return dismissedCache;
  try {
    const raw = window.localStorage.getItem(DISMISSED_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    dismissedCache =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as DismissedMap)
        : {};
  } catch {
    dismissedCache = {};
  }
  return dismissedCache;
}

function writeDismissed(next: DismissedMap) {
  const entries = Object.entries(next).slice(-DISMISSED_LIMIT);
  dismissedCache = Object.fromEntries(entries);
  try {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(dismissedCache));
  } catch {
    // Storage unavailable: the dismissal still holds for this session.
  }
  for (const listener of dismissedListeners) listener();
}

function subscribeDismissed(listener: () => void) {
  dismissedListeners.add(listener);
  return () => dismissedListeners.delete(listener);
}

function operationalFingerprint(notification: NotificationCenterItem): string {
  return `${notification.title}\u0000${notification.body}`;
}

/** The dismissal map, shared by the bell and the notifications workspace. */
function useDismissedOperational(): DismissedMap {
  return useSyncExternalStore(
    subscribeDismissed,
    readDismissed,
    () => EMPTY_DISMISSED,
  );
}

function isHidden(notification: NotificationCenterItem, dismissed: DismissedMap) {
  return (
    !notification.durable &&
    dismissed[notification.id] === operationalFingerprint(notification)
  );
}

/**
 * Remove one notification from the center. Returns an `undo` that restores it
 * (server recover for durable rows, forget-the-dismissal for computed alerts).
 */
export async function dismissNotification(
  notification: NotificationCenterItem,
): Promise<{ ok: boolean; undo: () => Promise<void> }> {
  if (notification.durable) {
    const response = await lifecycle(notification.id, "archive");
    await revalidateNotifications();
    return {
      ok: response.ok,
      undo: async () => {
        await lifecycle(notification.id, "recover");
        await revalidateNotifications();
      },
    };
  }
  writeDismissed({
    ...readDismissed(),
    [notification.id]: operationalFingerprint(notification),
  });
  return {
    ok: true,
    undo: async () => {
      const next = { ...readDismissed() };
      delete next[notification.id];
      writeDismissed(next);
    },
  };
}

/** Revalidate every mounted notification query (live + filter views). */
function revalidateNotifications(): Promise<void> {
  return mutatePrefix(NOTIFICATIONS_SWR_PREFIX);
}

/**
 * Live notification center authority for the application shell (topbar).
 *
 * Owns the single polling query, the sidecar push bridge and the native
 * claim → deliver → complete lifecycle. The native lifecycle is untouched:
 * claims are exclusive per attempt, foreground focus suppresses delivery,
 * and every terminal state (sent/denied/failed/suppressed) is completed with
 * its reason code.
 */
export function useNotificationCenter() {
  const router = useRouter();
  const { data, error, mutate } = useSWR<NotificationCenterResponse>(
    LIVE_QUERY_KEY,
    notificationsFetcher,
    {
      refreshInterval: NOTIFICATION_POLL_MS,
      revalidateOnFocus: true,
      dedupingInterval: 1_000,
    },
  );

  const dismissed = useDismissedOperational();
  const allNotifications = data?.notifications;
  const notifications = useMemo(
    () => (allNotifications ?? []).filter((item) => !isHidden(item, dismissed)),
    [allNotifications, dismissed],
  );
  const hiddenUnread = (allNotifications ?? []).filter(
    (item) => !item.read && isHidden(item, dismissed),
  ).length;
  const unreadCount = Math.max(0, (data?.unreadCount ?? 0) - hiddenUnread);

  const nativeInFlightRef = useRef(new Set<string>());

  const completeNative = useCallback(
    async (
      id: string,
      deliveryState: "sent" | "denied" | "failed" | "suppressed",
      reasonCode: string | null,
    ) => {
      await fetch(`/api/notifications/${encodeURIComponent(id)}/native`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          state: deliveryState,
          reasonCode,
        }),
      });
    },
    [],
  );

  const deliverNative = useCallback(
    async (notification: NotificationCenterItem) => {
      const inFlight = nativeInFlightRef.current;
      if (inFlight.has(notification.id)) return;
      inFlight.add(notification.id);
      try {
        const response = await fetch(
          `/api/notifications/${encodeURIComponent(notification.id)}/native`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "claim" }),
          },
        );
        if (!response.ok) return;
        const claim = (await response.json()) as {
          deliver?: boolean;
          preview?: { contactName: string; body: string } | null;
          soundEnabled?: boolean;
          link?: string;
        };
        if (!claim.deliver || !claim.link) return;
        if (document.visibilityState === "visible" && document.hasFocus()) {
          await completeNative(notification.id, "suppressed", "foreground");
          return;
        }
        const result = await sendDesktopNotification({
          title: claim.preview?.contactName ?? notification.title,
          body: claim.preview?.body ?? notification.body,
          link: claim.link,
          soundEnabled: claim.soundEnabled === true,
        });
        if (result === "sent") await completeNative(notification.id, "sent", null);
        else if (result === "denied") {
          await completeNative(notification.id, "denied", "permission-denied");
        } else {
          await completeNative(notification.id, "failed", "plugin-unavailable");
        }
      } catch {
        await completeNative(notification.id, "failed", "native-send-failed").catch(
          () => undefined,
        );
      } finally {
        inFlight.delete(notification.id);
      }
    },
    [completeNative],
  );

  // Native delivery follows the polled live projection exactly as before: any
  // still-pending native notification is claimed once per poll cycle.
  useEffect(() => {
    if (!data) return;
    for (const notification of data.notifications) {
      if (notification.nativePending) void deliverNative(notification);
    }
  }, [data, deliverNative]);

  // The sidecar push is the live signal; the durable API remains authority.
  useWhatsAppSocket({
    onMessage: (message) => {
      if (!message.key.fromMe) {
        window.setTimeout(() => void revalidateNotifications(), 250);
      }
    },
  });

  useEffect(() => {
    let dispose: () => void = () => undefined;
    void listenForDesktopNotificationActions((link) => router.push(link)).then(
      (listener) => {
        dispose = listener;
      },
    );
    return () => dispose();
  }, [router]);

  const applyLifecycle = useCallback(
    async (id: string, action: "read" | "archive" | "recover") => {
      const response = await lifecycle(id, action);
      if (response.ok) await revalidateNotifications();
      return response.ok;
    },
    [],
  );

  const readAll = useCallback(async () => {
    const response = await fetch("/api/notifications/read-all", {
      method: "POST",
    });
    if (response.ok) await revalidateNotifications();
    return response.ok;
  }, []);

  return {
    notifications,
    unreadCount,
    preference: data?.preference ?? null,
    error,
    mutate,
    applyLifecycle,
    readAll,
  };
}

/**
 * Pure, non-polling notification query for workspace filter views.
 *
 * Shares the SWR cache (and, for the default `active` view, the exact live
 * query key) with the topbar authority, so switching filters never starts a
 * second network cadence: freshness comes from the live poll, the sidecar
 * socket bridge and lifecycle revalidation.
 */
export function useNotificationFeed(state: NotificationFeedState) {
  const key = `${NOTIFICATIONS_SWR_PREFIX}?state=${state}&limit=${NOTIFICATION_PAGE_LIMIT}`;
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<NotificationCenterResponse>(key, notificationsFetcher, {
      revalidateOnFocus: true,
      dedupingInterval: 1_000,
      keepPreviousData: true,
    });
  const dismissed = useDismissedOperational();
  const allNotifications = data?.notifications;
  const notifications = useMemo(
    () => (allNotifications ?? []).filter((item) => !isHidden(item, dismissed)),
    [allNotifications, dismissed],
  );
  const hiddenUnread = (allNotifications ?? []).filter(
    (item) => !item.read && isHidden(item, dismissed),
  ).length;

  return {
    key,
    notifications,
    unreadCount: Math.max(0, (data?.unreadCount ?? 0) - hiddenUnread),
    preference: data?.preference ?? null,
    nextCursor: data?.nextCursor ?? null,
    error,
    isLoading,
    isValidating,
    mutate,
  };
}
