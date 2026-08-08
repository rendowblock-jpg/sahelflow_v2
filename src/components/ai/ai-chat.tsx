"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/hooks/use-i18n";
import { useMobile } from "@/hooks/use-mobile";
import { toast } from "@/lib/toast";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ParsedToolCall[];
  streaming?: boolean;
  streamingToolCalls?: StreamingToolCall[];
  createdAt: string;
}

interface Session {
  id: string;
  title: string | null;
  updatedAt: string;
}

interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

interface StreamingToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
}

interface ActionProposalProjection {
  id: string;
  toolName: string;
  status: string;
  proposalDigestPrefix: string;
  summary: Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
  executionState: string | null;
  lastErrorCode: string | null;
}

interface ActionProposalHandle {
  proposal: ActionProposalProjection;
  proposalDigest: string;
}

interface ActionProposalEvent {
  pending_action_proposal: true;
  tool: string;
  proposal: ActionProposalProjection;
  proposalDigest: string;
}

function proposalCopy(locale: string) {
  if (locale === "ar") {
    return {
      title: "اقتراح إجراء حساس",
      approve: "مراجعة وموافقة",
      approving: "جارٍ التنفيذ",
      approved: "تم تنفيذ الإجراء المعتمد",
      pending: "بانتظار الموافقة",
      executing: "قيد التنفيذ",
      succeeded: "تم بنجاح",
      conflict: "تعارض — أنشئ اقتراحاً جديداً",
      expired: "انتهت الصلاحية",
      failed: "فشل — يلزم سبب لإعادة المحاولة",
      recoveryReason: "سبب إعادة المحاولة",
      retry: "إعادة المحاولة بأمان",
      digest: "بصمة الاقتراح",
      expires: "تنتهي الصلاحية",
      unavailable: "تعذر تنفيذ الاقتراح",
    };
  }
  if (locale === "en") {
    return {
      title: "Sensitive action proposal",
      approve: "Review and approve",
      approving: "Executing",
      approved: "Approved action completed",
      pending: "Awaiting approval",
      executing: "Executing",
      succeeded: "Succeeded",
      conflict: "Conflict — create a new proposal",
      expired: "Expired",
      failed: "Failed — recovery reason required",
      recoveryReason: "Recovery reason",
      retry: "Retry safely",
      digest: "Proposal digest",
      expires: "Expires",
      unavailable: "The proposal could not be executed",
    };
  }
  return {
    title: "Proposition d'action sensible",
    approve: "Vérifier et approuver",
    approving: "Exécution en cours",
    approved: "Action approuvée exécutée",
    pending: "En attente d'approbation",
    executing: "En cours d'exécution",
    succeeded: "Réussie",
    conflict: "Conflit — créez une nouvelle proposition",
    expired: "Expirée",
    failed: "Échec — motif de reprise requis",
    recoveryReason: "Motif de reprise",
    retry: "Reprendre en sécurité",
    digest: "Empreinte de proposition",
    expires: "Expire",
    unavailable: "La proposition n'a pas pu être exécutée",
  };
}

function isActionProposalEvent(value: unknown): value is ActionProposalEvent {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.pending_action_proposal === true &&
    typeof record.tool === "string" &&
    typeof record.proposalDigest === "string" &&
    Boolean(record.proposal && typeof record.proposal === "object")
  );
}

function visibleToolCalls(calls: ParsedToolCall[] | undefined) {
  return calls?.filter((call) => !isActionProposalEvent(call.result)) ?? [];
}

function proposalStatusLabel(
  status: string,
  copy: ReturnType<typeof proposalCopy>,
): string {
  switch (status) {
    case "pending":
    case "approved":
      return copy.pending;
    case "executing":
      return copy.executing;
    case "succeeded":
      return copy.succeeded;
    case "conflict":
      return copy.conflict;
    case "expired":
      return copy.expired;
    case "failed":
      return copy.failed;
    default:
      return status;
  }
}

