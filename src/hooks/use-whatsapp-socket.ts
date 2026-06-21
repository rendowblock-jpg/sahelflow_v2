"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getWhatsAppWsUrl } from "@/lib/whatsapp/ws-url";
import type { SidecarEvent, WhatsAppStatus, WhatsAppUser, IncomingMessage } from "@/lib/whatsapp/types";

interface UseWhatsAppSocketOptions {
  /** Fired when a 'status' event arrives (connection state change). */
  onStatusChange?: (status: WhatsAppStatus, user: WhatsAppUser | null) => void;
  /** Fired when a new incoming message arrives. */
  onMessage?: (message: IncomingMessage) => void;
}

interface UseWhatsAppSocketResult {
  /** Current connection status (latest 'status' event), or null before first event. */
  status: WhatsAppStatus | null;
  user: WhatsAppUser | null;
  /** Whether the WS transport itself is open. */
  wsOpen: boolean;
  /** Manually reconnect (e.g. after the user clicks "retry"). */
  reconnect: () => void;
}

/**
 * Subscribe to the WhatsApp sidecar's WebSocket event stream.
 *
 * Auto-reconnects with backoff. The server is push-only (we never send frames).
 * State updates flow through the `onStatusChange` / `onMessage` callbacks so
 * callers can update their own state in event handlers (not effects).
 *
 * The latest callbacks are held in refs so callers don't need to memoize them
 * and won't suffer stale closures.
 */
export function useWhatsAppSocket(
  options: UseWhatsAppSocketOptions = {},
): UseWhatsAppSocketResult {
  const { onStatusChange, onMessage } = options;

  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [user, setUser] = useState<WhatsAppUser | null>(null);
  const [wsOpen, setWsOpen] = useState(false);
  const [retryCounter, setRetryCounter] = useState(0);

  // Latest callbacks in refs (avoid stale closures + avoid re-subscribing)
  const onStatusChangeRef = useRef(onStatusChange);
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const reconnectAttempt = useRef(0);

  const reconnect = useCallback(() => {
    reconnectAttempt.current = 0;
    setRetryCounter((c) => c + 1);
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) return;
      const delay = Math.min(1000 * 2 ** reconnectAttempt.current, 15000);
      reconnectAttempt.current += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        open();
      }, delay);
    };

    const open = () => {
      if (closed) return;
      try {
        ws = new WebSocket(getWhatsAppWsUrl());
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        setWsOpen(true);
        reconnectAttempt.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as SidecarEvent;
          if (data.type === "status") {
            if (data.status) {
              setStatus(data.status);
              setUser(data.user ?? null);
              onStatusChangeRef.current?.(data.status, data.user ?? null);
            }
          } else if (data.type === "qr") {
            setStatus("qr");
            onStatusChangeRef.current?.("qr", null);
          } else if (data.type === "message" && data.message) {
            onMessageRef.current?.(data.message);
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onclose = () => {
        setWsOpen(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };
    };

    open();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, [retryCounter]);

  return { status, user, wsOpen, reconnect };
}
