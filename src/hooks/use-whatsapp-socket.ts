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
    let activeSocket: WebSocket | null = null;
    let renewalTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    const maxReconnectAttempts = 20;

    const clearRenewal = () => {
      if (renewalTimer) clearTimeout(renewalTimer);
      renewalTimer = null;
    };

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
          onMessageRef.current?.(data.message);
        } else if (data.type === "message-update" && data.updates) {
          onMessageUpdateRef.current?.(data.updates);
        }
      } catch {
        // Ignore malformed push frames.
      }
    };

    const open = async (renewing: boolean) => {
      if (closed) return;
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

    void open(false);
    return () => {
      closed = true;
      clearRenewal();
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
