"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  InboxChat,
  InboxQueueFilter,
} from "@/components/inbox/inbox-workspace-types";
import type { ConversationWorkflowState } from "@/components/inbox/conversation-controls";
import type { WhatsAppStatus } from "@/lib/whatsapp/types";
import {
  CHAT_REFRESH_COALESCE_MS,
  type CanonicalChatResponse,
  type ConversationProjection,
  type InboxWorkspaceCopy,
  isWhatsAppStatus,
  mapConversationProjection,
} from "./inbox-workspace-shared";
import type { InboxSharedRefs } from "./use-inbox-shared-refs";

/**
 * INB-27 — chat queue concern of the Inbox workspace.
 *
 * Owns the canonical chat list load (`/api/whatsapp/chats` with the durable
 * conversation-projection fallback), the authority-derived capability flags,
 * read-state writes with per-conversation serialization, the INB-12
 * pin/mute/archive mirror, and the queue filter/search projections.
 * Cross-concern refs arrive through `refs`; the deep-link pin ref is owned
 * here because the queue load is what merges it back.
 */
export interface UseInboxChatQueueParams {
  copy: InboxWorkspaceCopy;
  refs: Pick<
    InboxSharedRefs,
    "activeChatRef" | "messageLoadGenerationRef" | "explicitUnreadHoldRef"
  >;
}

