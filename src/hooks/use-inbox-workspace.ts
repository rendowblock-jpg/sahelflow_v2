"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  InboxChat,
  InboxMessage,
  InboxQueueFilter,
  InboxTransportState,
} from "@/components/inbox/inbox-workspace-types";
import type { ConversationWorkflowState } from "@/components/inbox/conversation-controls";
import { useI18n } from "@/hooks/use-i18n";
import { getInboxWorkspaceCopy } from "@/lib/i18n/inbox-workspace";
import { toast } from "@/lib/toast";
import {
  messageText,
  type IncomingMessage,
  type WhatsAppStatus,
  type WhatsAppUser,
} from "@/lib/whatsapp/types";
import { useWhatsAppSocket } from "@/hooks/use-whatsapp-socket";

const CHAT_REFRESH_COALESCE_MS = 500;

interface CanonicalChatResponse {
  chats: Array<{
    jid: string;
    conversationId: string;
    name: string;
    phone: string | null;
    unread: number;
    lastMessage?: { text: string; timestamp: number; fromMe: boolean };
    workflow: {
      status: string;
      assigneeId: string | null;
      assignmentVersion: number;
      priority: string | null;
      labels: string[];
      snoozedUntil: string | null;
      waitingSince: string | null;
      firstReplyAt: string | null;
    };
  }>;
  sidecarReachable: boolean;
  sidecarStatus: string | null;
  authority?: { allowedActions: string[] };
}

interface ConversationProjection {
  id: string;
  channel: string;
  contactName: string | null;
  contactPhone: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  status: string;
  assigneeId: string | null;
  priority: string | null;
  labels: string | null;
  snoozedUntil: string | null;
  waitingSince: string | null;
  firstReplyAt: string | null;
}

interface SeededMessage {
  id: string;
  body: string;
  direction: string;
  timestamp: string;
  messageType?: string;
}

function isWhatsAppStatus(value: unknown): value is WhatsAppStatus {
  return (
    value === "disconnected" ||
    value === "connecting" ||
    value === "qr" ||
    value === "connected"
  );
}

