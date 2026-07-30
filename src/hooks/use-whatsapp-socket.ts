"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { installWhatsAppSendRecovery } from "@/lib/whatsapp/install-send-recovery";
import { getWhatsAppWsUrlWithToken } from "@/lib/whatsapp/ws-url";
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
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    const maxReconnectAttempts = 20;

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) return;
      if (reconnectAttempt.current >= maxReconnectAttempts) {
        setStatus("disconnected");
        return;
      }
      const delay = Math.min(1000 * 2 ** reconnectAttempt.current, 15_000);
      reconnectAttempt.current += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        open();
      }, delay);
    };

    const open = () => {
      if (closed) return;
      void getWhatsAppWsUrlWithToken().then((url) => {
        if (closed || !url) {
          if (!closed) scheduleReconnect();
          return;
        }
        try {
          ws = new WebSocket(url);
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
            if (data.type === "status" && data.status) {
              setStatus(data.status);
              setUser(data.user ?? null);
              onStatusChangeRef.current?.(data.status, data.user ?? null);
            } else if (data.type === "qr") {
              setStatus("qr");
              onStatusChangeRef.current?.("qr", null);
            } else if (data.type === "message" && data.message) {
              onMessageRef.current?.(data.message);
            } else if (data.type === "message-update" && data.updates) {
              onMessageUpdateRef.current?.(data.updates);
            }
          } catch {
            // Ignore malformed push frames.
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
            // Ignore close races.
          }
        };
      });
    };

    open();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        // Ignore cleanup races.
      }
    };
  }, [retryCounter]);

  return { status, user, wsOpen, reconnect };
}