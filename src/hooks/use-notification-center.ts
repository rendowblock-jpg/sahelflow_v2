"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";

import { useWhatsAppSocket } from "@/hooks/use-whatsapp-socket";
import {
  listenForDesktopNotificationActions,
  sendDesktopNotification,
} from "@/lib/notifications/native-client";
import { createBurstGate } from "@/lib/notifications/burst";
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
  /** Which of the nine kinds this row is (null for older or computed rows). */
  kind?: string | null;
  /** Live number for the sentence, null when the sentence has none. */
  count?: number | null;
  titleKey?: string;
  bodyKey?: string;
  /** Set on the one row that speaks for everything held by quiet hours. */
  digestCount?: number | null;
  nativeTitle?: string;
  nativeBody?: string;
  /** Set by the list when neighbouring rows of one kind are folded. */
  groupCount?: number;
  groupedIds?: string[];
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
 *
 * The server keeps that memory, per member (POST /api/notifications/
 * dismissals). It used to be kept in `localStorage`, which the packaged app
 * loses at every launch: the desktop serves itself from a loopback port chosen
 * at random each time, and `localStorage` belongs to one origin including its
 * port, so every cleared alert came back after SahelFlow was reopened. What
 * stays in the browser is only an in-memory overlay that hides an alert the
 * moment it is cleared, before the server has answered.
 */
type DismissedMap = Record<string, string>;
const DISMISSALS_ENDPOINT = `${NOTIFICATIONS_SWR_PREFIX}/dismissals`;
const dismissedListeners = new Set<() => void>();
let dismissedCache: DismissedMap = {};
const EMPTY_DISMISSED: DismissedMap = {};

function readDismissed(): DismissedMap {
  return dismissedCache;
}

function writeDismissed(next: DismissedMap) {
  dismissedCache = next;
  for (const listener of dismissedListeners) listener();
}

function subscribeDismissed(listener: () => void) {
  dismissedListeners.add(listener);
  return () => dismissedListeners.delete(listener);
}

function operationalFingerprint(notification: NotificationCenterItem): string {
  return `${notification.title}\u0000${notification.body}`;
}

/** The dismissal overlay, shared by the bell and the notifications workspace. */
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

function hideNow(items: readonly NotificationCenterItem[]) {
  const next = { ...readDismissed() };
  for (const item of items) next[item.id] = operationalFingerprint(item);
  writeDismissed(next);
}

function showAgain(ids: readonly string[]) {
  const next = { ...readDismissed() };
  for (const id of ids) delete next[id];
  writeDismissed(next);
}

async function postDismissals(body: unknown): Promise<boolean> {
  try {
    const response = await fetch(DISMISSALS_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Remove several notifications from the center in one go. Computed alerts are
 * sent to the server as ONE request (they share one stored entry per member,
 * so separate parallel requests could overwrite each other); durable rows are
 * archived individually. Returns how many were removed and an `undo` that
 * brings those back.
 */
export async function dismissNotifications(
  items: readonly NotificationCenterItem[],
): Promise<{ dismissed: number; undo: () => Promise<void> }> {
  const durable = items.filter((item) => item.durable);
  const computed = items.filter((item) => !item.durable);
  if (computed.length > 0) hideNow(computed);

  const [archived, computedSaved] = await Promise.all([
    Promise.all(
      durable.map(async (item) => {
        const response = await lifecycle(item.id, "archive").catch(() => null);
        return { item, ok: response?.ok === true };
      }),
    ),
    computed.length > 0
      ? postDismissals({
          action: "dismiss",
          items: computed.map(({ id, title, body }) => ({ id, title, body })),
        })
      : Promise.resolve(true),
  ]);
  const durableDone = archived.filter((entry) => entry.ok).map((entry) => entry.item);
  const computedDone = computedSaved ? computed : [];
  // The server did not keep it, so do not pretend it is gone.
  if (!computedSaved) showAgain(computed.map((item) => item.id));
  await revalidateNotifications();

  return {
    dismissed: durableDone.length + computedDone.length,
    undo: async () => {
      if (
        computedDone.length > 0 &&
        (await postDismissals({
          action: "restore",
          ids: computedDone.map((item) => item.id),
        }))
      ) {
        showAgain(computedDone.map((item) => item.id));
      }
      await Promise.all(
        durableDone.map((item) => lifecycle(item.id, "recover").catch(() => null)),
      );
      await revalidateNotifications();
    },
  };
}

/**
 * Remove one notification from the center. Returns an `undo` that restores it
 * (server recover for durable rows, server restore for computed alerts).
 */
export async function dismissNotification(
  notification: NotificationCenterItem,
): Promise<{ ok: boolean; undo: () => Promise<void> }> {
  const { dismissed, undo } = await dismissNotifications([notification]);
  return { ok: dismissed === 1, undo };
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
/** One toast per kind per 90 s, however many rows a poll brings. */
const nativeBurstGate = createBurstGate();

/**
 * "Mark all read": the stored rows are marked read on the server, and the
 * computed alerts (which have no read state) are dismissed the same way a
 * single dismissal is, so the bell really goes to zero.
 */
export async function markEverythingRead(items: readonly NotificationCenterItem[]): Promise<boolean> {
  const response = await fetch("/api/notifications/read-all", { method: "POST" });
  if (!response.ok) return false;
  const computed = items.filter((item) => !item.durable);
  if (computed.length > 0) await dismissNotifications(computed);
  return true;
}

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
        const digest = typeof notification.digestCount === "number";
        if (!nativeBurstGate.take(digest ? "digest" : (notification.kind ?? "other"), Date.now())) {
          await completeNative(notification.id, "suppressed", "burst");
          return;
        }
        const result = await sendDesktopNotification({
          title: digest ? (notification.nativeTitle ?? notification.title) : (claim.preview?.contactName ?? notification.title),
          body: digest ? (notification.nativeBody ?? notification.body) : (claim.preview?.body ?? notification.body),
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
    const ok = await markEverythingRead(notifications);
    if (ok) await revalidateNotifications();
    return ok;
  }, [notifications]);

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