export function useInboxChatQueue({
  copy,
  refs,
}: UseInboxChatQueueParams) {
  const { activeChatRef, messageLoadGenerationRef, explicitUnreadHoldRef } = refs;

  const [chats, setChats] = useState<InboxChat[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [allowedActions, setAllowedActions] = useState<string[]>([]);
  const [sidecarReachable, setSidecarReachable] = useState<boolean | null>(null);
  const [sidecarStatus, setSidecarStatus] = useState<WhatsAppStatus | null>(null);
  const [dataDegraded, setDataDegraded] = useState(false);
  const [queueFilter, setQueueFilter] = useState<InboxQueueFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const chatLoadGenerationRef = useRef(0);
  const chatRefreshTimerRef = useRef<number | null>(null);
  const readStateWriteQueueRef = useRef(new Map<string, Promise<void>>());
  const pinnedDeepLinkChatRef = useRef<InboxChat | null>(null);

  const canUpdateConversation = allowedActions.includes("conversations.update");
  const canReply = allowedActions.includes("conversations.reply");
  const canDeleteChats = allowedActions.includes("conversations.delete");
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
  }, [activeChatRef, copy, mergePinnedDeepLink]);

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
            lastMessageFromMe: chat.lastMessage?.fromMe,
            lastMessageType: chat.lastMessage?.type ?? undefined,
            unread: chat.unread,
            pinned: chat.states?.pinned ?? false,
            muted: chat.states?.muted ?? false,
            archived: chat.states?.archived ?? false,
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
  }, [activeChatRef, loadFallbackProjection, mergePinnedDeepLink]);

  const scheduleChatsRefresh = useCallback(() => {
    if (chatRefreshTimerRef.current !== null) return;
    chatRefreshTimerRef.current = window.setTimeout(() => {
      chatRefreshTimerRef.current = null;
      void loadChats();
    }, CHAT_REFRESH_COALESCE_MS);
  }, [loadChats]);

  const markRead = useCallback(
    async (chat: InboxChat) => {
      const conversationId = chat.conversationId;
      if (
        !canUpdateConversation ||
        chat.unread <= 0 ||
        explicitUnreadHoldRef.current.has(conversationId)
      ) {
        return;
      }
      const previous =
        readStateWriteQueueRef.current.get(conversationId) ?? Promise.resolve();
      const write = previous.catch(() => undefined).then(async () => {
        if (explicitUnreadHoldRef.current.has(conversationId)) return;
        try {
          const response = await fetch(
            `/api/conversations/${encodeURIComponent(conversationId)}/read`,
            { method: "PATCH" },
          );
          if (!response.ok) return;
          setChats((current) =>
            current.map((entry) =>
              entry.id === chat.id ? { ...entry, unread: 0 } : entry,
            ),
          );
        } catch {
        }
      });
      readStateWriteQueueRef.current.set(conversationId, write);
      try {
        await write;
      } finally {
        if (readStateWriteQueueRef.current.get(conversationId) === write) {
          readStateWriteQueueRef.current.delete(conversationId);
        }
      }
    },
    [canUpdateConversation, explicitUnreadHoldRef],
  );

  const markUnread = useCallback(async (chat: InboxChat) => {
    if (!canUpdateConversation) return false;
    const conversationId = chat.conversationId;
    explicitUnreadHoldRef.current.add(conversationId);
    messageLoadGenerationRef.current += 1;
    chatLoadGenerationRef.current += 1;
    try {
      await readStateWriteQueueRef.current
        .get(conversationId)
        ?.catch(() => undefined);
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/unread`,
        { method: "PATCH" },
      );
      if (!response.ok) {
        explicitUnreadHoldRef.current.delete(conversationId);
        return false;
      }
      chatLoadGenerationRef.current += 1;
      setChats((current) =>
        current.map((entry) =>
          entry.conversationId === conversationId
            ? { ...entry, unread: Math.max(1, entry.unread) }
            : entry,
        ),
      );
      return true;
    } catch {
      explicitUnreadHoldRef.current.delete(conversationId);
      return false;
    }
  }, [canUpdateConversation, explicitUnreadHoldRef, messageLoadGenerationRef]);

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

  // Ledger INB-12: pin / mute / archive from the queue. Optimistic mirror of
  // the server truth with an honest rollback; a background refresh
  // reconciles the mute horizon.
  const setConversationState = useCallback(
    async (
      chat: InboxChat,
      patch: { pinned?: boolean; muted?: boolean; archived?: boolean },
    ): Promise<boolean> => {
      if (!canUpdateConversation) return false;
      const conversationId = chat.conversationId;
      const previous = chats.find(
        (entry) => entry.conversationId === conversationId,
      );
      setChats((current) =>
        current.map((entry) =>
          entry.conversationId === conversationId
            ? {
                ...entry,
                pinned: patch.pinned ?? entry.pinned,
                muted: patch.muted ?? entry.muted,
                archived: patch.archived ?? entry.archived,
              }
            : entry,
        ),
      );
      try {
        const response = await fetch(
          `/api/conversations/${encodeURIComponent(conversationId)}/state`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        if (!response.ok) throw new Error(`state update: ${response.status}`);
        scheduleChatsRefresh();
        return true;
      } catch {
        if (previous) {
          setChats((current) =>
            current.map((entry) =>
              entry.conversationId === conversationId ? previous : entry,
            ),
          );
        }
        return false;
      }
    },
    [canUpdateConversation, chats, scheduleChatsRefresh],
  );

  const filteredChats = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return chats
      .filter((chat) => {
      // Ledger INB-12: archived conversations live in their own queue only.
      if (queueFilter === "archived") {
        if (!chat.archived) return false;
      } else if (chat.archived) {
        return false;
      }
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
      })
      // Pinned conversations float first (INB-12); the stable sort keeps the
      // server's recency order inside each group.
      .sort((a, b) => Number(b.pinned) - Number(a.pinned));
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
    chats,
    setChats,
    loadingChats,
    allowedActions,
    sidecarReachable,
    setSidecarReachable,
    sidecarStatus,
    setSidecarStatus,
    dataDegraded,
    queueFilter,
    setQueueFilter,
    searchQuery,
    setSearchQuery,
    activeChatId,
    setActiveChatId,
    canUpdateConversation,
    canReply,
    canDeleteChats,
    canManageWhatsApp,
    pinnedDeepLinkChatRef,
    mergePinnedDeepLink,
    loadChats,
    scheduleChatsRefresh,
    markRead,
    markUnread,
    setConversationState,
    filteredChats,
    queueCounts,
  };
}
