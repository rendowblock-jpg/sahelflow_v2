"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { RefObject } from "react";
import type { InboxMessage } from "@/components/inbox/inbox-workspace-types";
import type { InboxWorkspaceCopy } from "@/hooks/inbox/inbox-workspace-shared";
import { toast } from "@/lib/toast";

type UseInboxThreadViewParams = {
  /** The conversation's durable message projection (already page-bounded). */
  messages: InboxMessage[];
  /** Render-phase reset key: the conversation the view is mounted for. */
  activeConversationKey: string | null;
  /** Shared list ref (INB-27): injected once by the workspace hook. */
  messagesInnerRef: RefObject<HTMLDivElement | null>;
  copy: InboxWorkspaceCopy;
};

/**
 * In-thread view state (INB-11 + the WhatsApp search pattern): the render
 * window that bounds what the DOM materializes, the match bar state that
 * cycles through in-thread search hits, and the jump/highlight plumbing both
 * feed on. Extracted verbatim from inbox-v3-thread.tsx (STR-01) — the
 * component composes this hook and keeps the JSX-owned decisions.
 */
export function useInboxThreadView({
  messages,
  activeConversationKey,
  messagesInnerRef,
  copy,
}: UseInboxThreadViewParams) {
  // ── In-thread search (WhatsApp pattern): header magnifier → match bar with
  // n/N counter, prev/next cycling, soft highlight in bubbles, Esc to close.
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
  const [threadSearchIndex, setThreadSearchIndex] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const highlightTimerRef = useRef<number | null>(null);

  // Conversation-scoped UI state resets via the documented render-phase key
  // reset (react.dev "You might not need an Effect") — no cascading renders.
  const [searchResetKey, setSearchResetKey] = useState(activeConversationKey);
  if (searchResetKey !== activeConversationKey) {
    setSearchResetKey(activeConversationKey);
    setThreadSearchOpen(false);
    setThreadSearchQuery("");
    setThreadSearchIndex(0);
    setHighlightedMessageId(null);
  }

  // Timer cleanup stays in an effect: it disposes an external resource on
  // conversation switch/unmount without touching state.
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };
  }, [activeConversationKey]);

  const normalizedThreadQuery = threadSearchQuery.trim().toLowerCase();
  const threadMatchIds = useMemo(() => {
    if (normalizedThreadQuery.length < 2) return [] as string[];
    return messages
      .filter((message) =>
        message.body.toLowerCase().includes(normalizedThreadQuery),
      )
      .map((message) => message.id);
  }, [messages, normalizedThreadQuery]);
  const threadMatchCount = threadMatchIds.length;
  const safeThreadIndex =
    threadMatchCount > 0
      ? ((threadSearchIndex % threadMatchCount) + threadMatchCount) %
        threadMatchCount
      : 0;

  // Ledger INB-11: render-window virtualization. The durable page (composite
  // cursor) bounds what the server returns; the render window bounds what the
  // DOM materializes. The window is bottom-anchored (the WhatsApp reading
  // position), grows in steps while the top sentinel is approached, and snaps
  // to the full thread when a search/quote jump targets hidden history.
  const RENDER_WINDOW_INITIAL = 80;
  const RENDER_WINDOW_STEP = 60;
  const [renderWindow, setRenderWindow] = useState(RENDER_WINDOW_INITIAL);
  const renderWindowSentinelRef = useRef<HTMLDivElement | null>(null);
  const renderAnchorRef = useRef<number | null>(null);
  const pendingJumpRef = useRef<string | null>(null);

  // Conversation switch resets the window during the render it reacts to
  // (adjust-state-on-change, no cascading effect render).
  const [prevWindowKey, setPrevWindowKey] = useState(activeConversationKey);
  if (prevWindowKey !== activeConversationKey) {
    setPrevWindowKey(activeConversationKey);
    setRenderWindow(RENDER_WINDOW_INITIAL);
  }

  const visibleStart =
    messages.length > renderWindow ? messages.length - renderWindow : 0;
  const windowExhausted = visibleStart === 0;
  const visibleMessages = useMemo(
    () => (windowExhausted ? messages : messages.slice(visibleStart)),
    [messages, visibleStart, windowExhausted],
  );

  // Scroll anchor: growing the window prepends bubbles, so the viewport is
  // re-anchored by the exact height delta after the DOM commits.
  useLayoutEffect(() => {
    const anchor = renderAnchorRef.current;
    renderAnchorRef.current = null;
    if (anchor === null) return;
    const viewport = messagesInnerRef.current?.parentElement;
    if (!viewport) return;
    viewport.scrollTo({
      top: viewport.scrollTop + (viewport.scrollHeight - anchor),
    });
  }, [renderWindow, visibleStart]);

  // Deferred jump: a target outside the window first materializes the full
  // thread, then the jump completes after the DOM commits.
  useLayoutEffect(() => {
    const pending = pendingJumpRef.current;
    if (!pending) return;
    const element = messagesInnerRef.current?.querySelector(
      `[data-message-id="${CSS.escape(pending)}"]`,
    );
    if (!element) return;
    pendingJumpRef.current = null;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(pending);
    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(
      () => setHighlightedMessageId(null),
      2_200,
    );
  }, [messages, renderWindow]);

  useEffect(() => {
    if (windowExhausted) return;
    const sentinel = renderWindowSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        const viewport = messagesInnerRef.current?.parentElement;
        renderAnchorRef.current = viewport ? viewport.scrollHeight : null;
        setRenderWindow((current) => current + RENDER_WINDOW_STEP);
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [windowExhausted, activeConversationKey]);

  const jumpToMessage = useCallback(
    (messageId: string): boolean => {
      const element = messagesInnerRef.current?.querySelector(
        `[data-message-id="${CSS.escape(messageId)}"]`,
      );
      if (!element) {
        // Ledger INB-11: the target may sit outside the render window —
        // materialize it and complete the jump after the DOM commit.
        if (messages.length > renderWindow) {
          pendingJumpRef.current = messageId;
          renderAnchorRef.current = null;
          setRenderWindow(messages.length);
          return true;
        }
        return false;
      }
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMessageId(messageId);
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = window.setTimeout(
        () => setHighlightedMessageId(null),
        2_200,
      );
      return true;
    },
    [messages.length, messagesInnerRef, renderWindow],
  );

  const gotoThreadMatch = (delta: number) => {
    if (threadMatchCount === 0) return;
    const nextIndex = (safeThreadIndex + delta + threadMatchCount) % threadMatchCount;
    setThreadSearchIndex(nextIndex);
    const targetId = threadMatchIds[nextIndex];
    if (targetId && !jumpToMessage(targetId)) {
      toast.warning(copy("quoteNotLoaded"));
    }
  };

  const messageIdSet = useMemo(
    () => new Set(messages.map((message) => message.id)),
    [messages],
  );
  return {
    threadSearchOpen,
    setThreadSearchOpen,
    threadSearchQuery,
    setThreadSearchQuery,
    normalizedThreadQuery,
    setThreadSearchIndex,
    threadMatchIds,
    threadMatchCount,
    safeThreadIndex,
    gotoThreadMatch,
    highlightedMessageId,
    visibleStart,
    windowExhausted,
    visibleMessages,
    renderWindowSentinelRef,
    messageIdSet,
    jumpToMessage,
  };
}
