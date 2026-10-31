"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { installWhatsAppSendRecovery } from "@/lib/whatsapp/install-send-recovery";
import { getWhatsAppWsConnection } from "@/lib/whatsapp/ws-url";
import type {
  IncomingMessage,
  SidecarEvent,
  WhatsAppStatus,
  WhatsAppUser,
} from "@/lib/whatsapp/types";

installWhatsAppSendRecovery();

interface UseWhatsAppSocketOptions {
  onStatusChange?: (status: WhatsAppStatus, user: WhatsAppUser | null) => void;
  onMessage?: (message: IncomingMessage) => void;
  onMessageUpdate?: (
    updates: Array<{
      jid: string;
      id: string;
      fromMe: boolean;
      update: Record<string, unknown>;
    }>,
  ) => void;
}

interface UseWhatsAppSocketResult {
  status: WhatsAppStatus | null;
  user: WhatsAppUser | null;
  wsOpen: boolean;
  reconnect: () => void;
}

const MESSAGE_DEDUP_WINDOW_MS = 10 * 60_000;
const MAX_RECENT_MESSAGE_KEYS = 1_000;

// PB-WS-TOKEN-QUIET: "no helper" (new seller, helper restarting) is a normal
// state, so a missed token must not become a retry storm on a slow machine.
// Waits are 2 s, 4 s, 8 s ... capped at one minute, plus up to 20% jitter so
// several tabs do not retry in step.
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;
const RECONNECT_JITTER = 0.2;

function tabHidden(): boolean {
  return document.visibilityState === "hidden";
}

