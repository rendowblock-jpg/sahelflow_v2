"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AiActionDecisionView,
  AiActionProposalHandle,
  AiActionProposalInboxHandle,
  AiActionProposalProjection,
  AiCapabilitiesPayload,
  AiMessageView,
  AiSessionSummary,
  AiSetupState,
  AiToolCallView,
  AiWorkspaceError,
  AiWorkspaceErrorCode,
} from "@/components/ai/ai-workspace-types";
import { parseTurnSignal } from "@/components/ai/ai-workspace-types";
import { useI18n } from "@/hooks/use-i18n";
import {
  getAiWorkspaceCopy,
  type AiWorkspaceCopyKey,
  type AiWorkspaceLocale,
} from "@/lib/i18n/ai-workspace";

function parseToolCalls(messageId: string, raw: string | null): AiToolCallView[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry, index) => {
      if (!entry || typeof entry !== "object") return [];
      const record = entry as Record<string, unknown>;
      if (typeof record.name !== "string") return [];
      const result = record.result;
      const failed = Boolean(
        result &&
          typeof result === "object" &&
          typeof (result as Record<string, unknown>).error === "string",
      );
      return [
        {
          id: `${messageId}:tool:${index}`,
          name: record.name,
          args:
            record.args && typeof record.args === "object"
              ? (record.args as Record<string, unknown>)
              : {},
          result,
          state: failed ? "failed" : "complete",
        } satisfies AiToolCallView,
      ];
    });
  } catch {
    return [];
  }
}

function errorCode(value: unknown, fallback: AiWorkspaceErrorCode): AiWorkspaceError {
  if (!value || typeof value !== "object") return { code: fallback };
  const record = value as Record<string, unknown>;
  const rawCode = typeof record.error === "string" ? record.error : null;
  const normalizedCode =
    rawCode === "consent_required" ? "AI_CONSENT_REQUIRED" : rawCode;
  const allowed: AiWorkspaceErrorCode[] = [
    "AI_CONSENT_REQUIRED",
    "AI_LICENSE_REQUIRED",
    "AI_RATE_LIMITED",
    "AI_INVALID_MESSAGE",
    "AI_INVALID_REQUEST",
    "AI_SESSION_NOT_FOUND",
    "AI_RESPONSE_NOT_PERSISTED",
    "AI_PROVIDER_UNAVAILABLE",
    "AI_SESSION_LOAD_FAILED",
    "AI_SESSION_CREATE_FAILED",
    "AI_STREAM_TIMEOUT",
    "AI_INTERNAL_ERROR",
  ];
  return {
    code:
      normalizedCode && allowed.includes(normalizedCode as AiWorkspaceErrorCode)
        ? (normalizedCode as AiWorkspaceErrorCode)
        : fallback,
    detail:
      typeof record.reason === "string"
        ? record.reason
        : typeof record.message === "string"
          ? record.message
          : null,
  };
}

function proposalEvent(value: unknown): AiActionProposalHandle | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    record.pending_action_proposal !== true ||
    typeof record.proposalDigest !== "string" ||
    !record.proposal ||
    typeof record.proposal !== "object"
  ) {
    return null;
  }
  return {
    proposal: record.proposal as unknown as AiActionProposalProjection,
    proposalDigest: record.proposalDigest,
  };
}

function mergeProposal(
  current: AiActionProposalHandle[],
  next: AiActionProposalHandle,
): AiActionProposalHandle[] {
  const existing = current.findIndex(
    (entry) => entry.proposal.id === next.proposal.id,
  );
  if (existing < 0) return [next, ...current];
  return current.map((entry, index) => (index === existing ? next : entry));
}

