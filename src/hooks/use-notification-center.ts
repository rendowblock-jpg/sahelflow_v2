"use client";

import { useCallback, useEffect, useRef } from "react";
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
const NOTIFICATION_POLL_MS = 3_000;
const NOTIFICATIONS_SWR_PREFIX = "/api/notifications";
const NOTIFICATION_PAGE_LIMIT = 20;
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

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

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

  return {
    key,
    notifications: data?.notifications ?? [],
    unreadCount: data?.unreadCount ?? 0,
    preference: data?.preference ?? null,
    nextCursor: data?.nextCursor ?? null,
    error,
    isLoading,
    isValidating,
    mutate,
  };
}
