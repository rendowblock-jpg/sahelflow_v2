"use client";

import { useSearchParams } from "next/navigation";
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
import {
  mergeInboxMessageProjection,
  reconcileInboxProviderMessage,
} from "@/lib/inbox/message-projection";
import { toast } from "@/lib/toast";
import {
  messageText,
  type IncomingMessage,
  type WhatsAppStatus,
  type WhatsAppUser,
} from "@/lib/whatsapp/types";
import { useWhatsAppSocket } from "@/hooks/use-whatsapp-socket";

const CHAT_REFRESH_COALESCE_MS = 500;
const LIVE_RECOVERY_POLL_MS = 3_000;
const DRAFT_SAVE_DELAY_MS = 600;
const MAX_DEEP_LINK_ID_LENGTH = 160;

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
  attachment?: IncomingMessage["attachment"];
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

function normalizeDeepLinkConversationId(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized.length > MAX_DEEP_LINK_ID_LENGTH) return null;
  return normalized;
}

function mapConversationProjection(
  conversation: ConversationProjection,
  restrictedContact: string,
): InboxChat {
  return {
    id: conversation.id,
    conversationId: conversation.id,
    name: conversation.contactName ?? restrictedContact,
    phone: conversation.contactPhone ?? undefined,
    channel: "conversation",
    lastMessageAt: conversation.lastMessageAt
      ? new Date(conversation.lastMessageAt).getTime()
      : undefined,
    unread: conversation.unreadCount,
    workflow: {
      status: conversation.status as ConversationWorkflowState["status"],
      assigneeId: conversation.assigneeId,
      priority: conversation.priority as ConversationWorkflowState["priority"],
      labels: parseLabels(conversation.labels),
      snoozedUntil: conversation.snoozedUntil,
      waitingSince: conversation.waitingSince,
      firstReplyAt: conversation.firstReplyAt,
    },
  };
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

function inboxMessagesEqual(
  left: readonly InboxMessage[],
  right: readonly InboxMessage[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((message, index) => {
    const candidate = right[index];
    return (
      candidate !== undefined &&
      message.id === candidate.id &&
      message.body === candidate.body &&
      message.direction === candidate.direction &&
      message.timestamp === candidate.timestamp &&
      message.messageType === candidate.messageType &&
      message.deliveryStatus === candidate.deliveryStatus &&
      message.outboxEffectKey === candidate.outboxEffectKey &&
      message.outboxState === candidate.outboxState &&
      JSON.stringify(message.attachment) === JSON.stringify(candidate.attachment)
    );
  });
}

export function useInboxWorkspace() {
  const searchParams = useSearchParams();
  const requestedConversationId = normalizeDeepLinkConversationId(
    searchParams.get("conversation"),
  );
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
  const [replyText, setReplyTextState] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [qrKey, setQrKey] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesInnerRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const activeTransportIdRef = useRef<string | null>(null);
  const chatRefreshTimerRef = useRef<number | null>(null);
  const chatLoadGenerationRef = useRef(0);
  const activeChatRef = useRef<InboxChat | null>(null);
  const messagesRef = useRef<InboxMessage[]>([]);
  const foregroundMessageLoadRef = useRef(0);
  const messageLoadGenerationRef = useRef(0);
  const messageSelectionGenerationRef = useRef(0);
  const messageMutationGenerationRef = useRef(0);
  const sendingRef = useRef(false);
  const deepLinkAttemptRef = useRef<string | null>(null);
  const pinnedDeepLinkChatRef = useRef<InboxChat | null>(null);
  const replyTextRef = useRef("");
  const draftEditGenerationRef = useRef(0);
  const draftLoadGenerationRef = useRef(0);
  const draftReadyConversationRef = useRef<string | null>(null);
  const draftWriteQueueRef = useRef(new Map<string, Promise<boolean>>());
  const draftRevisionRef = useRef(new Map<string, number>());

  const setReplyText = useCallback(
    (value: string | ((current: string) => string)) => {
      draftEditGenerationRef.current += 1;
      setReplyTextState((current) => {
        const next = typeof value === "function" ? value(current) : value;
        replyTextRef.current = next;
        return next;
      });
    },
    [],
  );

  const replaceMessages = useCallback((next: InboxMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const mutateMessages = useCallback(
    (
      conversationId: string,
      mutation: (current: InboxMessage[]) => InboxMessage[],
    ) => {
      if (activeChatRef.current?.conversationId !== conversationId) return;
      const current = messagesRef.current;
      const next = mutation(current);
      if (inboxMessagesEqual(current, next)) return;
      if (activeChatRef.current?.conversationId !== conversationId) return;
      messageMutationGenerationRef.current += 1;
      messagesRef.current = next;
      setMessages(next);
    },
    [],
  );

  const canUpdateConversation = allowedActions.includes("conversations.update");
  const canReply = allowedActions.includes("conversations.reply");
  const canManageWhatsApp = allowedActions.includes("whatsapp.connection.manage");

  const mergePinnedDeepLink = useCallback((nextChats: InboxChat[]) => {
    const pinned = pinnedDeepLinkChatRef.current;
    if (!pinned) return nextChats;
    if (
      nextChats.some(
        (chat) => chat.conversationId === pinned.conversationId,
      )
    ) {
      pinnedDeepLinkChatRef.current = null;
      return nextChats;
    }
    return [pinned, ...nextChats];
  }, []);

  const loadFallbackProjection = useCallback(async (loadGeneration: number) => {
    const response = await fetch("/api/conversations", { cache: "no-store" });
    if (!response.ok) throw new Error(`Conversation projection failed: ${response.status}`);
    const data = (await response.json()) as {
      conversations: ConversationProjection[];
      authority?: { allowedActions: string[] };
    };
    if (chatLoadGenerationRef.current !== loadGeneration) return;
    setAllowedActions(data.authority?.allowedActions ?? []);
    const restrictedContact = copy("restrictedContact");
    const nextChats = mergePinnedDeepLink(
      data.conversations.map((conversation) =>
        mapConversationProjection(conversation, restrictedContact),
      ),
    );
    const activeChat = activeChatRef.current;
    if (activeChat) {
      activeChatRef.current =
        nextChats.find(
          (chat) => chat.conversationId === activeChat.conversationId,
        ) ?? activeChat;
    }
    setChats(nextChats);
  }, [copy, mergePinnedDeepLink]);

  const loadChats = useCallback(async () => {
    const loadGeneration = ++chatLoadGenerationRef.current;
    const isLatestChatLoad = () =>
      chatLoadGenerationRef.current === loadGeneration;
    try {
      const response = await fetch("/api/whatsapp/chats?limit=100", {
        cache: "no-store",
      });
      if (response.ok) {
        const data = (await response.json()) as CanonicalChatResponse;
        if (!isLatestChatLoad()) return;
        setAllowedActions(data.authority?.allowedActions ?? []);
        setSidecarReachable(data.sidecarReachable);
        setSidecarStatus(
          isWhatsAppStatus(data.sidecarStatus) ? data.sidecarStatus : null,
        );
        setDataDegraded(false);
        const nextChats = mergePinnedDeepLink(
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
              status:
                chat.workflow.status as ConversationWorkflowState["status"],
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
        const activeChat = activeChatRef.current;
        if (activeChat) {
          activeChatRef.current =
            nextChats.find(
              (chat) => chat.conversationId === activeChat.conversationId,
            ) ?? activeChat;
        }
        setChats(nextChats);
        return;
      }

      // A field-restricted actor can still read the permission-filtered generic
      // conversation projection. Do not mislabel that durable data as demo data.
      if (response.status === 401 || response.status === 403) {
        if (!isLatestChatLoad()) return;
        setSidecarReachable(null);
        setSidecarStatus(null);
        setDataDegraded(false);
        await loadFallbackProjection(loadGeneration);
        return;
      }

      throw new Error(`Canonical inbox load failed: ${response.status}`);
    } catch {
      if (!isLatestChatLoad()) return;
      setDataDegraded(true);
      try {
        await loadFallbackProjection(loadGeneration);
      } catch {
        if (isLatestChatLoad()) setChats([]);
      }
    } finally {
      if (isLatestChatLoad()) setLoadingChats(false);
    }
  }, [loadFallbackProjection, mergePinnedDeepLink]);

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

  const markUnread = useCallback(async (chat: InboxChat) => {
    if (!canUpdateConversation) return false;
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(chat.conversationId)}/unread`,
        { method: "PATCH" },
      );
      if (!response.ok) return false;
      setChats((current) =>
        current.map((entry) =>
          entry.conversationId === chat.conversationId
            ? { ...entry, unread: Math.max(1, entry.unread) }
            : entry,
        ),
      );
      return true;
    } catch {
      return false;
    }
  }, [canUpdateConversation]);

  const loadMessages = useCallback(
    async (chat: InboxChat, options?: { background?: boolean }) => {
      const background = options?.background === true;
      const requestedConversationId = chat.conversationId;
      const messageLoadGeneration = ++messageLoadGenerationRef.current;
      const foregroundLoad = background
        ? null
        : ++foregroundMessageLoadRef.current;
      const selectionGeneration = messageSelectionGenerationRef.current;
      const mutationGeneration = messageMutationGenerationRef.current;
      const isCurrentConversation = () =>
        activeChatRef.current?.conversationId === requestedConversationId;
      const canApplyLoadedProjection = () =>
        isCurrentConversation() &&
        messageLoadGenerationRef.current === messageLoadGeneration &&
        messageSelectionGenerationRef.current === selectionGeneration;
      const applyLoadedProjection = (loaded: InboxMessage[]) => {
        if (!canApplyLoadedProjection()) return false;
        replaceMessages(
          messageMutationGenerationRef.current === mutationGeneration
            ? loaded
            : mergeInboxMessageProjection(loaded, messagesRef.current),
        );
        return true;
      };
      if (!background) {
        setLoadingMessages(true);
        setSendError(null);
      }
      try {
        if (chat.channel === "whatsapp" && chat.transportId) {
          const response = await fetch(
            `/api/whatsapp/chats/${encodeURIComponent(chat.transportId)}/messages?limit=200`,
            { cache: "no-store" },
          );
          if (response.ok) {
            const data = (await response.json()) as {
              messages: Array<IncomingMessage & { messageType?: string }>;
            };
            const loadedMessages: InboxMessage[] = data.messages.map(
              (message) => ({
                id: message.key.id,
                body: messageText(message.message),
                direction: message.key.fromMe ? "outbound" : "inbound",
                timestamp: message.messageTimestamp * 1000,
                messageType: message.messageType,
                deliveryStatus: message.deliveryStatus,
                outboxEffectKey: message.effectKey,
                outboxState: message.effectState,
                attachment: message.attachment,
              }),
            );
            if (!applyLoadedProjection(loadedMessages)) return;
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
        const loadedMessages: InboxMessage[] = data.conversation.messages.map(
          (message) => ({
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
            attachment: message.attachment,
          }),
        );
        if (!applyLoadedProjection(loadedMessages)) return;
        void markRead(chat);
      } catch {
        if (
          !background &&
          canApplyLoadedProjection() &&
          messageMutationGenerationRef.current === mutationGeneration
        ) {
          replaceMessages([]);
        }
      } finally {
        if (
          foregroundLoad !== null &&
          foregroundMessageLoadRef.current === foregroundLoad
        ) {
          setLoadingMessages(false);
        }
      }
    },
    [markRead, replaceMessages],
  );

  const persistDraft = useCallback(
    async (conversationId: string, body: string) => {
      if (!canReply) return false;
      const revision = (draftRevisionRef.current.get(conversationId) ?? 0) + 1;
      draftRevisionRef.current.set(conversationId, revision);
      const previous =
        draftWriteQueueRef.current.get(conversationId) ?? Promise.resolve(true);
      const write = previous.catch(() => false).then(async () => {
        try {
          const response = await fetch(
            `/api/conversations/${encodeURIComponent(conversationId)}/draft`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ body, revision }),
            },
          );
          return response.ok;
        } catch {
          return false;
        }
      });
      draftWriteQueueRef.current.set(conversationId, write);
      try {
        return await write;
      } finally {
        if (draftWriteQueueRef.current.get(conversationId) === write) {
          draftWriteQueueRef.current.delete(conversationId);
        }
      }
    },
    [canReply],
  );

  const loadDraft = useCallback(
    async (chat: InboxChat) => {
      const generation = ++draftLoadGenerationRef.current;
      const editGeneration = draftEditGenerationRef.current;
      if (!canReply) return;
      try {
        // A rapid A -> B -> A switch can arrive here while A's switch flush is
        // still queued behind an older autosave. Never install a database value
        // until every write already queued for this conversation has settled.
        let pendingWrite = draftWriteQueueRef.current.get(chat.conversationId);
        while (pendingWrite) {
          await pendingWrite.catch(() => false);
          const nextWrite = draftWriteQueueRef.current.get(chat.conversationId);
          if (!nextWrite || nextWrite === pendingWrite) break;
          pendingWrite = nextWrite;
        }
        if (
          generation !== draftLoadGenerationRef.current ||
          activeChatRef.current?.conversationId !== chat.conversationId
        ) {
          return;
        }
        const response = await fetch(
          `/api/conversations/${encodeURIComponent(chat.conversationId)}/draft`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const data = (await response.json()) as {
          body?: unknown;
          revision?: unknown;
        };
        if (
          generation !== draftLoadGenerationRef.current ||
          activeChatRef.current?.conversationId !== chat.conversationId
        ) {
          return;
        }
        const serverRevision =
          typeof data.revision === "number" &&
          Number.isSafeInteger(data.revision) &&
          data.revision >= 0
            ? data.revision
            : 0;
        draftRevisionRef.current.set(
          chat.conversationId,
          Math.max(
            serverRevision,
            draftRevisionRef.current.get(chat.conversationId) ?? 0,
          ),
        );
        draftReadyConversationRef.current = chat.conversationId;
        if (draftEditGenerationRef.current === editGeneration) {
          const body = typeof data.body === "string" ? data.body : "";
          replyTextRef.current = body;
          setReplyTextState(body);
        } else {
          void persistDraft(chat.conversationId, replyTextRef.current);
        }
      } finally {
        if (
          generation === draftLoadGenerationRef.current &&
          activeChatRef.current?.conversationId === chat.conversationId
        ) {
          draftReadyConversationRef.current = chat.conversationId;
        }
      }
    },
    [canReply, persistDraft],
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
      const activeConversationId = activeChatRef.current?.conversationId;
      if (
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
            },
          ];
        });
      }
      scheduleChatsRefresh();
    },
    [mutateMessages, scheduleChatsRefresh],
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
    [mutateMessages],
  );

  const { status, user, wsOpen, reconnect } = useWhatsAppSocket({
    onStatusChange: handleStatusChange,
    onMessage: handleMessage,
    onMessageUpdate: handleMessageUpdate,
  });

  useEffect(() => {
    const initialId = window.setTimeout(() => {
      void loadChats();
    }, 0);
    return () => {
      window.clearTimeout(initialId);
      if (chatRefreshTimerRef.current !== null) {
        window.clearTimeout(chatRefreshTimerRef.current);
        chatRefreshTimerRef.current = null;
      }
    };
  }, [loadChats]);

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
  }, [loadChats, loadMessages, sending, sidecarReachable, sidecarStatus, wsOpen]);

  const selectChat = useCallback(
    (chat: InboxChat) => {
      const previousChat = activeChatRef.current;
      if (
        previousChat &&
        previousChat.conversationId !== chat.conversationId
      ) {
        void persistDraft(
          previousChat.conversationId,
          replyTextRef.current,
        );
      }
      messageSelectionGenerationRef.current += 1;
      activeChatRef.current = chat;
      pinnedDeepLinkChatRef.current = chat;
      setChats((current) => {
        const index = current.findIndex(
          (entry) => entry.conversationId === chat.conversationId,
        );
        if (index === -1) return [chat, ...current];

        const existing = current[index];
        if (!existing) return [chat, ...current];
        if (
          existing.id === chat.id &&
          existing.transportId === chat.transportId &&
          existing.channel === chat.channel
        ) {
          return current;
        }

        const next = [...current];
        next[index] = { ...existing, ...chat };
        return next;
      });
      activeTransportIdRef.current = chat.transportId ?? null;
      setActiveChatId(chat.id);
      replaceMessages([]);
      draftReadyConversationRef.current = null;
      setReplyText("");
      void loadMessages(chat);
      void loadDraft(chat);
    },
    [loadDraft, loadMessages, persistDraft, replaceMessages, setReplyText],
  );

  const clearActiveChat = useCallback(() => {
    const previousChat = activeChatRef.current;
    if (previousChat) {
      void persistDraft(previousChat.conversationId, replyTextRef.current);
    }
    messageSelectionGenerationRef.current += 1;
    activeChatRef.current = null;
    activeTransportIdRef.current = null;
    draftLoadGenerationRef.current += 1;
    draftReadyConversationRef.current = null;
    setActiveChatId(null);
    replaceMessages([]);
    setReplyText("");
  }, [persistDraft, replaceMessages, setReplyText]);

  useEffect(() => {
    if (!requestedConversationId) {
      deepLinkAttemptRef.current = null;
      pinnedDeepLinkChatRef.current = null;
      return;
    }
    if (loadingChats) return;

    if (
      pinnedDeepLinkChatRef.current &&
      pinnedDeepLinkChatRef.current.conversationId !== requestedConversationId
    ) {
      pinnedDeepLinkChatRef.current = null;
    }

    const existingChat = chats.find(
      (chat) => chat.conversationId === requestedConversationId,
    );
    const activeChatStillExists = chats.some(
      (chat) => chat.id === activeChatId,
    );
    if (existingChat) {
      if (
        deepLinkAttemptRef.current !== requestedConversationId ||
        !activeChatStillExists
      ) {
        deepLinkAttemptRef.current = requestedConversationId;
        selectChat(existingChat);
      }
      return;
    }
    if (deepLinkAttemptRef.current === requestedConversationId) return;

    deepLinkAttemptRef.current = requestedConversationId;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/conversations/${encodeURIComponent(requestedConversationId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          if (response.status >= 500 && !cancelled) {
            deepLinkAttemptRef.current = null;
          }
          return;
        }
        const data = (await response.json()) as {
          conversation: ConversationProjection & { messages: SeededMessage[] };
        };
        if (cancelled) return;
        const chat = mapConversationProjection(
          data.conversation,
          copy("restrictedContact"),
        );
        pinnedDeepLinkChatRef.current = chat;
        setChats((current) =>
          current.some(
            (entry) => entry.conversationId === chat.conversationId,
          )
            ? current
            : [chat, ...current],
        );
        selectChat(chat);
      } catch {
        if (!cancelled) deepLinkAttemptRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeChatId,
    chats,
    copy,
    loadingChats,
    requestedConversationId,
    selectChat,
  ]);

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
    async (
      conversationId: string,
      effectKey: string,
      localMessageId: string,
    ) => {
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
            mutateMessages(conversationId, (current) =>
              reconcileInboxProviderMessage(
                current,
                localMessageId,
                data.effect.providerMessageId,
                {
                  deliveryStatus: "sent",
                  outboxEffectKey: effectKey,
                  outboxState: state,
                },
              ),
            );
            return;
          }
          if (state === "ambiguous" || state === "dead_letter") {
            mutateMessages(conversationId, (current) =>
              reconcileInboxProviderMessage(
                current,
                localMessageId,
                data.effect.providerMessageId,
                {
                  deliveryStatus: "failed",
                  outboxEffectKey: effectKey,
                  outboxState: state,
                },
              ),
            );
            if (activeChatRef.current?.conversationId === conversationId) {
              setSendError(
                state === "ambiguous"
                  ? t("inbox.whatsappAmbiguous")
                  : t("inbox.sendFailed"),
              );
            }
            return;
          }
          mutateMessages(conversationId, (current) =>
            reconcileInboxProviderMessage(
              current,
              localMessageId,
              data.effect.providerMessageId,
              {
                outboxEffectKey: effectKey,
                outboxState: state,
              },
            ),
          );
        } catch {
          // The intent is durable. Polling can continue while this view is open.
        }
      }
    },
    [mutateMessages, t],
  );

  const retryFailedMessage = useCallback(
    async (message: InboxMessage) => {
      const conversationId = activeChatRef.current?.conversationId;
      if (!message.outboxEffectKey || !conversationId) return;
      const confirmMayDuplicate =
        message.outboxState === "ambiguous"
          ? window.confirm(t("inbox.whatsappAmbiguousRetryWarning"))
          : false;
      if (message.outboxState === "ambiguous" && !confirmMayDuplicate) return;

      mutateMessages(conversationId, (current) =>
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
          mutateMessages(conversationId, (current) =>
            reconcileInboxProviderMessage(
              current,
              message.id,
              data.effect?.providerMessageId,
              {
                deliveryStatus: "sent",
                outboxEffectKey: message.outboxEffectKey,
                outboxState: "succeeded",
              },
            ),
          );
          return;
        }
        if (response.status === 202) {
          void monitorWhatsAppEffect(
            conversationId,
            message.outboxEffectKey,
            message.id,
          );
          return;
        }
        throw new Error(
          data.effect.state === "ambiguous"
            ? t("inbox.whatsappAmbiguous")
            : t("inbox.sendFailed"),
        );
      } catch (error) {
        mutateMessages(conversationId, (current) =>
          current.map((entry) =>
            entry.id === message.id
              ? { ...entry, deliveryStatus: "failed" }
              : entry,
          ),
        );
        if (activeChatRef.current?.conversationId === conversationId) {
          setSendError(
            error instanceof Error ? error.message : t("inbox.sendFailed"),
          );
        }
      }
    },
    [monitorWhatsAppEffect, mutateMessages, t],
  );

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [activeChatId, chats],
  );

  useEffect(() => {
    if (
      !activeChat ||
      !canReply ||
      draftReadyConversationRef.current !== activeChat.conversationId
    ) {
      return;
    }
    const conversationId = activeChat.conversationId;
    const body = replyText;
    const timer = window.setTimeout(() => {
      void persistDraft(conversationId, body);
    }, DRAFT_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeChat, canReply, persistDraft, replyText]);

  const flushDraftForLifecycle = useCallback(() => {
    const chat = activeChatRef.current;
    if (
      !canReply ||
      !chat ||
      draftReadyConversationRef.current !== chat.conversationId
    ) {
      return;
    }
    const revision =
      (draftRevisionRef.current.get(chat.conversationId) ?? 0) + 1;
    draftRevisionRef.current.set(chat.conversationId, revision);
    // `keepalive` lets the bounded JSON request survive SPA navigation,
    // pagehide, and desktop WebView teardown after this hook unmounts.
    void fetch(
      `/api/conversations/${encodeURIComponent(chat.conversationId)}/draft`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyTextRef.current, revision }),
        keepalive: true,
      },
    ).catch(() => undefined);
  }, [canReply]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushDraftForLifecycle();
    };
    window.addEventListener("pagehide", flushDraftForLifecycle);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushDraftForLifecycle);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flushDraftForLifecycle();
    };
  }, [flushDraftForLifecycle]);

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
      sendingRef.current ||
      !replyText.trim()
    ) {
      return;
    }

    const tempId = crypto.randomUUID();
    const body = replyText.trim();
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    mutateMessages(chat.conversationId, (current) => [
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
        setReplyText("");
        void persistDraft(chat.conversationId, "");
        mutateMessages(chat.conversationId, (current) =>
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
        void monitorWhatsAppEffect(
          chat.conversationId,
          data.effectKey,
          tempId,
        );
        return;
      }
      if (!response.ok || !data.ok) {
        mutateMessages(chat.conversationId, (current) =>
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
      mutateMessages(chat.conversationId, (current) =>
        reconcileInboxProviderMessage(current, tempId, data.id, {
          deliveryStatus: "sent",
          outboxEffectKey: data.effectKey,
          outboxState: "succeeded",
        }),
      );
      setReplyText("");
      void persistDraft(chat.conversationId, "");
      void loadChats();
    } catch (error) {
      mutateMessages(chat.conversationId, (current) =>
        current.map((message) =>
          message.id === tempId
            ? { ...message, deliveryStatus: "failed" }
            : message,
        ),
      );
      if (activeChatRef.current?.conversationId === chat.conversationId) {
        setSendError(
          error instanceof Error ? error.message : t("inbox.sendFailed"),
        );
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [
    activeChatId,
    canReply,
    chats,
    effectiveStatus,
    loadChats,
    monitorWhatsAppEffect,
    mutateMessages,
    persistDraft,
    replyText,
    setReplyText,
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
    markUnread,
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