export function AiChat() {
  const { t, locale } = useI18n();
  const copy = proposalCopy(locale);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [proposals, setProposals] = useState<ActionProposalHandle[]>([]);
  const [recoveryReasons, setRecoveryReasons] = useState<Record<string, string>>(
    {},
  );
  const [approvingProposalId, setApprovingProposalId] = useState<string | null>(
    null,
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    async function load() {
      setLoadingSessions(true);
      try {
        const response = await fetch("/api/ai/sessions");
        if (response.ok) {
          const data = (await response.json()) as { sessions: Session[] };
          setSessions(data.sessions);
          if (data.sessions.length > 0 && !activeSessionId) {
            setActiveSessionId(data.sessions[0]!.id);
          }
        }
      } catch {
        // The empty state remains usable when the list request fails.
      } finally {
        setLoadingSessions(false);
      }
    }
    void load();
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadingMessages(false);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProposals([]);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingMessages(true);
    void (async () => {
      try {
        const [messagesResponse, actionsResponse] = await Promise.all([
          fetch(`/api/ai/sessions/${activeSessionId}/messages`),
          fetch(`/api/ai/sessions/${activeSessionId}/actions`),
        ]);
        if (messagesResponse.ok) {
          const data = (await messagesResponse.json()) as {
            session: {
              messages: Array<{
                id: string;
                role: string;
                content: string;
                toolCalls: string | null;
                createdAt: string;
              }>;
            };
          };
          setMessages(
            data.session.messages.map((message) => ({
              id: message.id,
              role: message.role === "assistant" ? "assistant" : "user",
              content: message.content,
              toolCalls: message.toolCalls
                ? (JSON.parse(message.toolCalls) as ParsedToolCall[])
                : undefined,
              createdAt: message.createdAt,
            })),
          );
        }
        if (actionsResponse.ok) {
          const data = (await actionsResponse.json()) as {
            proposals: ActionProposalHandle[];
          };
          setProposals(data.proposals);
        }
      } catch {
        // Preserve the last visible state on transient reload failure.
      } finally {
        setLoadingMessages(false);
      }
    })();
  }, [activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, proposals]);

  async function handleNewSession() {
    try {
      const response = await fetch("/api/ai/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (response.ok) {
        const data = (await response.json()) as { session: Session };
        setSessions((previous) => [data.session, ...previous]);
        setActiveSessionId(data.session.id);
        setMessages([]);
        setProposals([]);
      }
    } catch {
      // The next explicit retry can create the session.
    }
  }

  async function approveProposal(handle: ActionProposalHandle) {
    const proposal = handle.proposal;
    if (approvingProposalId) return;
    const reason = recoveryReasons[proposal.id]?.trim();
    if (proposal.status === "failed" && !reason) return;
    setApprovingProposalId(proposal.id);
    try {
      const response = await fetch(
        `/api/ai/actions/${proposal.id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposalDigest: handle.proposalDigest,
            ...(reason ? { reason } : {}),
          }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        proposal?: ActionProposalProjection;
        result?: unknown;
        error?: string;
        message?: string;
        code?: string;
      };
      if (!response.ok || !data.proposal) {
        throw new Error(data.message ?? data.error ?? data.code ?? copy.unavailable);
      }
      setProposals((previous) =>
        previous.map((entry) =>
          entry.proposal.id === proposal.id
            ? { ...entry, proposal: data.proposal! }
            : entry,
        ),
      );
      setRecoveryReasons((previous) => ({
        ...previous,
        [proposal.id]: "",
      }));
      toast.success(copy.approved, {
        description: `${proposal.toolName} · ${proposal.proposalDigestPrefix}`,
      });
    } catch (error) {
      toast.error(copy.unavailable, {
        description:
          error instanceof Error ? error.message : copy.unavailable,
      });
      if (activeSessionId) {
        const response = await fetch(
          `/api/ai/actions/${proposal.id}`,
        ).catch(() => null);
        if (response?.ok) {
          const refreshed = (await response.json()) as ActionProposalHandle;
          setProposals((previous) =>
            previous.map((entry) =>
              entry.proposal.id === proposal.id ? refreshed : entry,
            ),
          );
        }
      }
    } finally {
      setApprovingProposalId(null);
    }
  }

  async function handleSend() {
    const userMessage = input.trim();
    if (!userMessage || !activeSessionId || sending) return;
    setInput("");
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const assistantId = `assistant-${Date.now()}`;
    setMessages((previous) => [
      ...previous,
      {
        id: tempId,
        role: "user",
        content: userMessage,
        createdAt: new Date().toISOString(),
      },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
        streamingToolCalls: [],
        createdAt: new Date().toISOString(),
      },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(
        `/api/ai/sessions/${activeSessionId}/messages/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userMessage }),
          signal: controller.signal,
        },
      );
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let separator: number;
        while ((separator = buffer.indexOf("\n\n")) >= 0) {
          const rawEvent = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          let eventType = "";
          let eventData = "";
          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              eventData = line.slice(5).trim();
            }
          }
          if (!eventType || !eventData || eventType === "close") continue;

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(eventData) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (eventType === "text_delta") {
            const text = payload.text as string;
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantId
                  ? { ...message, content: message.content + text }
                  : message,
              ),
            );
          } else if (eventType === "tool_call") {
            const name = payload.name as string;
            const args = payload.args as Record<string, unknown>;
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      streamingToolCalls: [
                        ...(message.streamingToolCalls ?? []),
                        { name, args },
                      ],
                    }
                  : message,
              ),
            );
          } else if (eventType === "tool_result") {
            const name = payload.name as string;
            const result = payload.result;
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      streamingToolCalls: (
                        message.streamingToolCalls ?? []
                      ).map((call) =>
                        call.name === name && call.result === undefined
                          ? { ...call, result }
                          : call,
                      ),
                    }
                  : message,
              ),
            );
          } else if (eventType === "action_proposal") {
            const proposalEvent = payload.proposal;
            if (isActionProposalEvent(proposalEvent)) {
              const handle: ActionProposalHandle = {
                proposal: proposalEvent.proposal,
                proposalDigest: proposalEvent.proposalDigest,
              };
              setProposals((previous) => [
                handle,
                ...previous.filter(
                  (entry) => entry.proposal.id !== handle.proposal.id,
                ),
              ]);
            }
          } else if (eventType === "done") {
            const finalResponse = payload.response as string;
            const toolCalls = payload.toolCalls as ParsedToolCall[] | undefined;
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      content:
                        finalResponse ||
                        message.content ||
                        t("ai.noResponse"),
                      streaming: false,
                      streamingToolCalls: undefined,
                      toolCalls:
                        toolCalls && toolCalls.length > 0
                          ? toolCalls
                          : message.toolCalls,
                    }
                  : message,
              ),
            );
          } else if (eventType === "error") {
            const message = payload.message as string;
            setMessages((previous) =>
              previous.map((entry) =>
                entry.id === assistantId
                  ? {
                      ...entry,
                      content:
                        entry.content || t("ai.errorPrefix", { message }),
                      streaming: false,
                      streamingToolCalls: undefined,
                    }
                  : entry,
              ),
            );
          }
        }
      }

      setMessages((previous) =>
        previous.map((message) =>
          message.id === tempId
            ? { ...message, id: `user-${Date.now()}` }
            : message,
        ),
      );
      const sessionsResponse = await fetch("/api/ai/sessions");
      if (sessionsResponse.ok) {
        const sessionsData = (await sessionsResponse.json()) as {
          sessions: Session[];
        };
        setSessions(sessionsData.sessions);
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  streaming: false,
                  streamingToolCalls: undefined,
                }
              : message,
          ),
        );
      } else {
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: t("ai.connectionFailed"),
                  streaming: false,
                  streamingToolCalls: undefined,
                }
              : message,
          ),
        );
      }
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  const isMobile = useMobile();
  return (
    <div className="flex h-full">
      <div
        className={`${
          isMobile && activeSessionId ? "hidden" : "flex"
        } w-full md:w-72 md:border-e flex-col bg-muted/20`}
      >
        <div className="p-3 border-b bg-background">
          <Button onClick={handleNewSession} className="w-full" size="sm">
            <Plus className="h-4 w-4 me-1.5" />
            {t("ai.newConversation")}
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {loadingSessions ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("ai.noSessions")}
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`flex items-start gap-2 p-3 text-start w-full rounded-lg transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    session.id === activeSessionId
                      ? "bg-background shadow-sm ring-1 ring-border"
                      : "hover:bg-background/60"
                  }`}
                >
                  <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {session.title || t("ai.untitled")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(session.updatedAt).toLocaleDateString(
                        locale === "ar"
                          ? "ar"
                          : locale === "en"
                            ? "en-US"
                            : "fr-FR",
                        { day: "numeric", month: "short" },
                      )}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <div
        className={`${
          isMobile && !activeSessionId ? "hidden" : "flex"
        } flex-1 flex-col`}
      >
        {activeSessionId ? (
          <>
            <div className="p-3 border-b bg-background flex items-center gap-2">
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setActiveSessionId(null)}
                  aria-label={t("common.backToConversations")}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 icon-rtl-flip" />
                </button>
              )}
              <Bot className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold tracking-tight">
                {t("ai.assistantTitle")}
              </h2>
              <Badge variant="outline" className="ms-auto text-xs">
                {t("ai.toolsCount")}
              </Badge>
            </div>

            <ScrollArea
              className="flex-1 p-4"
              aria-label={t("ai.chatMessages")}
              role="log"
              aria-live="polite"
            >
              <div className="space-y-4 max-w-3xl mx-auto">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border bg-muted">
                      <Bot className="size-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-semibold mb-2">
                      {t("ai.howCanIHelp")}
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto text-balance">
                      {t("ai.capabilities")}
                    </p>
                  </div>
                ) : (
                  messages.map((message) => {
                    const calls = visibleToolCalls(message.toolCalls);
                    return (
                      <div key={message.id} className="space-y-2">
                        <div
                          className={`flex ${
                            message.role === "user"
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm ${
                              message.role === "user"
                                ? "bg-primary text-primary-foreground rounded-ee-md"
                                : "bg-muted text-foreground rounded-es-md"
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">
                              {message.content}
                              {message.streaming && !message.content && (
                                <Loader2 className="inline h-3 w-3 animate-spin ms-1" />
                              )}
                              {message.streaming && message.content && (
                                <span className="inline-block w-1.5 h-3.5 bg-foreground/60 ms-0.5 animate-pulse" />
                              )}
                            </p>
                          </div>
                        </div>
                        {calls.length > 0 && (
                          <div className="ms-4 space-y-1">
                            {calls.map((call, index) => (
                              <div
                                key={index}
                                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                              >
                                <Wrench className="h-3 w-3" />
                                <span className="font-mono">{call.name}</span>
                                <span className="icon-rtl-flip">→</span>
                                <span className="truncate max-w-xs">
                                  {typeof call.result === "object"
                                    ? JSON.stringify(call.result).slice(0, 80)
                                    : String(call.result).slice(0, 80)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {message.streamingToolCalls &&
                          message.streamingToolCalls.length > 0 && (
                            <div className="ms-4 space-y-1">
                              {message.streamingToolCalls
                                .filter(
                                  (call) =>
                                    !isActionProposalEvent(call.result),
                                )
                                .map((call, index) => (
                                  <div
                                    key={index}
                                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                                  >
                                    <Wrench className="h-3 w-3" />
                                    <span className="font-mono">
                                      {call.name}
                                    </span>
                                    {call.result === undefined ? (
                                      <span className="italic">
                                        {t("ai.executing")}
                                      </span>
                                    ) : (
                                      <>
                                        <span className="icon-rtl-flip">→</span>
                                        <span className="truncate max-w-xs">
                                          {typeof call.result === "object"
                                            ? JSON.stringify(call.result).slice(
                                                0,
                                                80,
                                              )
                                            : String(call.result).slice(0, 80)}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                ))}
                            </div>
                          )}
                      </div>
                    );
                  })
                )}

                {proposals.map((handle) => {
                  const proposal = handle.proposal;
                  const approving = approvingProposalId === proposal.id;
                  const recoverable = proposal.status === "failed";
                  const approvable =
                    proposal.status === "pending" || recoverable;
                  const statusLabel = proposalStatusLabel(
                    proposal.status,
                    copy,
                  );
                  return (
                    <section
                      key={proposal.id}
                      className="rounded-xl border bg-card p-4 shadow-sm"
                      aria-label={`${copy.title}: ${proposal.toolName}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          {proposal.status === "succeeded" ? (
                            <CheckCircle2 className="size-4" />
                          ) : proposal.status === "conflict" ||
                            proposal.status === "expired" ||
                            proposal.status === "failed" ? (
                            <AlertTriangle className="size-4" />
                          ) : (
                            <ShieldCheck className="size-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold">
                              {copy.title}
                            </h3>
                            <Badge variant="outline" className="font-mono">
                              {proposal.toolName}
                            </Badge>
                            <Badge
                              variant={
                                proposal.status === "succeeded"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {statusLabel}
                            </Badge>
                          </div>

                          <dl className="grid gap-2 text-xs sm:grid-cols-2">
                            {Object.entries(proposal.summary).map(
                              ([key, value]) => (
                                <div
                                  key={key}
                                  className="rounded-md bg-muted/60 p-2"
                                >
                                  <dt className="text-muted-foreground">
                                    {key}
                                  </dt>
                                  <dd className="mt-0.5 break-words font-medium">
                                    {typeof value === "object"
                                      ? JSON.stringify(value)
                                      : String(value)}
                                  </dd>
                                </div>
                              ),
                            )}
                          </dl>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              {copy.digest}: {" "}
                              <bdi dir="ltr" className="font-mono">
                                {proposal.proposalDigestPrefix}
                              </bdi>
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="size-3" />
                              {copy.expires}: {" "}
                              {new Date(proposal.expiresAt).toLocaleString(
                                locale === "ar"
                                  ? "ar"
                                  : locale === "en"
                                    ? "en-US"
                                    : "fr-FR",
                              )}
                            </span>
                            {proposal.lastErrorCode && (
                              <bdi dir="ltr" className="font-mono">
                                {proposal.lastErrorCode}
                              </bdi>
                            )}
                          </div>

                          {recoverable && (
                            <Input
                              value={recoveryReasons[proposal.id] ?? ""}
                              onChange={(event) =>
                                setRecoveryReasons((previous) => ({
                                  ...previous,
                                  [proposal.id]: event.target.value,
                                }))
                              }
                              aria-label={copy.recoveryReason}
                              placeholder={copy.recoveryReason}
                              maxLength={1000}
                              disabled={approving}
                            />
                          )}

                          {approvable && (
                            <Button
                              size="sm"
                              onClick={() => void approveProposal(handle)}
                              disabled={
                                approving ||
                                Boolean(
                                  approvingProposalId && !approving,
                                ) ||
                                (recoverable &&
                                  !(recoveryReasons[proposal.id] ?? "").trim())
                              }
                            >
                              {approving ? (
                                <Loader2 className="size-4 animate-spin me-1.5" />
                              ) : recoverable ? (
                                <RotateCcw className="size-4 me-1.5" />
                              ) : (
                                <ShieldCheck className="size-4 me-1.5" />
                              )}
                              {approving
                                ? copy.approving
                                : recoverable
                                  ? copy.retry
                                  : copy.approve}
                            </Button>
                          )}
                        </div>
                      </div>
                    </section>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-3 border-t bg-background">
              <div className="flex items-center gap-2 max-w-3xl mx-auto">
                <Input
                  type="text"
                  aria-label={t("ai.askPlaceholder")}
                  placeholder={t("ai.askPlaceholder")}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  disabled={sending}
                />
                {sending ? (
                  <Button
                    size="icon"
                    variant="destructive"
                    onClick={handleCancel}
                    title={t("ai.stop")}
                    aria-label={t("ai.stop")}
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    onClick={() => void handleSend()}
                    disabled={!input.trim()}
                    aria-label={t("ai.send")}
                  >
                    <Send className="h-4 w-4 icon-rtl-flip" />
                  </Button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl border bg-muted">
                <Bot className="size-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold mb-1.5">
                {t("ai.assistantSahelFlow")}
              </h3>
              <p className="text-sm text-muted-foreground text-balance mb-4">
                {t("ai.createConversationPrompt")}
              </p>
              <Button onClick={handleNewSession} size="sm">
                <Plus className="h-4 w-4 me-1.5" />
                {t("ai.newConversation")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
