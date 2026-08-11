"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AiActionProposalHandle,
  AiActionProposalProjection,
  AiMessageView,
  AiSessionSummary,
  AiSetupState,
  AiToolCallView,
  AiWorkspaceError,
  AiWorkspaceErrorCode,
} from "@/components/ai/ai-workspace-types";
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
  const [setup, setSetup] = useState<AiSetupState | null>(null);
  const [setupError, setSetupError] = useState(false);
  const [actionHistoryError, setActionHistoryError] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [sending, setSending] = useState(false);
  const [approvingProposalId, setApprovingProposalId] = useState<string | null>(null);
  const [error, setError] = useState<AiWorkspaceError | null>(null);

  const streamAbortRef = useRef<AbortController | null>(null);
  const conversationAbortRef = useRef<AbortController | null>(null);
  const conversationGenerationRef = useRef(0);
  const toolSequenceRef = useRef(0);

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

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void Promise.all([
        loadSetup(controller.signal),
        loadSessions({ signal: controller.signal }),
      ]);
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [loadSessions, loadSetup]);

  const loadConversation = useCallback(async (sessionId: string) => {
    conversationAbortRef.current?.abort();
    const controller = new AbortController();
    conversationAbortRef.current = controller;
    const generation = ++conversationGenerationRef.current;
    setLoadingConversation(true);
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
                if (
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
                  setMessages((current) =>
                    current.map((message) =>
                      message.id === assistantId
                        ? {
                            ...message,
                            content: payload.response as string,
                            streaming: false,
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
        if (streamAbortRef.current === controller) streamAbortRef.current = null;
        setSending(false);
      }
    },
    [activeSessionId, loadSessions, locale, sending, setup?.ready],
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
        setProposals((current) =>
          mergeProposal(current, { ...handle, proposal }),
        );
        setActionHistoryError(false);
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
    [approvingProposalId],
  );

  const retry = useCallback(async () => {
    setError(null);
    await Promise.all([loadSetup(), loadSessions()]);
    if (activeSessionId) await loadConversation(activeSessionId);
  }, [activeSessionId, loadConversation, loadSessions, loadSetup]);

  return {
    locale,
    copy,
    sessions,
    activeSession,
    activeSessionId,
    messages,
    proposals,
    setup,
    setupError,
    actionHistoryError,
    loadingSessions,
    loadingConversation,
    creatingSession,
    sending,
    approvingProposalId,
    error,
    selectSession,
    createSession,
    send,
    stop,
    approveProposal,
    retry,
    refreshSetup: loadSetup,
  };
}
