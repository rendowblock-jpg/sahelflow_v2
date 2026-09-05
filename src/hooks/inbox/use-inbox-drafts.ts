"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { InboxChat } from "@/components/inbox/inbox-workspace-types";
import {
  DRAFT_LOAD_ATTEMPTS,
  DRAFT_LOAD_RETRY_MS,
  DRAFT_SAVE_DELAY_MS,
  DRAFT_WRITE_ATTEMPTS,
} from "./inbox-workspace-shared";
import type { InboxSharedRefs } from "./use-inbox-shared-refs";

/**
 * INB-27 — draft concern of the Inbox workspace.
 *
 * Owns the composer reply text (with its ref mirror), the session-scoped
 * per-conversation draft previews, the revisioned durable draft write queue,
 * the retrying draft loader, the debounced autosave and the pagehide/
 * visibility lifecycle flush. Refs that other concerns touch (selection,
 * delete reset) are returned explicitly.
 */
export interface UseInboxDraftsParams {
  canReply: boolean;
  activeChatRef: InboxSharedRefs["activeChatRef"];
  activeChat: InboxChat | null;
}

export function useInboxDrafts({
  canReply,
  activeChatRef,
  activeChat,
}: UseInboxDraftsParams) {
  const [replyText, setReplyTextState] = useState("");
  // Session-scoped draft previews per conversation ("Draft:" in queue rows).
  // Server drafts remain authoritative; this mirrors what the operator has
  // typed (or what loaded) so indicators survive conversation switches.
  const [localDrafts, setLocalDrafts] = useState<Record<string, string>>({});

  const replyTextRef = useRef("");
  const draftEditGenerationRef = useRef(0);
  const draftLoadGenerationRef = useRef(0);
  const draftReadyConversationRef = useRef<string | null>(null);
  const draftWriteQueueRef = useRef(new Map<string, Promise<boolean>>());
  const draftRevisionRef = useRef(new Map<string, number>());

  const setReplyText = useCallback(
    (value: string | ((current: string) => string)) => {
      const resolved =
        typeof value === "function" ? value(replyTextRef.current) : value;
      draftEditGenerationRef.current += 1;
      replyTextRef.current = resolved;
      setReplyTextState(resolved);
      // Track the row-level draft indicator against the conversation whose
      // draft layer is currently live (null during switches → no misattribution).
      const conversationId = draftReadyConversationRef.current;
      if (!conversationId) return;
      setLocalDrafts((drafts) => {
        const next = { ...drafts };
        if (resolved.trim()) next[conversationId] = resolved;
        else delete next[conversationId];
        return next;
      });
    },
    [],
  );

  const persistDraft = useCallback(
    async (conversationId: string, body: string) => {
      if (!canReply) return false;
      let revision = (draftRevisionRef.current.get(conversationId) ?? 0) + 1;
      draftRevisionRef.current.set(conversationId, revision);
      const previous =
        draftWriteQueueRef.current.get(conversationId) ?? Promise.resolve(true);
      const write = previous.catch(() => false).then(async () => {
        for (let attempt = 0; attempt < DRAFT_WRITE_ATTEMPTS; attempt += 1) {
          try {
            const response = await fetch(
              `/api/conversations/${encodeURIComponent(conversationId)}/draft`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body, revision }),
              },
            );
            if (!response.ok) return false;
            const data = (await response.json()) as {
              applied?: unknown;
              revision?: unknown;
            };
            if (
              typeof data.revision !== "number" ||
              !Number.isSafeInteger(data.revision) ||
              data.revision < 0
            ) {
              return false;
            }
            draftRevisionRef.current.set(
              conversationId,
              Math.max(
                data.revision,
                draftRevisionRef.current.get(conversationId) ?? 0,
              ),
            );
            if (data.applied === true) return true;
            revision =
              Math.max(
                data.revision,
                draftRevisionRef.current.get(conversationId) ?? 0,
              ) + 1;
            draftRevisionRef.current.set(conversationId, revision);
          } catch {
            return false;
          }
        }
        return false;
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
      const isCurrentDraft = () =>
        generation === draftLoadGenerationRef.current &&
        activeChatRef.current?.conversationId === chat.conversationId;

      let pendingWrite = draftWriteQueueRef.current.get(chat.conversationId);
      while (pendingWrite) {
        await pendingWrite.catch(() => false);
        const nextWrite = draftWriteQueueRef.current.get(chat.conversationId);
        if (!nextWrite || nextWrite === pendingWrite) break;
        pendingWrite = nextWrite;
      }
      if (!isCurrentDraft()) return;

      let response: Response | null = null;
      for (let attempt = 0; attempt < DRAFT_LOAD_ATTEMPTS; attempt += 1) {
        if (!isCurrentDraft()) return;
        try {
          const candidate = await fetch(
            `/api/conversations/${encodeURIComponent(chat.conversationId)}/draft`,
            { cache: "no-store" },
          );
          if (candidate.ok) {
            response = candidate;
            break;
          }
        } catch {
        }
        if (!isCurrentDraft()) return;
        if (attempt + 1 < DRAFT_LOAD_ATTEMPTS) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, DRAFT_LOAD_RETRY_MS),
          );
        }
      }
      if (!response || !isCurrentDraft()) return;

      const data = (await response.json()) as {
        body?: unknown;
        revision?: unknown;
      };
      if (
        !isCurrentDraft() ||
        typeof data.body !== "string" ||
        typeof data.revision !== "number" ||
        !Number.isSafeInteger(data.revision) ||
        data.revision < 0
      ) {
        return;
      }
      draftRevisionRef.current.set(
        chat.conversationId,
        Math.max(
          data.revision,
          draftRevisionRef.current.get(chat.conversationId) ?? 0,
        ),
      );
      draftReadyConversationRef.current = chat.conversationId;
      if (draftEditGenerationRef.current === editGeneration) {
        const draftBody = data.body;
        replyTextRef.current = draftBody;
        setReplyTextState(draftBody);
        setLocalDrafts((drafts) => {
          const next = { ...drafts };
          if (draftBody.trim()) next[chat.conversationId] = draftBody;
          else delete next[chat.conversationId];
          return next;
        });
      } else {
        void persistDraft(chat.conversationId, replyTextRef.current);
      }
    },
    [activeChatRef, canReply, persistDraft],
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
    void fetch(
      `/api/conversations/${encodeURIComponent(chat.conversationId)}/draft`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyTextRef.current, revision }),
        keepalive: true,
      },
    ).catch(() => undefined);
  }, [activeChatRef, canReply]);

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

  return {
    replyText,
    setReplyText,
    localDrafts,
    persistDraft,
    loadDraft,
    replyTextRef,
    draftLoadGenerationRef,
    draftReadyConversationRef,
  };
}