export function useWhatsAppSocket(
  options: UseWhatsAppSocketOptions = {},
): UseWhatsAppSocketResult {
  const { onStatusChange, onMessage, onMessageUpdate } = options;
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [user, setUser] = useState<WhatsAppUser | null>(null);
  const [wsOpen, setWsOpen] = useState(false);
  const [retryCounter, setRetryCounter] = useState(0);

  const onStatusChangeRef = useRef(onStatusChange);
  const onMessageRef = useRef(onMessage);
  const onMessageUpdateRef = useRef(onMessageUpdate);
  const recentMessageKeysRef = useRef(new Map<string, number>());
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);
  useEffect(() => {
    onMessageUpdateRef.current = onMessageUpdate;
  }, [onMessageUpdate]);

  const reconnectAttempt = useRef(0);
  const reconnect = useCallback(() => {
    reconnectAttempt.current = 0;
    setRetryCounter((count) => count + 1);
  }, []);

  useEffect(() => {
    let activeSocket: WebSocket | null = null;
    let renewalTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    // S09b-04: a renewal that fell due while the tab was hidden. The grant is
    // 30 s and the sidecar closes the socket when it ends, so a hidden tab
    // lets it end (no token request, no new socket) and the visibility handler
    // renews at once if the old socket still lives, or reconnects if not.
    let renewalDeferred = false;
    let lastAttemptAt = Number.NEGATIVE_INFINITY;
    const maxReconnectAttempts = 20;

    const clearRenewal = () => {
      if (renewalTimer) clearTimeout(renewalTimer);
      renewalTimer = null;
    };

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) return;
      // A hidden tab makes no requests; the visibility handler restarts us.
      if (tabHidden()) return;
      if (reconnectAttempt.current >= maxReconnectAttempts) {
        setStatus("disconnected");
        return;
      }
      const base = Math.min(
        RECONNECT_BASE_MS * 2 ** reconnectAttempt.current,
        RECONNECT_MAX_MS,
      );
      const delay = base + base * RECONNECT_JITTER * Math.random();
      reconnectAttempt.current += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void open(false);
      }, delay);
    };

    const scheduleRenewalRetry = () => {
      if (closed || renewalTimer) return;
      renewalTimer = setTimeout(() => {
        renewalTimer = null;
        void open(true);
      }, 1000);
    };

    const scheduleRenewal = (expiresAt: number) => {
      clearRenewal();
      const delay = Math.max(1000, expiresAt - Date.now() - 5000);
      renewalTimer = setTimeout(() => {
        renewalTimer = null;
        void open(true);
      }, delay);
    };

    const deliverMessageOnce = (message: IncomingMessage) => {
      const messageKey = `${message.key.remoteJid}\0${message.key.id}`;
      const now = Date.now();
      const recent = recentMessageKeysRef.current;
      const previous = recent.get(messageKey);
      if (previous !== undefined && now - previous <= MESSAGE_DEDUP_WINDOW_MS) {
        return;
      }
      recent.set(messageKey, now);
      if (recent.size > MAX_RECENT_MESSAGE_KEYS) {
        for (const [key, seenAt] of recent) {
          if (now - seenAt > MESSAGE_DEDUP_WINDOW_MS) recent.delete(key);
          if (recent.size <= MAX_RECENT_MESSAGE_KEYS) break;
        }
        while (recent.size > MAX_RECENT_MESSAGE_KEYS) {
          const oldest = recent.keys().next().value as string | undefined;
          if (!oldest) break;
          recent.delete(oldest);
        }
      }
      onMessageRef.current?.(message);
    };

    const handleFrame = (socket: WebSocket, event: MessageEvent) => {
      if (activeSocket !== socket) return;
      try {
        const data = JSON.parse(event.data as string) as SidecarEvent;
        if (data.type === "status" && data.status) {
          setStatus(data.status);
          setUser(data.user ?? null);
          onStatusChangeRef.current?.(data.status, data.user ?? null);
        } else if (data.type === "qr") {
          setStatus("qr");
          onStatusChangeRef.current?.("qr", null);
        } else if (data.type === "message" && data.message) {
          deliverMessageOnce(data.message);
        } else if (data.type === "message-update" && data.updates) {
          onMessageUpdateRef.current?.(data.updates);
        }
      } catch {
        // Ignore malformed push frames.
      }
    };

    const open = async (renewing: boolean) => {
      if (closed) return;
      if (tabHidden()) {
        if (renewing) renewalDeferred = true;
        return;
      }
      lastAttemptAt = Date.now();
      const connection = await getWhatsAppWsConnection();
      if (closed) return;
      if (!connection) {
        if (renewing && activeSocket) scheduleRenewalRetry();
        else scheduleReconnect();
        return;
      }

      let candidate: WebSocket;
      try {
        candidate = new WebSocket(connection.url);
      } catch {
        if (renewing && activeSocket) scheduleRenewalRetry();
        else scheduleReconnect();
        return;
      }

      let opened = false;
      candidate.onopen = () => {
        if (closed) {
          candidate.close();
          return;
        }
        opened = true;
        const previous = activeSocket;
        activeSocket = candidate;
        setWsOpen(true);
        reconnectAttempt.current = 0;
        scheduleRenewal(connection.expiresAt);
        if (previous && previous !== candidate) {
          previous.onclose = null;
          previous.onerror = null;
          previous.onmessage = null;
          try {
            previous.close(1000, "WebSocket grant renewed");
          } catch {
            // Ignore a close race after the replacement is already active.
          }
        }
      };
      candidate.onmessage = (event) => handleFrame(candidate, event);
      candidate.onclose = () => {
        if (activeSocket === candidate) {
          activeSocket = null;
          renewalDeferred = false;
          clearRenewal();
          setWsOpen(false);
          scheduleReconnect();
        } else if (!opened) {
          if (activeSocket) scheduleRenewalRetry();
          else scheduleReconnect();
        }
      };
      candidate.onerror = () => {
        try {
          candidate.close();
        } catch {
          // Ignore close races.
        }
      };
    };

    // C1 resilience: the reconnect budget exists to stop a tight failure loop
    // while the machine sleeps or the network is down. Once the user RETURNS
    // to the app the old budget must not keep the inbox push dead (it never
    // self-recovered before). Give the socket a fresh budget whenever the
    // document becomes visible or the window regains focus without an open
    // transport.
    const recoverOnVisibility = () => {
      if (closed) return;
      if (document.visibilityState !== "visible") return;
      if (
        renewalDeferred &&
        activeSocket &&
        activeSocket.readyState === WebSocket.OPEN
      ) {
        renewalDeferred = false;
        clearRenewal();
        void open(true);
        return;
      }
      if (
        activeSocket &&
        (activeSocket.readyState === WebSocket.OPEN ||
          activeSocket.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }
      // Focus and visibility often fire together; one try per base wait.
      if (Date.now() - lastAttemptAt < RECONNECT_BASE_MS) return;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      reconnectAttempt.current = 0;
      void open(false);
    };
    document.addEventListener("visibilitychange", recoverOnVisibility);
    window.addEventListener("focus", recoverOnVisibility);

    void open(false);
    return () => {
      closed = true;
      clearRenewal();
      document.removeEventListener("visibilitychange", recoverOnVisibility);
      window.removeEventListener("focus", recoverOnVisibility);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        activeSocket?.close();
      } catch {
        // Ignore cleanup races.
      }
    };
  }, [retryCounter]);

  return { status, user, wsOpen, reconnect };
}
