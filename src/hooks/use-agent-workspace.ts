"use client";

/**
 * useAgentWorkspace — client hook for the MCP-native agent surface.
 *
 * Manages session state, message history, tool call visualization, proposal
 * lifecycle, and SSE streaming from the agent API.
 */

import { useCallback, useRef, useState } from "react";

import type { AgentMessageView } from "@/components/agents/agent-message-bubble";
import type { AgentProposalView } from "@/components/agents/agent-proposal-card";
import type { AgentSessionSummary } from "@/components/agents/agent-sidebar";
import type { AgentToolCallView } from "@/components/agents/agent-tool-card";

// ─── SSE event types (mirrors AgentStreamEvent) ──────────────────────────────

interface SseToolCallStart {
  type: "tool_call_start";
  name: string;
  args: Record<string, unknown>;
}

interface SseToolCallEnd {
  type: "tool_call_end";
  name: string;
  result: { text: string; structuredContent?: Record<string, unknown>; isError?: boolean };
  durationMs: number;
}

interface SseTextDelta {
  type: "text_delta";
  text: string;
}

interface SseProposal {
  type: "proposal";
  proposal: { proposalId: string; proposalDigest: string; tool: string; args: Record<string, unknown> };
}

interface SseTurnSignal {
  type: "turn_signal";
  signal: { model: string; promptTokens?: number; candidateTokens?: number; totalTokens?: number };
}

interface SseDone {
  type: "done";
  result: { response: string; toolCalls: Array<{ name: string; args: Record<string, unknown> }>; proposal?: { proposalId: string } };
}

interface SseError {
  type: "error";
  error: string;
  code?: string;
}

type SseEvent =
  | SseToolCallStart
  | SseToolCallEnd
  | SseTextDelta
  | SseProposal
  | SseTurnSignal
  | SseDone
  | SseError;

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAgentWorkspace(initialPrompt = "") {
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessageView[]>([]);
  const [sending, setSending] = useState(false);
  const [proposals, setProposals] = useState<AgentProposalView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messageIdRef = useRef(0);

  const generateId = () => `msg-${++messageIdRef.current}-${Date.now()}`;

  // ── Send message (SSE streaming) ──────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      if (sending) return false;
      setSending(true);
      setError(null);

      // Add user message
      const userMsg: AgentMessageView = {
        id: generateId(),
        role: "user",
        content: text,
        toolCalls: [],
        proposals: [],
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Create assistant message placeholder
      const assistantMsgId = generateId();
      const assistantMsg: AgentMessageView = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        toolCalls: [],
        proposals: [],
        timestamp: new Date().toISOString(),
        streaming: true,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Abort controller for stop
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/agents/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            sessionId: activeSessionId,
            locale: "en",
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        // Read SSE stream
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6);
            try {
              const event = JSON.parse(json) as SseEvent;
              handleSseEvent(event, assistantMsgId);
            } catch {
              // Skip malformed SSE lines
            }
          }
        }

        // Mark streaming as done
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, streaming: false } : m)),
        );
        return true;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User stopped generation
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, streaming: false } : m)),
          );
          return true;
        }
        const errorMsg = err instanceof Error ? err.message : "Failed to send message";
        setError(errorMsg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: `Error: ${errorMsg}`, streaming: false }
              : m,
          ),
        );
        return false;
      } finally {
        setSending(false);
        abortRef.current = null;
      }
    },
    [sending, activeSessionId],
  );

  // ── SSE event handler ─────────────────────────────────────────────────────

  const handleSseEvent = useCallback(
    (event: SseEvent, assistantMsgId: string) => {
      switch (event.type) {
        case "tool_call_start": {
          const toolCall: AgentToolCallView = {
            id: `tool-${Date.now()}-${event.name}`,
            name: event.name,
            args: event.args,
            state: "running",
          };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, toolCalls: [...m.toolCalls, toolCall] }
                : m,
            ),
          );
          break;
        }

        case "tool_call_end": {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    toolCalls: m.toolCalls.map((tc) =>
                      tc.name === event.name && tc.state === "running"
                        ? {
                            ...tc,
                            result: event.result,
                            durationMs: event.durationMs,
                            state: event.result.isError
                              ? "failed"
                              : event.result.structuredContent?.pending_action_proposal
                                ? "proposal"
                                : "complete",
                          }
                        : tc,
                    ),
                  }
                : m,
            ),
          );
          break;
        }

        case "text_delta": {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: m.content + event.text }
                : m,
            ),
          );
          break;
        }

        case "proposal": {
          const proposalView: AgentProposalView = {
            proposalId: event.proposal.proposalId,
            proposalDigest: event.proposal.proposalDigest,
            tool: event.proposal.tool,
            args: event.proposal.args,
            status: "pending",
            createdAt: new Date().toISOString(),
          };
          setProposals((prev) => [...prev, proposalView]);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, proposals: [...m.proposals, proposalView] }
                : m,
            ),
          );
          break;
        }

        case "turn_signal": {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, turnSignal: event.signal } : m,
            ),
          );
          break;
        }

        case "done": {
          // Update message with final content if needed
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: m.content || event.result.response,
                    streaming: false,
                  }
                : m,
            ),
          );
          break;
        }

        case "error": {
          setError(event.error);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: `Error: ${event.error}`, streaming: false }
                : m,
            ),
          );
          break;
        }
      }
    },
    [],
  );

  // ── Stop generation ───────────────────────────────────────────────────────

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ── Proposal actions ──────────────────────────────────────────────────────

  const approveProposal = useCallback(async (proposalId: string) => {
    try {
      const response = await fetch("/api/ai/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId, decision: "approved" }),
      });
      if (response.ok) {
        setProposals((prev) =>
          prev.map((p) => (p.proposalId === proposalId ? { ...p, status: "approved" } : p)),
        );
      }
    } catch {
      // Error handling
    }
  }, []);

  const rejectProposal = useCallback(async (proposalId: string) => {
    try {
      const response = await fetch("/api/ai/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId, decision: "rejected" }),
      });
      if (response.ok) {
        setProposals((prev) =>
          prev.map((p) => (p.proposalId === proposalId ? { ...p, status: "rejected" } : p)),
        );
      }
    } catch {
      // Error handling
    }
  }, []);

  // ── Session management ────────────────────────────────────────────────────

  const selectSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    // In production: load messages from DB
    setMessages([]);
  }, []);

  const newSession = useCallback(() => {
    setActiveSessionId(null);
    setMessages([]);
    setProposals([]);
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (sessionId === activeSessionId) {
      setActiveSessionId(null);
      setMessages([]);
    }
  }, [activeSessionId]);

  return {
    sessions,
    activeSessionId,
    messages,
    sending,
    proposals,
    error,
    initialPrompt,
    sendMessage,
    stop,
    approveProposal,
    rejectProposal,
    selectSession,
    newSession,
    deleteSession,
  };
}
