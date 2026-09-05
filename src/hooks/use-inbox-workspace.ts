"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useI18n } from "@/hooks/use-i18n";
import { getInboxWorkspaceCopy } from "@/lib/i18n/inbox-workspace";
import type { WhatsAppStatus } from "@/lib/whatsapp/types";
import { useWhatsAppSocket } from "@/hooks/use-whatsapp-socket";
import {
  DELETE_CONTRACT_MAX_IDS,
  DELETE_CONTRACT_MAX_ID_LENGTH,
  type ConversationProjection,
  type DeleteChatsOutcome,
  type InboxWorkspaceCopy,
  type SeededMessage,
  describeDeleteRejection,
  mapConversationProjection,
  normalizeDeepLinkConversationId,
} from "./inbox/inbox-workspace-shared";
import { useInboxSharedRefs } from "./inbox/use-inbox-shared-refs";
import { useInboxChatQueue } from "./inbox/use-inbox-chat-queue";
import { useInboxDrafts } from "./inbox/use-inbox-drafts";
import { useInboxThread } from "./inbox/use-inbox-thread";
import { useInboxOutbox } from "./inbox/use-inbox-outbox";
import {
  useInboxTransportHandlers,
  useInboxTransportRuntime,
} from "./inbox/use-inbox-transport";

// INB-27: the delete contract surface stays importable from this module —
// the campaign evidence (delete-rejection-summary) pins it here.
export { describeDeleteRejection } from "./inbox/inbox-workspace-shared";
export type {
  DeleteChatsOutcome,
  DeleteChatsRejection,
} from "./inbox/inbox-workspace-shared";

/**
 * Composition root of the Inbox workspace (INB-27).
 *
 * The former 2,381-line god hook is split into focused concern hooks —
 * chat queue, drafts, thread, outbox and transport — composed here in
 * dependency order with shared refs injected once. The return shape is the
 * exact historical surface, so no component consumer changes.
 */