export function useAiWorkspace() {
  const { locale: rawLocale } = useI18n();
  const locale = rawLocale as AiWorkspaceLocale;
  const copy = useCallback(
    (key: AiWorkspaceCopyKey, params?: Record<string, string | number>) =>
      getAiWorkspaceCopy(locale, key, params),
    [locale],
  );

  const [sessions, setSessions] = useState<AiSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessageView[]>([]);
  const [proposals, setProposals] = useState<AiActionProposalHandle[]>([]);
  const [inbox, setInbox] = useState<AiActionProposalInboxHandle[]>([]);
  const [inboxDecisions, setInboxDecisions] = useState<AiActionDecisionView[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyCapped, setHistoryCapped] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [setup, setSetup] = useState<AiSetupState | null>(null);
  const [setupError, setSetupError] = useState(false);
  // Ledger F-06: capability truth + shop briefing — loaded once per mount,
  // refreshable with the workspace retry. Distinguishes "still loading" from
  // "unavailable" so the page never fakes either state.
  const [capabilities, setCapabilities] = useState<AiCapabilitiesPayload | null>(null);
  const [capabilitiesError, setCapabilitiesError] = useState(false);
  const [loadingCapabilities, setLoadingCapabilities] = useState(true);
  const [actionHistoryError, setActionHistoryError] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [sending, setSending] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [approvingProposalId, setApprovingProposalId] = useState<string | null>(null);
  const [rejectingProposalId, setRejectingProposalId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [error, setError] = useState<AiWorkspaceError | null>(null);

  const streamAbortRef = useRef<AbortController | null>(null);
  const conversationAbortRef = useRef<AbortController | null>(null);
  const conversationGenerationRef = useRef(0);
  const toolSequenceRef = useRef(0);
  const historyGenerationRef = useRef(0);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );

  const loadSetup = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/ai/status", {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error(`status:${response.status}`);
      const data = (await response.json()) as AiSetupState;
      setSetup(data);
      setSetupError(false);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setSetupError(true);
    }
  }, []);

  const loadSessions = useCallback(
    async (options?: { signal?: AbortSignal; preserveError?: boolean }) => {
      try {
        const response = await fetch("/api/ai/sessions", {
          cache: "no-store",
          signal: options?.signal,
        });
        if (!response.ok) throw new Error(`sessions:${response.status}`);
        const data = (await response.json()) as { sessions?: AiSessionSummary[] };
        const next = Array.isArray(data.sessions) ? data.sessions : [];
        setSessions(next);
        setActiveSessionId((current) => {
          if (current && next.some((session) => session.id === current)) return current;
          return next[0]?.id ?? null;
        });
        if (next.length === 0) {
          setMessages([]);
          setProposals([]);
          setActionHistoryError(false);
        }
        if (!options?.preserveError) setError(null);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError({ code: "AI_SESSION_LOAD_FAILED" });
      } finally {
        setLoadingSessions(false);
      }
    },
    [],
  );

  /**
   * Ledger AI-19/AI-20: shop-wide proposal inbox — pending proposals across
   * ALL sessions plus the recent approve/deny/execution timeline.
   */
  const loadInbox = useCallback(async (signal?: AbortSignal) => {
    setInboxLoading(true);
    try {
      const response = await fetch("/api/ai/actions", {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error(`inbox:${response.status}`);
      const data = (await response.json()) as {
        pending?: AiActionProposalInboxHandle[];
        recent?: AiActionDecisionView[];
      };
      setInbox(Array.isArray(data.pending) ? data.pending : []);
      setInboxDecisions(Array.isArray(data.recent) ? data.recent : []);
      setInboxError(false);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setInboxError(true);
    } finally {
      setInboxLoading(false);
    }
  }, []);

  const loadCapabilities = useCallback(async (signal?: AbortSignal) => {
    setLoadingCapabilities(true);
    try {
      const response = await fetch("/api/ai/capabilities", {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error(`capabilities:${response.status}`);
      const data = (await response.json()) as Partial<AiCapabilitiesPayload>;
      setCapabilities({
        groups: Array.isArray(data.groups) ? data.groups : [],
        briefing: data.briefing ?? {
          pendingOrders: null,
          ordersToday: null,
          lowStockProducts: null,
          pendingDeliveries: null,
          pendingProposals: null,
        },
      });
      setCapabilitiesError(false);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setCapabilities(null);
      setCapabilitiesError(true);
    } finally {
      setLoadingCapabilities(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void Promise.all([
        loadSetup(controller.signal),
        loadSessions({ signal: controller.signal }),
        loadInbox(controller.signal),
        loadCapabilities(controller.signal),
      ]);
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [loadCapabilities, loadInbox, loadSessions, loadSetup]);

  const loadConversation = useCallback(async (sessionId: string) => {
    conversationAbortRef.current?.abort();
    const controller = new AbortController();
    conversationAbortRef.current = controller;
    const generation = ++conversationGenerationRef.current;
    historyGenerationRef.current = generation;
    setLoadingConversation(true);
    setEditingMessageId(null);
    try {
      const [messagesResponse, actionsResponse] = await Promise.all([
        fetch(`/api/ai/sessions/${encodeURIComponent(sessionId)}/messages`, {
          cache: "no-store",
          signal: controller.signal,
        }),
        fetch(`/api/ai/sessions/${encodeURIComponent(sessionId)}/actions`, {
          cache: "no-store",
          signal: controller.signal,
        }),
      ]);
      if (generation !== conversationGenerationRef.current) return;
      if (!messagesResponse.ok) {
        const body = await messagesResponse.json().catch(() => ({}));
        throw errorCode(body, "AI_SESSION_LOAD_FAILED");
      }
      const messageData = (await messagesResponse.json()) as {
        session?: {
          messages?: Array<{
            id: string;
            role: string;
            content: string;
            toolCalls: string | null;
            createdAt: string;
          }>;
        };
        hasMore?: boolean;
        nextCursor?: string | null;
      };
      setMessages(
        (messageData.session?.messages ?? []).map(
          (message): AiMessageView => ({
            id: message.id,
            role: message.role === "assistant" ? "assistant" : "user",
            content: message.content,
            createdAt: message.createdAt,
            toolCalls: parseToolCalls(message.id, message.toolCalls),
          }),
        ),
      );
      // Ledger AI-08: the recent window is a cursor page — remember whether
      // older history exists so the canvas can offer an honest "load earlier".
      setHistoryCapped(messageData.hasMore === true);
      setHistoryCursor(messageData.nextCursor ?? null);

      if (actionsResponse.ok) {
        const actionData = (await actionsResponse.json()) as {
          proposals?: AiActionProposalHandle[];
        };
        setProposals(
          Array.isArray(actionData.proposals) ? actionData.proposals : [],
        );
        setActionHistoryError(false);
      } else {
        setActionHistoryError(true);
      }
      setError(null);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      if (caught && typeof caught === "object" && "code" in caught) {
        setError(caught as AiWorkspaceError);
      } else {
        setError({ code: "AI_SESSION_LOAD_FAILED" });
      }
    } finally {
      if (generation === conversationGenerationRef.current) {
        setLoadingConversation(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    const timeoutId = window.setTimeout(() => {
      void loadConversation(activeSessionId);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeSessionId, loadConversation]);

  /** Ledger AI-08: prepend the next older cursor page of durable history. */
  const loadOlderMessages = useCallback(async () => {
    const sessionId = activeSessionId;
    const cursor = historyCursor;
    if (!sessionId || !cursor || loadingOlderMessages) return false;
    const generation = historyGenerationRef.current;
    setLoadingOlderMessages(true);
    try {
      const response = await fetch(
        `/api/ai/sessions/${encodeURIComponent(sessionId)}/messages?cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`older:${response.status}`);
      const data = (await response.json()) as {
        session?: {
          messages?: Array<{
            id: string;
            role: string;
            content: string;
            toolCalls: string | null;
            createdAt: string;
          }>;
        };
        hasMore?: boolean;
        nextCursor?: string | null;
      };
      if (generation !== historyGenerationRef.current) return false;
      const older = (data.session?.messages ?? []).map(
        (message): AiMessageView => ({
          id: message.id,
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.content,
          createdAt: message.createdAt,
          toolCalls: parseToolCalls(message.id, message.toolCalls),
        }),
      );
      if (older.length > 0) {
        setMessages((current) => [...older, ...current]);
      }
      setHistoryCapped(data.hasMore === true);
      setHistoryCursor(data.nextCursor ?? null);
      return true;
    } catch {
      setError({ code: "AI_SESSION_LOAD_FAILED" });
      return false;
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [activeSessionId, historyCursor, loadingOlderMessages]);

  useEffect(
    () => () => {
      conversationAbortRef.current?.abort();
      streamAbortRef.current?.abort();
    },
    [],
  );

  const selectSession = useCallback(
    (sessionId: string) => {
      streamAbortRef.current?.abort();
      setSending(false);
      if (sessionId !== activeSessionId) {
        setMessages([]);
        setProposals([]);
        setActionHistoryError(false);
        setHistoryCapped(false);
        setHistoryCursor(null);
        setEditingMessageId(null);
      }
      setActiveSessionId(sessionId);
    },
    [activeSessionId],
  );

  const createSession = useCallback(async () => {
    if (creatingSession) return null;
    setCreatingSession(true);
    try {
      const response = await fetch("/api/ai/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error(`create:${response.status}`);
      const data = (await response.json()) as { session: AiSessionSummary };
      setSessions((current) => [data.session, ...current]);
      setActiveSessionId(data.session.id);
      setMessages([]);
      setProposals([]);
      setActionHistoryError(false);
      setError(null);
      return data.session.id;
    } catch {
      setError({ code: "AI_SESSION_CREATE_FAILED" });
      return null;
    } finally {
      setCreatingSession(false);
    }
  }, [creatingSession]);

  const stop = useCallback(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    setSending(false);
    setMessages((current) =>
      current.map((message) =>
        message.streaming
          ? { ...message, streaming: false, interrupted: true }
          : message,
      ),
    );
  }, []);

  // Ledger AI-13: one durable quality row per assistant answer. Optimistic
  // on the live view; the opposite thumb overwrites, the active thumb
  // deletes ("none"). Failures roll the optimistic state back honestly.
  const sendFeedback = useCallback(
    async (messageId: string, value: "up" | "down" | "none") => {
      const sessionId = activeSessionId;
      if (!sessionId) return false;
      const previous = messages.find(
        (message) => message.id === messageId,
      )?.feedback;
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, feedback: value === "none" ? null : value }
            : message,
        ),
      );
      try {
        const response = await fetch(
          `/api/ai/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/feedback`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value }),
          },
        );
        if (!response.ok) throw new Error(String(response.status));
        return true;
      } catch {
        setMessages((current) =>
          current.map((message) =>
            message.id === messageId ? { ...message, feedback: previous ?? null } : message,
          ),
        );
        return false;
      }
    },
    [activeSessionId, messages],
  );

  const send = useCallback(
    async (rawMessage: string) => {
      const userMessage = rawMessage.trim();
      const sessionId = activeSessionId;
      if (
        !userMessage ||
        !sessionId ||
        sending ||
        setup?.ready !== true
      ) {
        return false;
      }

      const now = Date.now();
      const userId = `local-user:${now}`;
      const assistantId = `local-assistant:${now}`;
      setError(null);
      setSending(true);
      setMessages((current) => [
        ...current,
        {
          id: userId,
          role: "user",
          content: userMessage,
          createdAt: new Date(now).toISOString(),
          toolCalls: [],
        },
        {
          id: assistantId,
          role: "assistant",
          content: "",
          createdAt: new Date(now + 1).toISOString(),
          toolCalls: [],
          streaming: true,
        },
      ]);

      const controller = new AbortController();
      streamAbortRef.current?.abort();
      streamAbortRef.current = controller;
      let delivered = false;
      // Ledger AI-18: a hung SSE stream must never leave an infinite spinner.
      // A watchdog aborts after ~45s without any stream activity; the abort
      // rides the existing stop path, so the server's persist-on-stop logic
      // (AI-04) keeps the partial answer and the UI shows recoverable state.
      const STREAM_INACTIVITY_TIMEOUT_MS = 45_000;
      let lastActivityAt = Date.now();
      let streamTimedOut = false;
      const streamWatchdogId = window.setInterval(() => {
        if (Date.now() - lastActivityAt > STREAM_INACTIVITY_TIMEOUT_MS) {
          streamTimedOut = true;
          controller.abort();
        }
      }, 5_000);

      try {
        const response = await fetch(
          `/api/ai/sessions/${encodeURIComponent(sessionId)}/messages/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: userMessage, locale }),
            signal: controller.signal,
          },
        );
        if (!response.ok || !response.body) {
          const body = await response.json().catch(() => ({}));
          throw errorCode(body, "AI_PROVIDER_UNAVAILABLE");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          lastActivityAt = Date.now();
          buffer += decoder.decode(value, { stream: true });
          let separator = buffer.indexOf("\n\n");
          while (separator >= 0) {
            const rawEvent = buffer.slice(0, separator);
            buffer = buffer.slice(separator + 2);
            let eventType = "";
            let eventData = "";
            for (const line of rawEvent.split("\n")) {
              if (line.startsWith("event:")) eventType = line.slice(6).trim();
              if (line.startsWith("data:")) eventData = line.slice(5).trim();
            }
            if (eventType && eventData && eventType !== "close") {
              let payload: Record<string, unknown> | null = null;
              try {
                payload = JSON.parse(eventData) as Record<string, unknown>;
              } catch {
                payload = null;
              }
              if (payload) {
                if (eventType === "user_persisted" && typeof payload.id === "string") {
                  // Ledger AI-07/AI-15: swap the optimistic local user id for
                  // the durable row id so regenerate/edit truncation targets
                  // a real persisted message.
                  const persistedUserId = payload.id;
                  setMessages((current) =>
                    current.map((message) =>
                      message.id === userId
                        ? { ...message, id: persistedUserId }
                        : message,
                    ),
                  );
                } else if (
                  eventType === "text_delta" &&
                  typeof payload.text === "string"
                ) {
                  delivered = true;
                  setMessages((current) =>
                    current.map((message) =>
                      message.id === assistantId
                        ? { ...message, content: message.content + payload.text }
                        : message,
                    ),
                  );
                } else if (
                  eventType === "tool_call" &&
                  typeof payload.name === "string"
                ) {
                  const toolId = `${assistantId}:stream:${toolSequenceRef.current++}`;
                  const nextTool: AiToolCallView = {
                    id: toolId,
                    name: payload.name,
                    args:
                      payload.args && typeof payload.args === "object"
                        ? (payload.args as Record<string, unknown>)
                        : {},
                    state: "running",
                  };
                  setMessages((current) =>
                    current.map((message) =>
                      message.id === assistantId
                        ? {
                            ...message,
                            toolCalls: [...message.toolCalls, nextTool],
                          }
                        : message,
                    ),
                  );
                } else if (
                  eventType === "tool_result" &&
                  typeof payload.name === "string"
                ) {
                  setMessages((current) =>
                    current.map((message) => {
                      if (message.id !== assistantId) return message;
                      let matched = false;
                      return {
                        ...message,
                        toolCalls: message.toolCalls.map((tool) => {
                          if (
                            matched ||
                            tool.name !== payload.name ||
                            tool.state !== "running"
                          ) {
                            return tool;
                          }
                          matched = true;
                          const failed = Boolean(
                            payload.result &&
                              typeof payload.result === "object" &&
                              typeof (payload.result as Record<string, unknown>)
                                .error === "string",
                          );
                          return {
                            ...tool,
                            result: payload.result,
                            state: failed ? "failed" : "complete",
                          };
                        }),
                      };
                    }),
                  );
                } else if (eventType === "action_proposal") {
                  const handle = proposalEvent(payload.proposal);
                  if (handle) {
                    setProposals((current) => mergeProposal(current, handle));
                    setActionHistoryError(false);
                  }
                } else if (
                  eventType === "done" &&
                  typeof payload.response === "string"
                ) {
                  delivered = Boolean(payload.response) || delivered;
                  // Ledger AI-26: keep the provider's own turn signal when
                  // present — parseTurnSignal drops anything unshaped, so no
                  // fabricated or malformed value ever reaches the UI.
                  const signal = parseTurnSignal(payload.signal);
                  setMessages((current) =>
                    current.map((message) =>
                      message.id === assistantId
                        ? {
                            ...message,
                            content: payload.response as string,
                            streaming: false,
                            signal,
                          }
                        : message,
                    ),
                  );
                } else if (eventType === "persistence_warning") {
                  setMessages((current) =>
                    current.map((message) =>
                      message.id === assistantId
                        ? {
                            ...message,
                            streaming: false,
                            persistenceWarning: true,
                          }
                        : message,
                    ),
                  );
                  setError({ code: "AI_RESPONSE_NOT_PERSISTED" });
                } else if (eventType === "error") {
                  const detail =
                    typeof payload.message === "string" ? payload.message : null;
                  setError({ code: "AI_PROVIDER_UNAVAILABLE", detail });
                  setMessages((current) =>
                    current.map((message) =>
                      message.id === assistantId
                        ? { ...message, streaming: false, interrupted: true }
                        : message,
                    ),
                  );
                }
              }
            }
            separator = buffer.indexOf("\n\n");
          }
        }
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, streaming: false }
              : message,
          ),
        );
        await loadSessions({ preserveError: true });
        return delivered;
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          if (streamTimedOut) {
            // Ledger AI-18: timeout is recoverable — the partial answer was
            // persisted server-side via the same path as a manual stop.
            setError({ code: "AI_STREAM_TIMEOUT" });
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, streaming: false, interrupted: true }
                  : message,
              ),
            );
          }
          return delivered;
        }
        if (caught && typeof caught === "object" && "code" in caught) {
          setError(caught as AiWorkspaceError);
        } else {
          setError({ code: "AI_PROVIDER_UNAVAILABLE" });
        }
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, streaming: false, interrupted: true }
              : message,
          ),
        );
        return delivered;
      } finally {
        window.clearInterval(streamWatchdogId);
        if (streamAbortRef.current === controller) streamAbortRef.current = null;
        setSending(false);
      }
    },
    [activeSessionId, loadSessions, locale, sending, setup?.ready],
  );

  const lastUserPrompt = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message?.role === "user") return message.content;
    }
    return null;
  }, [messages]);

  const lastMessage = messages[messages.length - 1];
  const canRegenerate =
    lastMessage?.role === "assistant" &&
    lastUserPrompt !== null &&
    !sending &&
    !loadingConversation &&
    setup?.ready === true &&
    activeSessionId !== null;

  /**
   * Ledger AI-07/AI-15: server-authoritative truncation of the conversation
   * tail after (and, when re-sending, including) one user message. The client
   * state is updated optimistically and rolled back if the endpoint refuses.
   */
  const truncateAfter = useCallback(
    async (sessionId: string, messageId: string, includeMessage: boolean) => {
      const response = await fetch(
        `/api/ai/sessions/${encodeURIComponent(sessionId)}/messages/truncate-after`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ afterMessageId: messageId, includeMessage }),
        },
      ).catch(() => null);
      return Boolean(response?.ok);
    },
    [],
  );

  /**
   * Regenerate replaces the trailing exchange IN PLACE (ledger AI-07): the
   * previous answer — and the user turn that triggered it — are truncated on
   * the server, then the same prompt is re-sent through the established
   * stream path as a fresh exchange.
   */
  const regenerate = useCallback(async () => {
    if (!canRegenerate || !lastUserPrompt) return false;
    const sessionId = activeSessionId;
    if (!sessionId) return false;
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "user") {
        lastUserIndex = i;
        break;
      }
    }
    const target = lastUserIndex >= 0 ? messages[lastUserIndex] : null;
    if (!target) return false;
    const snapshot = messages;
    setMessages(messages.slice(0, lastUserIndex));
    const truncated = await truncateAfter(sessionId, target.id, true);
    if (!truncated) {
      setMessages(snapshot);
      setError({ code: "AI_INTERNAL_ERROR" });
      return false;
    }
    return send(lastUserPrompt);
  }, [
    activeSessionId,
    canRegenerate,
    lastUserPrompt,
    messages,
    send,
    truncateAfter,
  ]);

  /** Ledger AI-15: mark a user message as being edited (composer prefill). */
  const beginEditMessage = useCallback(
    (messageId: string) => {
      if (sending || loadingConversation || setup?.ready !== true) return;
      setEditingMessageId(messageId);
    },
    [loadingConversation, sending, setup?.ready],
  );

  const cancelEditMessage = useCallback(() => {
    setEditingMessageId(null);
  }, []);

  /**
   * Ledger AI-15: resend an edited earlier user message — truncates that
   * message and everything after it on the server, then streams the edited
   * text as a fresh exchange. Optimistic like regenerate, with rollback.
   */
  const editAndResend = useCallback(
    async (messageId: string, rawContent: string) => {
      const content = rawContent.trim();
      const sessionId = activeSessionId;
      if (!content || !sessionId || sending || setup?.ready !== true) {
        return false;
      }
      const targetIndex = messages.findIndex(
        (message) => message.id === messageId && message.role === "user",
      );
      if (targetIndex < 0) return false;
      const snapshot = messages;
      setEditingMessageId(null);
      setMessages(messages.slice(0, targetIndex));
      const truncated = await truncateAfter(sessionId, messageId, true);
      if (!truncated) {
        setMessages(snapshot);
        setError({ code: "AI_INTERNAL_ERROR" });
        return false;
      }
      return send(content);
    },
    [activeSessionId, messages, send, sending, setup?.ready, truncateAfter],
  );

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const trimmed = title.trim().slice(0, 160);
    if (!trimmed) return false;
    setRenamingSessionId(sessionId);
    try {
      const response = await fetch(
        `/api/ai/sessions/${encodeURIComponent(sessionId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmed }),
        },
      );
      if (!response.ok) throw new Error(`rename:${response.status}`);
      const data = (await response.json()) as {
        session?: { id: string; title: string | null };
      };
      const nextTitle = data.session?.title ?? trimmed;
      setSessions((current) =>
        current.map((session) =>
          session.id === sessionId ? { ...session, title: nextTitle } : session,
        ),
      );
      return true;
    } catch {
      return false;
    } finally {
      setRenamingSessionId(null);
    }
  }, []);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      setDeletingSessionId(sessionId);
      try {
        const response = await fetch(
          `/api/ai/sessions/${encodeURIComponent(sessionId)}`,
          { method: "DELETE" },
        );
        if (!response.ok) throw new Error(`delete:${response.status}`);
        setSessions((current) =>
          current.filter((session) => session.id !== sessionId),
        );
        if (activeSessionId === sessionId) {
          streamAbortRef.current?.abort();
          setSending(false);
          setMessages([]);
          setProposals([]);
          setActionHistoryError(false);
          // Re-run the list authority so the next remaining session (if any)
          // becomes active and its conversation loads.
          await loadSessions({ preserveError: true });
        }
        return true;
      } catch {
        return false;
      } finally {
        setDeletingSessionId(null);
      }
    },
    [activeSessionId, loadSessions],
  );

  const approveProposal = useCallback(
    async (handle: AiActionProposalHandle, reason?: string) => {
      if (approvingProposalId) return false;
      setApprovingProposalId(handle.proposal.id);
      try {
        const response = await fetch(
          `/api/ai/actions/${encodeURIComponent(handle.proposal.id)}/approve`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              proposalDigest: handle.proposalDigest,
              ...(reason?.trim() ? { reason: reason.trim() } : {}),
            }),
          },
        );
        const data = (await response.json().catch(() => ({}))) as {
          proposal?: AiActionProposalProjection;
          error?: string;
          message?: string;
          code?: string;
        };
        if (!response.ok || !data.proposal) {
          throw new Error(
            data.message ?? data.error ?? data.code ?? "approval failed",
          );
        }
        const proposal = data.proposal;
        const foreignSessionId = (handle as { sessionId?: string }).sessionId;
        if (!foreignSessionId || foreignSessionId === activeSessionId) {
          setProposals((current) =>
            mergeProposal(current, { ...handle, proposal }),
          );
        }
        // Ledger AI-19: the approved proposal leaves the shop-wide inbox.
        setInbox((current) =>
          current.filter((entry) => entry.proposal.id !== handle.proposal.id),
        );
        setActionHistoryError(false);
        // Ledger AI-19: the shop-wide inbox reflects the decision too.
        void loadInbox();
        return true;
      } catch (caught) {
        const response = await fetch(
          `/api/ai/actions/${encodeURIComponent(handle.proposal.id)}`,
          { cache: "no-store" },
        ).catch(() => null);
        if (response?.ok) {
          const refreshed = (await response.json()) as AiActionProposalHandle;
          setProposals((current) => mergeProposal(current, refreshed));
        }
        setError({
          code: "AI_INTERNAL_ERROR",
          detail: caught instanceof Error ? caught.message : null,
        });
        return false;
      } finally {
        setApprovingProposalId(null);
      }
    },
    [activeSessionId, approvingProposalId, loadInbox],
  );

  /** Ledger AI-03: one-click deny — terminal, never executes. */
  const rejectProposal = useCallback(
    async (handle: AiActionProposalHandle) => {
      if (rejectingProposalId) return false;
      setRejectingProposalId(handle.proposal.id);
      try {
        const response = await fetch(
          `/api/ai/actions/${encodeURIComponent(handle.proposal.id)}/reject`,
          { method: "POST" },
        );
        if (!response.ok) throw new Error(`reject:${response.status}`);
        // Terminal locally: drop it from the live queue (history keeps the
        // row server-side via /actions).
        setProposals((current) =>
          current.filter((entry) => entry.proposal.id !== handle.proposal.id),
        );
        // Ledger AI-19: drop it from the cross-session inbox too.
        setInbox((current) =>
          current.filter((entry) => entry.proposal.id !== handle.proposal.id),
        );
        void loadInbox();
        return true;
      } catch {
        const refreshed = await fetch(
          `/api/ai/actions/${encodeURIComponent(handle.proposal.id)}`,
          { cache: "no-store" },
        )
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null);
        if (refreshed) {
          setProposals((current) => mergeProposal(current, refreshed as AiActionProposalHandle));
        }
        setError({ code: "AI_INTERNAL_ERROR" });
        return false;
      } finally {
        setRejectingProposalId(null);
      }
    },
    [loadInbox, rejectingProposalId],
  );

  const retry = useCallback(async () => {
    setError(null);
    await Promise.all([loadSetup(), loadSessions(), loadInbox(), loadCapabilities()]);
    if (activeSessionId) await loadConversation(activeSessionId);
  }, [activeSessionId, loadCapabilities, loadConversation, loadInbox, loadSessions, loadSetup]);
  return {
    locale,
    copy,
    sessions,
    activeSession,
    activeSessionId,
    messages,
    proposals,
    inbox,
    inboxDecisions,
    inboxLoading,
    inboxError,
    refreshInbox: loadInbox,
    historyCapped,
    loadingOlderMessages,
    loadOlderMessages,
    editingMessageId,
    beginEditMessage,
    cancelEditMessage,
    editAndResend,
    setup,
    setupError,
    capabilities,
    capabilitiesError,
    loadingCapabilities,
    actionHistoryError,
    loadingSessions,
    loadingConversation,
    creatingSession,
    sending,
    approvingProposalId,
    rejectingProposalId,
    renamingSessionId,
    deletingSessionId,
    error,
    canRegenerate,
    selectSession,
    createSession,
    send,
    stop,
    regenerate,
    renameSession,
    deleteSession,
    sendFeedback,
    approveProposal,
    rejectProposal,
    retry,
    refreshSetup: loadSetup,
  };
}
