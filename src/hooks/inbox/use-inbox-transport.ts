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
  OPEN_SOCKET_POLL_MS,
  recoveryPollDelayMs,
  STATUS_RECOVERY_POLL_MS,
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
    if (sending) return;

    // While the push channel is open the chat list and the open thread are
    // still re-read slowly, because the push has no replay and no heartbeat: a
    // frame it drops would otherwise show only after a reload.
    //
    // While the push channel is down, the durable projection is the only way
    // the Inbox learns anything, including that WhatsApp came back. A
    // connected account refreshes the chats and the open thread at the live
    // cadence. Any other state still refreshes the status, more slowly, so a
    // reconnect after sleep re-enables Send without a manual refresh (the
    // former "only while connected" gate could never observe the return).
    const liveCadence =
      sidecarReachable === true && sidecarStatus === "connected";
    const baseDelayMs = liveCadence
      ? LIVE_RECOVERY_POLL_MS
      : STATUS_RECOVERY_POLL_MS;
    let cancelled = false;
    let inFlight = false;
    // Refreshes done since the channel went down or the tab last became
    // visible. It only grows while the tab is visible and a refresh really
    // ran, and it drives the back-off in recoveryPollDelayMs.
    let completedCycles = 0;
    let timerId: number | undefined;
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
      completedCycles += 1;
      try {
        await loadChats();
        if (cancelled || sendingRef.current) return;
        // With the push channel down and WhatsApp not connected only the
        // status matters; the thread refreshes once WhatsApp is connected
        // again. An open channel re-reads the thread whatever the status says,
        // like the chat list above.
        if (!wsOpen && !liveCadence) return;
        const chat = activeChatRef.current;
        if (chat) await loadMessages(chat, { background: true });
      } finally {
        inFlight = false;
      }
    };

    // One timer at a time: each refresh schedules the next with a delay that
    // grows while the channel stays down.
    const scheduleNext = () => {
      if (cancelled) return;
      window.clearTimeout(timerId);
      // An open socket keeps a flat slow cadence; a closed one backs off.
      const delayMs = wsOpen
        ? OPEN_SOCKET_POLL_MS
        : recoveryPollDelayMs(baseDelayMs, completedCycles);
      timerId = window.setTimeout(() => {
        void refreshDurableProjection().finally(scheduleNext);
      }, delayMs);
    };
    // A seller returning to the tab gets a refresh now, at the full rate,
    // instead of waiting out a backed-off delay.
    const onVisibilityChange = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      completedCycles = 0;
      window.clearTimeout(timerId);
      void refreshDurableProjection().finally(scheduleNext);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    scheduleNext();
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
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