export function useInboxWorkspace() {
  const searchParams = useSearchParams();
  const requestedConversationId = normalizeDeepLinkConversationId(
    searchParams.get("conversation"),
  );
  const { t, locale } = useI18n();
  const copy = useCallback<InboxWorkspaceCopy>(
    (key, params) => getInboxWorkspaceCopy(locale, key, params),
    [locale],
  );

  const refs = useInboxSharedRefs();

  const [sendError, setSendError] = useState<string | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const deepLinkAttemptRef = useRef<string | null>(null);

  const chatQueue = useInboxChatQueue({ copy, refs });

  const activeChat = useMemo(
    () => chatQueue.chats.find((chat) => chat.id === chatQueue.activeChatId) ?? null,
    [chatQueue.activeChatId, chatQueue.chats],
  );

  const drafts = useInboxDrafts({
    canReply: chatQueue.canReply,
    activeChatRef: refs.activeChatRef,
    activeChat,
  });

  const thread = useInboxThread({
    refs,
    setChats: chatQueue.setChats,
    setActiveChatId: chatQueue.setActiveChatId,
    activeChatId: chatQueue.activeChatId,
    pinnedDeepLinkChatRef: chatQueue.pinnedDeepLinkChatRef,
    markRead: chatQueue.markRead,
    setSendError,
    drafts,
  });

  const transportHandlers = useInboxTransportHandlers({
    refs,
    setSidecarReachable: chatQueue.setSidecarReachable,
    setSidecarStatus: chatQueue.setSidecarStatus,
    loadChats: chatQueue.loadChats,
    scheduleChatsRefresh: chatQueue.scheduleChatsRefresh,
    mutateMessages: thread.mutateMessages,
    loadMessages: thread.loadMessages,
  });

  const { status, user, wsOpen, reconnect } = useWhatsAppSocket({
    onStatusChange: transportHandlers.handleStatusChange,
    onMessage: transportHandlers.handleMessage,
    onMessageUpdate: transportHandlers.handleMessageUpdate,
  });

  const effectiveStatus: WhatsAppStatus | null = status ?? chatQueue.sidecarStatus;

  const outbox = useInboxOutbox({
    refs,
    chats: chatQueue.chats,
    activeChatId: chatQueue.activeChatId,
    effectiveStatus,
    canReply: chatQueue.canReply,
    replyText: drafts.replyText,
    setSendError,
    setReplyText: drafts.setReplyText,
    persistDraft: drafts.persistDraft,
    mutateMessages: thread.mutateMessages,
    loadMessages: thread.loadMessages,
    loadChats: chatQueue.loadChats,
    t,
  });

  const transportRuntime = useInboxTransportRuntime({
    refs,
    status,
    user,
    wsOpen,
    reconnect,
    sidecarReachable: chatQueue.sidecarReachable,
    sidecarStatus: chatQueue.sidecarStatus,
    effectiveStatus,
    sending: outbox.sending,
    loadChats: chatQueue.loadChats,
    loadMessages: thread.loadMessages,
    t,
  });

  const {
    chats,
    loadingChats,
    activeChatId,
    setChats,
    setActiveChatId,
    canDeleteChats,
    pinnedDeepLinkChatRef,
    loadChats,
  } = chatQueue;
  const { setReplyText, draftLoadGenerationRef, draftReadyConversationRef } = drafts;
  const { activeChatRef, activeTransportIdRef, messageSelectionGenerationRef } = refs;
  const { replaceMessages, selectChat } = thread;

  /**
   * Permanent multi-select chat deletion (founder-confirmed contract).
   * Server removes messages, effects, ingress events and local media; the
   * queue refreshes and an open deleted chat is dropped without persisting
   * its draft back to the now-deleted conversation. Failures return a
   * coded outcome instead of a bare boolean so the confirm dialog can
   * surface the server's rejection reason.
   */
  const deleteChats = useCallback(
    async (conversationIds: string[]): Promise<DeleteChatsOutcome> => {
      if (!canDeleteChats || conversationIds.length === 0) {
        return { ok: false, errorCode: null, errorDetail: null, rejectionSummary: null, notFoundIds: null };
      }
      // Round 3: pre-flight the exact server contract client-side. A doomed
      // request (empty id, id longer than the 256-char projection contract —
      // round 4: real stores hold legitimate 69-char legacy/provider ids, so
      // the bound widened from the cuid-era 64, founder finding F-04 — or
      // more than 100 ids) must fail HERE with the offending shape named
      // instead of round-tripping to the same coded 400 with no further
      // evidence.
      const oversized = conversationIds.filter(
        (id) => id.length < 1 || id.length > DELETE_CONTRACT_MAX_ID_LENGTH,
      );
      if (conversationIds.length > DELETE_CONTRACT_MAX_IDS || oversized.length > 0) {
        return {
          ok: false,
          errorCode: "INVALID_DELETE_REQUEST",
          errorDetail: "Invalid chat deletion request",
          rejectionSummary:
            `local contract violation — ${conversationIds.length} id(s)` +
            (oversized.length > 0
              ? `, offending lengths [${oversized.map((id) => id.length).join(", ")}] (max ${DELETE_CONTRACT_MAX_ID_LENGTH})`
              : `, max ${DELETE_CONTRACT_MAX_IDS}`),
          notFoundIds: null,
        };
      }
      try {
        const response = await fetch("/api/whatsapp/chats/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: conversationIds }),
        });
        if (!response.ok) {
          let errorCode: string | null = null;
          let errorDetail: string | null = null;
          let rejectionSummary: string | null = null;
          try {
            const body: unknown = await response.json();
            if (body && typeof body === "object") {
              const candidate = body as {
                code?: unknown;
                error?: unknown;
                rejection?: unknown;
              };
              if (typeof candidate.code === "string") {
                errorCode = candidate.code;
              }
              // Keep the server's own message: it names the exact failing
              // condition ("Invalid chat deletion request", LICENSE_*, …)
              // instead of leaving the operator with a bare HTTP status.
              if (typeof candidate.error === "string" && candidate.error) {
                errorDetail = candidate.error;
              }
              // B5 round 3: the server's PII-free shape verdict — the only
              // installed-build evidence of WHY the body failed validation.
              if (candidate.rejection && typeof candidate.rejection === "object") {
                const rejection = candidate.rejection as {
                  reason?: unknown;
                  issues?: unknown;
                  idCount?: unknown;
                  idLengths?: unknown;
                  bodyLength?: unknown;
                };
                if (typeof rejection.reason === "string") {
                  rejectionSummary = describeDeleteRejection({
                    reason: rejection.reason,
                    issues:
                      Array.isArray(rejection.issues) &&
                      rejection.issues.every((issue) => typeof issue === "string")
                        ? (rejection.issues as string[])
                        : undefined,
                    idCount:
                      typeof rejection.idCount === "number"
                        ? rejection.idCount
                        : undefined,
                    idLengths:
                      Array.isArray(rejection.idLengths) &&
                      rejection.idLengths.every((length) => typeof length === "number")
                        ? (rejection.idLengths as number[])
                        : undefined,
                    bodyLength:
                      typeof rejection.bodyLength === "number"
                        ? rejection.bodyLength
                        : undefined,
                  });
                }
              }
            }
          } catch {
            // Non-JSON failure body (e.g. a bare middleware 401): fall back
            // to the numeric status below.
          }
          return {
            ok: false,
            errorCode: errorCode ?? `HTTP_${response.status}`,
            errorDetail,
            rejectionSummary,
            notFoundIds: null,
          };
        }
        // Audit S3-20 (client half): the additive `notFoundIds` verdict from
        // the 200 body — defensive parse, absent on older paired servers.
        let notFoundIds: string[] | null = null;
        try {
          const body = (await response.json()) as { notFoundIds?: unknown };
          if (Array.isArray(body.notFoundIds)) {
            notFoundIds = body.notFoundIds.every(
              (id): id is string => typeof id === "string",
            )
              ? (body.notFoundIds as string[])
              : null;
          }
        } catch {
          // Non-JSON success body — leave null.
        }
        const active = activeChatRef.current;
        if (active && conversationIds.includes(active.conversationId)) {
          messageSelectionGenerationRef.current += 1;
          activeChatRef.current = null;
          activeTransportIdRef.current = null;
          draftLoadGenerationRef.current += 1;
          draftReadyConversationRef.current = null;
          setActiveChatId(null);
          replaceMessages([]);
          setReplyText("");
        }
        await loadChats();
        return {
          ok: true,
          errorCode: null,
          errorDetail: null,
          rejectionSummary: null,
          notFoundIds,
        };
      } catch {
        return { ok: false, errorCode: null, errorDetail: null, rejectionSummary: null, notFoundIds: null };
      }
    },
    [
      activeChatRef,
      activeTransportIdRef,
      canDeleteChats,
      draftLoadGenerationRef,
      draftReadyConversationRef,
      loadChats,
      messageSelectionGenerationRef,
      replaceMessages,
      setActiveChatId,
      setReplyText,
    ],
  );

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
    pinnedDeepLinkChatRef,
    requestedConversationId,
    selectChat,
    setChats,
  ]);

  return {
    t,
    locale,
    copy,
    chats,
    filteredChats: chatQueue.filteredChats,
    queueCounts: chatQueue.queueCounts,
    queueFilter: chatQueue.queueFilter,
    setQueueFilter: chatQueue.setQueueFilter,
    searchQuery: chatQueue.searchQuery,
    setSearchQuery: chatQueue.setSearchQuery,
    loadingChats,
    activeChat,
    activeChatId,
    selectChat,
    clearActiveChat: thread.clearActiveChat,
    messages: thread.messages,
    loadingMessages: thread.loadingMessages,
    messagesInnerRef: thread.messagesInnerRef,
    messagesEndRef: thread.messagesEndRef,
    isAwayFromBottom: thread.isAwayFromBottom,
    missedMessageCount: thread.missedMessageCount,
    activeChatInitialUnread: thread.activeChatInitialUnread,
    scrollToLatestMessages: thread.scrollToLatestMessages,
    dismissUnreadDivider: thread.dismissUnreadDivider,
    replyText: drafts.replyText,
    setReplyText,
    localDrafts: drafts.localDrafts,
    sending: outbox.sending,
    sendError,
    setSendError,
    sendReply: outbox.sendReply,
    sendImage: outbox.sendImage,
    sendVideo: outbox.sendVideo,
    sendDocument: outbox.sendDocument,
    sendVoice: outbox.sendVoice,
    uploads: outbox.uploads,
    cancelUpload: outbox.cancelUpload,
    retryFailedMessage: outbox.retryFailedMessage,
    ambiguousRetryMessage: outbox.ambiguousRetryMessage,
    resolveAmbiguousRetry: outbox.resolveAmbiguousRetry,
    historyHasMore: thread.historyHasMore,
    loadingOlderMessages: thread.loadingOlderMessages,
    loadOlderMessages: thread.loadOlderMessages,
    markUnread: chatQueue.markUnread,
    setConversationState: chatQueue.setConversationState,
    canUpdateConversation: chatQueue.canUpdateConversation,
    canReply: chatQueue.canReply,
    canDeleteChats,
    deleteChats,
    canManageWhatsApp: chatQueue.canManageWhatsApp,
    transport: transportRuntime.transport,
    dataDegraded: chatQueue.dataDegraded,
    refreshChats: loadChats,
    reconnect,
    connectWhatsApp: transportRuntime.connectWhatsApp,
    logoutConfirmOpen,
    setLogoutConfirmOpen,
    disconnectWhatsApp: transportRuntime.disconnectWhatsApp,
    qrKey: transportRuntime.qrKey,
    refreshQr: transportRuntime.refreshQr,
  };
}
