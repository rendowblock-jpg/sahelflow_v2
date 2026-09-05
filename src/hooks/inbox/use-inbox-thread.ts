"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  InboxChat,
  InboxMessage,
} from "@/components/inbox/inbox-workspace-types";
import {
  mergeInboxMessageProjection,
  toInboxMessageFromWhatsApp,
} from "@/lib/inbox/message-projection";
import type { IncomingMessage } from "@/lib/whatsapp/types";
import {
  type SeededMessage,
  inboxMessagesEqual,
} from "./inbox-workspace-shared";
import type { InboxSharedRefs } from "./use-inbox-shared-refs";

/**
 * INB-27 — thread concern of the Inbox workspace.
 *
 * Owns the active thread projection: canonical + fallback message loads with
 * generation-guarded application, strictly additive older-history paging,
 * selection/clear transitions, and the WhatsApp-class tail management
 * (near-bottom tracking, missed-message count, open-at-first-unread anchor).
 */
export interface InboxDraftsCollaborators {
  persistDraft: (conversationId: string, body: string) => Promise<boolean>;
  loadDraft: (chat: InboxChat) => Promise<void>;
  setReplyText: (value: string | ((current: string) => string)) => void;
  replyTextRef: React.RefObject<string>;
  draftLoadGenerationRef: React.RefObject<number>;
  draftReadyConversationRef: React.RefObject<string | null>;
}

export interface UseInboxThreadParams {
  refs: Pick<
    InboxSharedRefs,
    | "activeChatRef"
    | "activeTransportIdRef"
    | "messagesRef"
    | "messageLoadGenerationRef"
    | "messageSelectionGenerationRef"
    | "explicitUnreadHoldRef"
  >;
  setChats: React.Dispatch<React.SetStateAction<InboxChat[]>>;
  setActiveChatId: (id: string | null) => void;
  activeChatId: string | null;
  pinnedDeepLinkChatRef: React.RefObject<InboxChat | null>;
  markRead: (chat: InboxChat) => Promise<void>;
  setSendError: (error: string | null) => void;
  drafts: InboxDraftsCollaborators;
}