function parseLabels(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function mapDeliveryStatus(
  update: Record<string, unknown>,
): InboxMessage["deliveryStatus"] | null {
  const status = update.status;
  if (status === undefined || status === null) return null;
  const normalized =
    typeof status === "number" ? status : String(status).toUpperCase();
  if (normalized === 0 || normalized === "PENDING") return "sending";
  if (normalized === 1 || normalized === "SENT") return "sent";
  if (
    normalized === 2 ||
    normalized === "DELIVERY" ||
    normalized === "DELIVERED"
  ) {
    return "delivered";
  }
  if (normalized === 3 || normalized === "READ") return "read";
  return null;
}

export function useInboxWorkspace() {
  const { t, locale } = useI18n();
  const copy = useCallback(
    (key: Parameters<typeof getInboxWorkspaceCopy>[1], params?: Record<string, string | number>) =>
      getInboxWorkspaceCopy(locale, key, params),
    [locale],
  );

  const [chats, setChats] = useState<InboxChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [queueFilter, setQueueFilter] = useState<InboxQueueFilter>("all");
  const [allowedActions, setAllowedActions] = useState<string[]>([]);
  const [sidecarReachable, setSidecarReachable] = useState<boolean | null>(null);
  const [sidecarStatus, setSidecarStatus] = useState<WhatsAppStatus | null>(null);
  const [dataDegraded, setDataDegraded] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [qrKey, setQrKey] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesInnerRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const activeTransportIdRef = useRef<string | null>(null);
  const chatRefreshTimerRef = useRef<number | null>(null);

  const canUpdateConversation = allowedActions.includes("conversations.update");
  const canReply = allowedActions.includes("conversations.reply");
  const canManageWhatsApp = allowedActions.includes("whatsapp.connection.manage");

  const loadFallbackProjection = useCallback(async () => {
    const response = await fetch("/api/conversations", { cache: "no-store" });
    if (!response.ok) throw new Error(`Conversation projection failed: ${response.status}`);
    const data = (await response.json()) as {
      conversations: ConversationProjection[];
      authority?: { allowedActions: string[] };
    };
    setAllowedActions(data.authority?.allowedActions ?? []);
    setChats(
      data.conversations.map((conversation) => ({
        id: conversation.id,
        conversationId: conversation.id,
        name: conversation.contactName ?? copy("restrictedContact"),
        phone: conversation.contactPhone ?? undefined,
        channel: "conversation" as const,
        lastMessageAt: conversation.lastMessageAt
          ? new Date(conversation.lastMessageAt).getTime()
          : undefined,
        unread: conversation.unreadCount,
        workflow: {
          status: conversation.status as ConversationWorkflowState["status"],
          assigneeId: conversation.assigneeId,
          priority:
            conversation.priority as ConversationWorkflowState["priority"],
          labels: parseLabels(conversation.labels),
          snoozedUntil: conversation.snoozedUntil,
          waitingSince: conversation.waitingSince,
          firstReplyAt: conversation.firstReplyAt,
        },
      })),
    );
  }, [copy]);

  const loadChats = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp/chats?limit=100", {
        cache: "no-store",
      });
      if (response.ok) {
        const data = (await response.json()) as CanonicalChatResponse;
        setAllowedActions(data.authority?.allowedActions ?? []);
        setSidecarReachable(data.sidecarReachable);
        setSidecarStatus(
          isWhatsAppStatus(data.sidecarStatus) ? data.sidecarStatus : null,
        );
        setDataDegraded(false);
        setChats(
          data.chats.map((chat) => ({
            id: chat.jid,
            conversationId: chat.conversationId,
            transportId: chat.jid,
            name: chat.name,
            phone: chat.phone ?? undefined,
            channel: "whatsapp" as const,
            lastMessageText: chat.lastMessage?.text,
            lastMessageAt: chat.lastMessage
              ? chat.lastMessage.timestamp * 1000
              : undefined,
            unread: chat.unread,
            workflow: {
              status: chat.workflow.status as ConversationWorkflowState["status"],
              assigneeId: chat.workflow.assigneeId,
              assignmentVersion: chat.workflow.assignmentVersion,
              priority:
                chat.workflow.priority as ConversationWorkflowState["priority"],
              labels: chat.workflow.labels,
              snoozedUntil: chat.workflow.snoozedUntil,
              waitingSince: chat.workflow.waitingSince,
              firstReplyAt: chat.workflow.firstReplyAt,
            },
          })),
        );
        return;
      }

      // A field-restricted actor can still read the permission-filtered generic
      // conversation projection. Do not mislabel that durable data as demo data.
      if (response.status === 401 || response.status === 403) {
        setSidecarReachable(null);
        setSidecarStatus(null);
        setDataDegraded(false);
        await loadFallbackProjection();
        return;
      }

      throw new Error(`Canonical inbox load failed: ${response.status}`);
    } catch {
      setDataDegraded(true);
      try {
        await loadFallbackProjection();
      } catch {
        setChats([]);
      }
    } finally {
      setLoadingChats(false);
    }
  }, [loadFallbackProjection]);

  const scheduleChatsRefresh = useCallback(() => {
    if (chatRefreshTimerRef.current !== null) return;
    chatRefreshTimerRef.current = window.setTimeout(() => {
      chatRefreshTimerRef.current = null;
      void loadChats();
    }, CHAT_REFRESH_COALESCE_MS);
  }, [loadChats]);

  const markRead = useCallback(
    async (chat: InboxChat) => {
      if (!canUpdateConversation || chat.unread <= 0) return;
      try {
        const response = await fetch(
          `/api/conversations/${encodeURIComponent(chat.conversationId)}/read`,
          { method: "PATCH" },
        );
        if (!response.ok) return;
        setChats((current) =>
          current.map((entry) =>
            entry.id === chat.id ? { ...entry, unread: 0 } : entry,
          ),
        );
      } catch {
        // Read state is an explicit mutation but never blocks thread access.
      }
    },
    [canUpdateConversation],
  );

  const loadMessages = useCallback(
    async (chat: InboxChat) => {
      setLoadingMessages(true);
      setSendError(null);
      try {
        if (chat.channel === "whatsapp" && chat.transportId) {
          const response = await fetch(
            `/api/whatsapp/chats/${encodeURIComponent(chat.transportId)}/messages?limit=200`,
            { cache: "no-store" },
          );
          if (response.ok) {
            const data = (await response.json()) as {
              messages: Array<IncomingMessage & { messageType?: string }>;
              sidecarReachable?: boolean;
            };
            if (typeof data.sidecarReachable === "boolean") {
              setSidecarReachable(data.sidecarReachable);
            }
            setMessages(
              data.messages.map((message) => ({
                id: message.key.id,
                body: messageText(message.message),
                direction: message.key.fromMe ? "outbound" : "inbound",
                timestamp: message.messageTimestamp * 1000,
                messageType: message.messageType,
                deliveryStatus: message.deliveryStatus,
                outboxEffectKey: message.effectKey,
                outboxState: message.effectState,
              })),
            );
            void markRead(chat);
            return;
          }
        }

        const response = await fetch(
          `/api/conversations/${encodeURIComponent(chat.conversationId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error(`Conversation load failed: ${response.status}`);
        const data = (await response.json()) as {
          conversation: { messages: SeededMessage[] };
        };
        setMessages(
          data.conversation.messages.map((message) => ({
            id: message.id,
            body: message.body,
            direction:
              message.direction === "inbound"
                ? "inbound"
                : message.direction === "system"
                  ? "system"
                  : "outbound",
            timestamp: new Date(message.timestamp).getTime(),
            messageType: message.messageType,
          })),
        );
        void markRead(chat);
      } catch {
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    },
    [markRead],
  );

  const handleStatusChange = useCallback(
    (nextStatus: WhatsAppStatus, _user: WhatsAppUser | null) => {
      setSidecarReachable(true);
      setSidecarStatus(nextStatus);
      void loadChats();
    },
    [loadChats],
  );

  const handleMessage = useCallback(
    (message: IncomingMessage) => {
      const activeTransportId = activeTransportIdRef.current;
      if (activeTransportId && activeTransportId === message.key.remoteJid) {
        setMessages((current) => {
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
            },
          ];
        });
      }
      scheduleChatsRefresh();
    },
    [scheduleChatsRefresh],
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
      if (!activeTransportId) return;
      const relevant = updates.filter(
        (update) => update.jid === activeTransportId && update.fromMe,
      );
      if (relevant.length === 0) return;
      setMessages((current) => {
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
    [],
  );

  const { status, user, wsOpen, reconnect } = useWhatsAppSocket({
    onStatusChange: handleStatusChange,
    onMessage: handleMessage,
    onMessageUpdate: handleMessageUpdate,
  });

  useEffect(() => {
    void loadChats();
    return () => {
      if (chatRefreshTimerRef.current !== null) {
        window.clearTimeout(chatRefreshTimerRef.current);
        chatRefreshTimerRef.current = null;
      }
    };
  }, [loadChats]);

  const selectChat = useCallback(
    (chat: InboxChat) => {
      activeTransportIdRef.current = chat.transportId ?? null;
      setActiveChatId(chat.id);
      setMessages([]);
      setReplyText("");
      void loadMessages(chat);
    },
    [loadMessages],
  );

  const clearActiveChat = useCallback(() => {
    activeTransportIdRef.current = null;
    setActiveChatId(null);
    setMessages([]);
    setReplyText("");
  }, []);

  useEffect(() => {
    isNearBottomRef.current = true;
    const inner = messagesInnerRef.current;
    if (!inner) return;
    const viewport = inner.closest(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLDivElement | null;
    if (!viewport) return;
    const handleScroll = () => {
      const { scrollHeight, scrollTop, clientHeight } = viewport;
      isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 150;
    };
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [activeChatId]);

  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (status !== "qr") return;
    const timer = window.setInterval(() => setQrKey((current) => current + 1), 20_000);
    return () => window.clearInterval(timer);
  }, [status]);

  const monitorWhatsAppEffect = useCallback(
    async (effectKey: string, localMessageId: string) => {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, attempt === 0 ? 1_000 : 3_000),
        );
        try {
          const response = await fetch(
            `/api/whatsapp/outbox?effectKey=${encodeURIComponent(effectKey)}`,
          );
          if (!response.ok) continue;
          const data = (await response.json()) as {
            effect: {
              state: InboxMessage["outboxState"];
              providerMessageId: string | null;
            };
          };
          const state = data.effect.state;
          if (state === "succeeded") {
            setMessages((current) =>
              current.map((message) =>
                message.id === localMessageId
                  ? {
                      ...message,
                      id: data.effect.providerMessageId ?? message.id,
                      deliveryStatus: "sent",
                      outboxState: state,
                    }
                  : message,
              ),
            );
            return;
          }
          if (state === "ambiguous" || state === "dead_letter") {
            setMessages((current) =>
              current.map((message) =>
                message.id === localMessageId
                  ? { ...message, deliveryStatus: "failed", outboxState: state }
                  : message,
              ),
            );
            setSendError(
              state === "ambiguous"
                ? t("inbox.whatsappAmbiguous")
                : t("inbox.sendFailed"),
            );
            return;
          }
          setMessages((current) =>
            current.map((message) =>
              message.id === localMessageId
                ? { ...message, outboxState: state }
                : message,
            ),
          );
        } catch {
          // The intent is durable. Polling can continue while this view is open.
        }
      }
    },
    [t],
  );

  const retryFailedMessage = useCallback(
    async (message: InboxMessage) => {
      if (!message.outboxEffectKey) return;
      const confirmMayDuplicate =
        message.outboxState === "ambiguous"
          ? window.confirm(t("inbox.whatsappAmbiguousRetryWarning"))
          : false;
      if (message.outboxState === "ambiguous" && !confirmMayDuplicate) return;

      setMessages((current) =>
        current.map((entry) =>
          entry.id === message.id ? { ...entry, deliveryStatus: "sending" } : entry,
        ),
      );
      setSendError(null);
      try {
        const response = await fetch("/api/whatsapp/outbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            effectKey: message.outboxEffectKey,
            confirmMayDuplicate,
          }),
        });
        const data = (await response.json()) as {
          effect?: {
            state: InboxMessage["outboxState"];
            providerMessageId: string | null;
          };
        };
        if (!data.effect) throw new Error(t("inbox.sendFailed"));
        if (data.effect.state === "succeeded") {
          setMessages((current) =>
            current.map((entry) =>
              entry.id === message.id
                ? {
                    ...entry,
                    id: data.effect?.providerMessageId ?? entry.id,
                    deliveryStatus: "sent",
                    outboxState: "succeeded",
                  }
                : entry,
            ),
          );
          return;
        }
        if (response.status === 202) {
          void monitorWhatsAppEffect(message.outboxEffectKey, message.id);
          return;
        }
        throw new Error(
          data.effect.state === "ambiguous"
            ? t("inbox.whatsappAmbiguous")
            : t("inbox.sendFailed"),
        );
      } catch (error) {
        setMessages((current) =>
          current.map((entry) =>
            entry.id === message.id
              ? { ...entry, deliveryStatus: "failed" }
              : entry,
          ),
        );
        setSendError(
          error instanceof Error ? error.message : t("inbox.sendFailed"),
        );
      }
    },
    [monitorWhatsAppEffect, t],
  );

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [activeChatId, chats],
  );

  const effectiveStatus = status ?? sidecarStatus;
  const transport: InboxTransportState = {
    reachable: status !== null ? true : sidecarReachable,
    status: effectiveStatus,
    user,
    wsOpen,
  };

  const sendReply = useCallback(async () => {
    const chat = chats.find((entry) => entry.id === activeChatId) ?? null;
    if (
      !chat ||
      chat.channel !== "whatsapp" ||
      !chat.transportId ||
      effectiveStatus !== "connected" ||
      !canReply ||
      !replyText.trim()
    ) {
      return;
    }

    const tempId = crypto.randomUUID();
    const body = replyText.trim();
    setReplyText("");
    setSending(true);
    setSendError(null);
    setMessages((current) => [
      ...current,
      {
        id: tempId,
        body,
        direction: "outbound",
        timestamp: Date.now(),
        deliveryStatus: "sending",
      },
    ]);

    try {
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientMessageId: tempId,
          to: chat.transportId,
          text: body,
        }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        accepted?: boolean;
        id?: string | null;
        effectKey?: string;
        state?: InboxMessage["outboxState"];
        requiresDuplicateConfirmation?: boolean;
      };
      if (response.status === 202 && data.accepted && data.effectKey) {
        setMessages((current) =>
          current.map((message) =>
            message.id === tempId
              ? {
                  ...message,
                  outboxEffectKey: data.effectKey,
                  outboxState: data.state,
                }
              : message,
          ),
        );
        void monitorWhatsAppEffect(data.effectKey, tempId);
        return;
      }
      if (!response.ok || !data.ok) {
        setMessages((current) =>
          current.map((message) =>
            message.id === tempId
              ? {
                  ...message,
                  deliveryStatus: "failed",
                  outboxEffectKey: data.effectKey,
                  outboxState: data.state,
                }
              : message,
          ),
        );
        throw new Error(
          data.requiresDuplicateConfirmation
            ? t("inbox.whatsappAmbiguous")
            : t("inbox.sendFailed"),
        );
      }
      setMessages((current) =>
        current.map((message) =>
          message.id === tempId
            ? {
                ...message,
                deliveryStatus: "sent",
                outboxEffectKey: data.effectKey,
                outboxState: "succeeded",
                ...(data.id ? { id: data.id } : {}),
              }
            : message,
        ),
      );
      void loadChats();
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === tempId
            ? { ...message, deliveryStatus: "failed" }
            : message,
        ),
      );
      setSendError(
        error instanceof Error ? error.message : t("inbox.sendFailed"),
      );
    } finally {
      setSending(false);
    }
  }, [
    activeChatId,
    canReply,
    chats,
    effectiveStatus,
    loadChats,
    monitorWhatsAppEffect,
    replyText,
    t,
  ]);

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

  const filteredChats = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return chats.filter((chat) => {
      const statusValue = chat.workflow.status ?? "open";
      const queueMatches =
        queueFilter === "all" ||
        (queueFilter === "unread" && chat.unread > 0) ||
        (queueFilter === "open" && statusValue === "open") ||
        (queueFilter === "pending" && statusValue === "pending") ||
        (queueFilter === "resolved" && statusValue === "resolved");
      if (!queueMatches) return false;
      if (!query) return true;
      return [chat.name, chat.phone, chat.lastMessageText]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(query));
    });
  }, [chats, queueFilter, searchQuery]);

  const queueCounts = useMemo(
    () => ({
      all: chats.length,
      unread: chats.filter((chat) => chat.unread > 0).length,
      open: chats.filter((chat) => (chat.workflow.status ?? "open") === "open").length,
      pending: chats.filter((chat) => chat.workflow.status === "pending").length,
      resolved: chats.filter((chat) => chat.workflow.status === "resolved").length,
    }),
    [chats],
  );

  return {
    t,
    locale,
    copy,
    chats,
    filteredChats,
    queueCounts,
    queueFilter,
    setQueueFilter,
    searchQuery,
    setSearchQuery,
    loadingChats,
    activeChat,
    activeChatId,
    selectChat,
    clearActiveChat,
    messages,
    loadingMessages,
    messagesInnerRef,
    messagesEndRef,
    replyText,
    setReplyText,
    sending,
    sendError,
    sendReply,
    retryFailedMessage,
    canUpdateConversation,
    canReply,
    canManageWhatsApp,
    transport,
    dataDegraded,
    refreshChats: loadChats,
    reconnect,
    connectWhatsApp,
    logoutConfirmOpen,
    setLogoutConfirmOpen,
    disconnectWhatsApp,
    qrKey,
    refreshQr: () => setQrKey((current) => current + 1),
  };
}
