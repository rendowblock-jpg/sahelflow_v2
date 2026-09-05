"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  InboxChat,
  InboxMessage,
  InboxTransportState,
} from "@/components/inbox/inbox-workspace-types";
import { toast } from "@/lib/toast";
import {
  LIVE_RECOVERY_POLL_MS,
  mapDeliveryStatus,
} from "./inbox-workspace-shared";
import type { InboxSharedRefs } from "./use-inbox-shared-refs";
import {
  // The sidecar text frame carries the already-projected message body.
  messageText,
  type IncomingMessage,
  type WhatsAppStatus,
  type WhatsAppUser,
} from "@/lib/whatsapp/types";

/**
 * INB-27 — transport concern of the Inbox workspace.
 *
 * Two composition halves, one file: `useInboxTransportHandlers` builds the
 * socket event handlers (sidecar status, live inbound projection, delivery
 * status updates) and `useInboxTransportRuntime` owns everything that needs
 * the socket result plus the finished outbox state — the bounded live
 * recovery poll, QR refresh, connect/logout actions and the transport view
 * object.
 */
export interface UseInboxTransportHandlersParams {
  refs: Pick<InboxSharedRefs, "activeChatRef" | "activeTransportIdRef">;
  setSidecarReachable: (reachable: boolean | null) => void;
  setSidecarStatus: (status: WhatsAppStatus | null) => void;
  loadChats: () => Promise<void>;
  scheduleChatsRefresh: () => void;
  mutateMessages: (
    conversationId: string,
    mutation: (current: InboxMessage[]) => InboxMessage[],
  ) => void;
  loadMessages: (
    chat: InboxChat,
    options?: { background?: boolean },
  ) => Promise<void>;
}

export function useInboxTransportHandlers({
  refs,
  setSidecarReachable,
  setSidecarStatus,
  loadChats,
  scheduleChatsRefresh,
  mutateMessages,
  loadMessages,
}: UseInboxTransportHandlersParams) {
  const { activeChatRef, activeTransportIdRef } = refs;

  const handleStatusChange = useCallback(
    (nextStatus: WhatsAppStatus, _user: WhatsAppUser | null) => {
      setSidecarReachable(true);
      setSidecarStatus(nextStatus);
      void loadChats();
    },
    [loadChats, setSidecarReachable, setSidecarStatus],
  );

  const handleMessage = useCallback(
    (message: IncomingMessage) => {
      const activeTransportId = activeTransportIdRef.current;
      const activeChat = activeChatRef.current;
      const activeConversationId = activeChat?.conversationId;
      if (
        activeChat &&
        activeConversationId &&
        activeTransportId &&
        activeTransportId === message.key.remoteJid
      ) {
        mutateMessages(activeConversationId, (current) => {
          if (current.some((entry) => entry.id === message.key.id)) return current;
          return [
            ...current,
            {
              id: message.key.id,
              body: messageText(message.message),
              direction: message.key.fromMe ? "outbound" : "inbound",
              timestamp: message.messageTimestamp * 1000,
              deliveryStatus: message.deliveryStatus,
              outboxEffectKey: message.effectKey,
              outboxState: message.effectState,
              outboxErrorCode: message.effectErrorCode ?? null,
            },
          ];
        });
        void loadMessages(activeChat, { background: true });
      }
      scheduleChatsRefresh();
    },
    [activeChatRef, activeTransportIdRef, loadMessages, mutateMessages, scheduleChatsRefresh],
  );

  const handleMessageUpdate = useCallback(
    (
      updates: Array<{
        jid: string;
        id: string;
        fromMe: boolean;
        update: Record<string, unknown>;
      }>,
    ) => {
      const activeTransportId = activeTransportIdRef.current;
      const activeConversationId = activeChatRef.current?.conversationId;
      if (!activeTransportId || !activeConversationId) return;
      const relevant = updates.filter(
        (update) => update.jid === activeTransportId && update.fromMe,
      );
      if (relevant.length === 0) return;
      mutateMessages(activeConversationId, (current) => {
        let changed = false;
        const next = current.map((message) => {
          const update = relevant.find((entry) => entry.id === message.id);
          if (!update) return message;
          const deliveryStatus = mapDeliveryStatus(update.update);
          if (!deliveryStatus || deliveryStatus === message.deliveryStatus) {
            return message;
          }
          changed = true;
          return { ...message, deliveryStatus };
        });
        return changed ? next : current;
      });
    },
    [activeChatRef, activeTransportIdRef, mutateMessages],
  );

  return { handleStatusChange, handleMessage, handleMessageUpdate };
}

export interface UseInboxTransportRuntimeParams {
  refs: Pick<InboxSharedRefs, "activeChatRef" | "sendingRef">;
  status: WhatsAppStatus | null;
  user: WhatsAppUser | null;
  wsOpen: boolean;
  reconnect: () => void;
  sidecarReachable: boolean | null;
  sidecarStatus: WhatsAppStatus | null;
  effectiveStatus: WhatsAppStatus | null;
  sending: boolean;
  loadChats: () => Promise<void>;
  loadMessages: (
    chat: InboxChat,
    options?: { background?: boolean },
  ) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function useInboxTransportRuntime({
  refs,
  status,
  user,
  wsOpen,
  reconnect,
  sidecarReachable,
  sidecarStatus,
  effectiveStatus,
  sending,
  loadChats,
  loadMessages,
  t,
}: UseInboxTransportRuntimeParams) {
  const { activeChatRef, sendingRef } = refs;

  const [qrKey, setQrKey] = useState(0);

  useEffect(() => {
    if (status !== "qr") return;
    const timer = window.setInterval(() => setQrKey((current) => current + 1), 20_000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (
      wsOpen ||
      sidecarReachable !== true ||
      sidecarStatus !== "connected" ||
      sending
    ) {
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const refreshDurableProjection = async () => {
      if (
        cancelled ||
        inFlight ||
        sendingRef.current ||
        document.visibilityState !== "visible"
      ) {
        return;
      }
      inFlight = true;
      try {
        await loadChats();
        if (cancelled || sendingRef.current) return;
        const chat = activeChatRef.current;
        if (chat) await loadMessages(chat, { background: true });
      } finally {
        inFlight = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshDurableProjection();
    }, LIVE_RECOVERY_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeChatRef, loadChats, loadMessages, sending, sidecarReachable, sidecarStatus, sendingRef, wsOpen]);

  const connectWhatsApp = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp/connect", { method: "POST" });
      if (!response.ok) throw new Error(`WhatsApp connect failed: ${response.status}`);
      reconnect();
      return true;
    } catch {
      toast.error(t("common.error"));
      return false;
    }
  }, [reconnect, t]);

  const disconnectWhatsApp = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp/logout", { method: "DELETE" });
      if (!response.ok) throw new Error(`WhatsApp logout failed: ${response.status}`);
      reconnect();
      void loadChats();
    } catch {
      toast.error(t("common.error"));
    }
  }, [loadChats, reconnect, t]);

  const transport: InboxTransportState = {
    reachable: status !== null ? true : sidecarReachable,
    status: effectiveStatus,
    user,
    wsOpen,
  };

  return {
    qrKey,
    refreshQr: () => setQrKey((current) => current + 1),
    connectWhatsApp,
    disconnectWhatsApp,
    transport,
  };
}