export function useInboxThread({
  refs,
  setChats,
  setActiveChatId,
  activeChatId,
  pinnedDeepLinkChatRef,
  markRead,
  setSendError,
  drafts,
}: UseInboxThreadParams) {
  const {
    activeChatRef,
    activeTransportIdRef,
    messagesRef,
    messageLoadGenerationRef,
    messageSelectionGenerationRef,
    explicitUnreadHoldRef,
  } = refs;
  const {
    persistDraft,
    loadDraft,
    setReplyText,
    replyTextRef,
    draftLoadGenerationRef,
    draftReadyConversationRef,
  } = drafts;

  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  // Ledger INB-11: honest older-history paging. The cursor is the opaque
  // (timestampSeconds,rowId) composite served by the messages route; null
  // means the locally loaded thread has reached its durable beginning.
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesInnerRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  // Scroll-to-latest affordance state (WhatsApp-class tail management):
  // distance-from-bottom drives the FAB; messages arriving while the operator
  // is scrolled up accumulate into the missed count instead of yanking the
  // viewport (Signal-style auto-scroll is a documented anti-pattern).
  const [isAwayFromBottom, setIsAwayFromBottom] = useState(false);
  const [missedMessageCount, setMissedMessageCount] = useState(0);
  // Unread-at-open snapshot: captured in selectChat BEFORE any mark-read
  // round-trip, drives the "New messages" divider and the open-at-first-unread
  // anchor. Dismissed explicitly (divider click) or on the next selection.
  const [activeChatInitialUnread, setActiveChatInitialUnread] = useState(0);
  const activeChatInitialUnreadRef = useRef(0);
  const initialUnreadScrollDoneRef = useRef(false);
  const prevMessageCountRef = useRef(0);
  const foregroundMessageLoadRef = useRef(0);
  const messageMutationGenerationRef = useRef(0);

  const replaceMessages = useCallback((next: InboxMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, [messagesRef]);

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
    [activeChatRef, messagesRef],
  );

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
              hasMore?: boolean;
              olderCursor?: string | null;
            };
            // toInboxMessageFromWhatsApp preserves the quoted-reply context
            // (#317 B1/B2) so quote chips survive chat switches and restarts.
            const loadedMessages: InboxMessage[] = data.messages.map(
              toInboxMessageFromWhatsApp,
            );
            if (!applyLoadedProjection(loadedMessages)) return;
            setHistoryHasMore(data.hasMore === true);
            setHistoryCursor(data.olderCursor ?? null);
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
        setHistoryHasMore(false);
        setHistoryCursor(null);
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
    [activeChatRef, markRead, messageLoadGenerationRef, messageSelectionGenerationRef, messagesRef, replaceMessages, setSendError],
  );

  /**
   * Ledger INB-11: prepend the next older page of durable history for the
   * active chat. Strictly additive — the cursor page can never overlap the
   * rows already held, so no merge is needed; in-flight optimistic mutations
   * stay untouched (mutateMessages keeps their generation).
   */
  const loadOlderMessages = useCallback(async () => {
    const chat = activeChatRef.current;
    if (
      !chat ||
      loadingOlderMessages ||
      !historyCursor ||
      chat.channel !== "whatsapp" ||
      !chat.transportId
    ) {
      return false;
    }
    const requestedConversationId = chat.conversationId;
    setLoadingOlderMessages(true);
    try {
      const response = await fetch(
        `/api/whatsapp/chats/${encodeURIComponent(chat.transportId)}/messages?limit=200&before=${encodeURIComponent(historyCursor)}`,
        { cache: "no-store" },
      );
      if (!response.ok) return false;
      const data = (await response.json()) as {
        messages?: Array<IncomingMessage & { messageType?: string }>;
        hasMore?: boolean;
        olderCursor?: string | null;
      };
      const older: InboxMessage[] = (data.messages ?? []).map(
        toInboxMessageFromWhatsApp,
      );
      if (activeChatRef.current?.conversationId !== requestedConversationId) {
        return false;
      }
      if (older.length > 0) {
        mutateMessages(requestedConversationId, (current) => [
          ...older,
          ...current,
        ]);
      }
      setHistoryHasMore(data.hasMore === true);
      setHistoryCursor(data.olderCursor ?? null);
      return true;
    } catch {
      return false;
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [activeChatRef, historyCursor, loadingOlderMessages, mutateMessages]);

  const selectChat = useCallback(
    (chat: InboxChat) => {
      const previousChat = activeChatRef.current;
      if (previousChat?.conversationId === chat.conversationId) return;
      if (previousChat) {
        void persistDraft(previousChat.conversationId, replyTextRef.current);
      }
      messageSelectionGenerationRef.current += 1;
      explicitUnreadHoldRef.current.delete(chat.conversationId);
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
      // Snapshot the unread count at open time — mark-read lands later, so
      // this is the only truthful moment to place the unread boundary.
      const initialUnread = chat.unread > 0 ? chat.unread : 0;
      setActiveChatInitialUnread(initialUnread);
      activeChatInitialUnreadRef.current = initialUnread;
      initialUnreadScrollDoneRef.current = false;
      prevMessageCountRef.current = 0;
      setIsAwayFromBottom(true);
      setMissedMessageCount(0);
      setHistoryHasMore(false);
      setHistoryCursor(null);
      replaceMessages([]);
      draftReadyConversationRef.current = null;
      setReplyText("");
      void loadMessages(chat);
      void loadDraft(chat);
    },
    [
      activeChatRef,
      activeTransportIdRef,
      draftReadyConversationRef,
      explicitUnreadHoldRef,
      loadDraft,
      loadMessages,
      messageSelectionGenerationRef,
      persistDraft,
      pinnedDeepLinkChatRef,
      replaceMessages,
      replyTextRef,
      setActiveChatId,
      setChats,
      setReplyText,
    ],
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
    setActiveChatInitialUnread(0);
    activeChatInitialUnreadRef.current = 0;
    initialUnreadScrollDoneRef.current = false;
    setIsAwayFromBottom(false);
    setMissedMessageCount(0);
    setHistoryHasMore(false);
    setHistoryCursor(null);
    setActiveChatId(null);
    replaceMessages([]);
    setReplyText("");
  }, [
    activeChatRef,
    activeTransportIdRef,
    draftLoadGenerationRef,
    draftReadyConversationRef,
    messageSelectionGenerationRef,
    persistDraft,
    replaceMessages,
    replyTextRef,
    setActiveChatId,
    setReplyText,
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
      const nearBottom = scrollHeight - scrollTop - clientHeight < 150;
      isNearBottomRef.current = nearBottom;
      setIsAwayFromBottom(!nearBottom);
      if (nearBottom) setMissedMessageCount(0);
    };
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [activeChatId]);

  useEffect(() => {
    const grew = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (grew) setMissedMessageCount((current) => current + 1);
  }, [messages]);

  // Open-at-first-unread (WhatsApp behavior): when a conversation opened with
  // unread messages loads its first page, anchor the viewport on the first
  // unread message instead of forcing the tail. Later arrivals follow the
  // normal stick-to-bottom rule.
  useEffect(() => {
    const unread = activeChatInitialUnreadRef.current;
    if (
      initialUnreadScrollDoneRef.current ||
      unread <= 0 ||
      loadingMessages ||
      messages.length === 0
    ) {
      return;
    }
    initialUnreadScrollDoneRef.current = true;
    const targetIndex = Math.min(
      messages.length - 1,
      Math.max(0, messages.length - unread),
    );
    // The unread window may already be the tail — in that case stay pinned.
    if (targetIndex >= messages.length - 1) {
      isNearBottomRef.current = true;
      setIsAwayFromBottom(false);
      return;
    }
    isNearBottomRef.current = false;
    setIsAwayFromBottom(true);
    const targetId = messages[targetIndex]?.id;
    if (!targetId) return;
    requestAnimationFrame(() => {
      const element = messagesInnerRef.current?.querySelector(
        `[data-message-id="${CSS.escape(targetId)}"]`,
      );
      element?.scrollIntoView({ block: "center" });
    });
  }, [messages, loadingMessages]);

  const scrollToLatestMessages = useCallback(() => {
    isNearBottomRef.current = true;
    setIsAwayFromBottom(false);
    setMissedMessageCount(0);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const dismissUnreadDivider = useCallback(() => {
    setActiveChatInitialUnread(0);
    activeChatInitialUnreadRef.current = 0;
  }, []);

  return {
    messages,
    loadingMessages,
    historyHasMore,
    loadingOlderMessages,
    isAwayFromBottom,
    missedMessageCount,
    activeChatInitialUnread,
    messagesEndRef,
    messagesInnerRef,
    replaceMessages,
    mutateMessages,
    loadMessages,
    loadOlderMessages,
    selectChat,
    clearActiveChat,
    scrollToLatestMessages,
    dismissUnreadDivider,
  };
}
