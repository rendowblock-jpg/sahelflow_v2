"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useWhatsAppSocket } from "@/hooks/use-whatsapp-socket";
import {
  listenForDesktopNotificationActions,
  sendDesktopNotification,
} from "@/lib/notifications/native-client";

const RECOVERY_POLL_MS = 3_000;

export interface NotificationCenterItem {
  id: string;
  type: "info";
  category: "inbox";
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

async function lifecycle(id: string, action: "read" | "archive" | "recover") {
  return fetch(`/api/notifications/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

export function useNotificationCenter() {
  const router = useRouter();
  const [state, setState] = useState<NotificationCenterResponse>({
    notifications: [],
    unreadCount: 0,
    nextCursor: null,
    preference: {
      inboxEnabled: true,
      nativeEnabled: false,
      soundEnabled: false,
      previewEnabled: false,
      quietStartMinute: null,
      quietEndMinute: null,
      mutedUntil: null,
      retentionDays: 90,
    },
  });
  const loadingRef = useRef(false);
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
        body: JSON.stringify({ action: "complete", state: deliveryState, reasonCode }),
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

  const reload = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      await fetch("/api/notifications/sync", { method: "POST" });
      const response = await fetch("/api/notifications?limit=12&state=active", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as NotificationCenterResponse;
      setState(payload);
      for (const notification of payload.notifications) {
        if (notification.nativePending) void deliverNative(notification);
      }
    } finally {
      loadingRef.current = false;
    }
  }, [deliverNative]);

  // The sidecar push is the live signal; the durable API remains authority.
  useWhatsAppSocket({
    onMessage: (message) => {
      if (!message.key.fromMe) window.setTimeout(() => void reload(), 250);
    },
  });

  useEffect(() => {
    const initial = window.setTimeout(() => void reload(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, RECOVERY_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [reload]);

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
      if (response.ok) await reload();
      return response.ok;
    },
    [reload],
  );

  const readAll = useCallback(async () => {
    const response = await fetch("/api/notifications/read-all", { method: "POST" });
    if (response.ok) await reload();
    return response.ok;
  }, [reload]);

  return { ...state, reload, applyLifecycle, readAll };
}
