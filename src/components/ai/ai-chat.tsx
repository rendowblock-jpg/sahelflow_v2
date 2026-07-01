"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, Loader2, Plus, MessageSquare, Wrench, ArrowLeft } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { useMobile } from "@/hooks/use-mobile";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ParsedToolCall[]; // parsed from DB JSON string on load
  // Streaming-only fields (not persisted)
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

export function AiChat() {
  const { t, locale } = useI18n();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  // Abort controller for the active stream (lets the user cancel)
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    async function load() {
      setLoadingSessions(true);
      try {
        const res = await fetch("/api/ai/sessions");
        if (res.ok) {
          const data = (await res.json()) as { sessions: Session[] };
          setSessions(data.sessions);
          if (data.sessions.length > 0 && !activeSessionId) {
            setActiveSessionId(data.sessions[0]!.id);
          }
        }
      } catch {
        /* ignore */
      } finally {
        setLoadingSessions(false);
      }
    }
    load();
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadingMessages(false);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([]);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingMessages(true);
    (async () => {
      try {
        const res = await fetch(`/api/ai/sessions/${activeSessionId}/messages`);
        if (res.ok) {
          const data = (await res.json()) as {
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
            data.session.messages.map((m) => ({
              id: m.id,
              role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
              content: m.content,
              toolCalls: m.toolCalls
                ? (JSON.parse(m.toolCalls) as ParsedToolCall[])
                : undefined,
              createdAt: m.createdAt,
            })),
          );
        }
      } catch {
        /* ignore */
      } finally {
        setLoadingMessages(false);
      }
    })();
  }, [activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleNewSession() {
    try {
      const res = await fetch("/api/ai/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = (await res.json()) as { session: Session };
        setSessions((prev) => [data.session, ...prev]);
        setActiveSessionId(data.session.id);
        setMessages([]);
      }
    } catch {
      /* ignore */
    }
  }

  async function handleSend() {
    if (!input.trim() || !activeSessionId || sending) return;
    const userMessage = input.trim();
    setInput("");
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const assistantId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: userMessage, createdAt: new Date().toISOString() },
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
      const res = await fetch(`/api/ai/sessions/${activeSessionId}/messages/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      // Parse the SSE stream manually
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIdx: number;
        while ((sepIdx = buffer.indexOf("\n\n")) >= 0) {
          const rawEvent = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);

          let eventType = "";
          let eventData = "";
          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              eventData = line.slice(5).trim();
            }
          }

          if (!eventType || !eventData) continue;
          if (eventType === "close") continue;

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(eventData) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (eventType === "text_delta") {
            const text = payload.text as string;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + text }
                  : m,
              ),
            );
          } else if (eventType === "tool_call") {
            const name = payload.name as string;
            const args = payload.args as Record<string, unknown>;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      streamingToolCalls: [
                        ...(m.streamingToolCalls ?? []),
                        { name, args },
                      ],
                    }
                  : m,
              ),
            );
          } else if (eventType === "tool_result") {
            const name = payload.name as string;
            const result = payload.result;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      streamingToolCalls: (m.streamingToolCalls ?? []).map((tc) =>
                        tc.name === name && tc.result === undefined
                          ? { ...tc, result }
                          : tc,
                      ),
                    }
                  : m,
              ),
            );
          } else if (eventType === "done") {
            const response = payload.response as string;
            const toolCalls = payload.toolCalls as ParsedToolCall[] | undefined;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: response || m.content || t("ai.noResponse"),
                      streaming: false,
                      streamingToolCalls: undefined,
                      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : m.toolCalls,
                    }
                  : m,
              ),
            );
          } else if (eventType === "error") {
            const message = payload.message as string;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: m.content || t("ai.errorPrefix", { message }),
                      streaming: false,
                      streamingToolCalls: undefined,
                    }
                  : m,
              ),
            );
          }
        }
      }

      // Replace the temp user message with a permanent one
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, id: `user-${Date.now()}` }
            : m,
        ),
      );

      // Refresh sessions list (title may have changed)
      const sessionsRes = await fetch("/api/ai/sessions");
      if (sessionsRes.ok) {
        const sessionsData = (await sessionsRes.json()) as { sessions: Session[] };
        setSessions(sessionsData.sessions);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // User cancelled — finalize the assistant message as-is
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, streaming: false, streamingToolCalls: undefined }
              : m,
          ),
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: t("ai.connectionFailed"),
                  streaming: false,
                  streamingToolCalls: undefined,
                }
              : m,
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
      <div className={`${isMobile && activeSessionId ? "hidden" : "flex"} w-full md:w-72 md:border-e flex flex-col bg-muted/20`}>
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
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSessionId(s.id)}
                  className={`flex items-start gap-2 p-3 text-start w-full rounded-lg transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    s.id === activeSessionId
                      ? "bg-background shadow-sm ring-1 ring-border"
                      : "hover:bg-background/60"
                  }`}
                >
                  <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.title || t("ai.untitled")}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.updatedAt).toLocaleDateString(locale === "ar" ? "ar" : locale === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className={`${isMobile && !activeSessionId ? "hidden" : "flex"} flex-1 flex flex-col`}>
        {activeSessionId ? (
          <>
            <div className="p-3 border-b bg-background flex items-center gap-2">
              {isMobile && (
                <button
                  onClick={() => setActiveSessionId(null)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <Bot className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold tracking-tight">{t("ai.assistantTitle")}</h2>
              <Badge variant="outline" className="ms-auto text-xs">
                {t("ai.toolsCount")}
              </Badge>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4 max-w-3xl mx-auto">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border bg-muted w-fit">
                      <Bot className="size-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-semibold mb-2">{t("ai.howCanIHelp")}</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto text-balance">
                      {t("ai.capabilities")}
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className="space-y-2">
                      <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-muted text-foreground rounded-bl-md"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">
                            {msg.content}
                            {msg.streaming && !msg.content && (
                              <Loader2 className="inline h-3 w-3 animate-spin ms-1" />
                            )}
                            {msg.streaming && msg.content && (
                              <span className="inline-block w-1.5 h-3.5 bg-foreground/60 ms-0.5 animate-pulse" />
                            )}
                          </p>
                        </div>
                      </div>
                      {/* Persisted tool calls (from DB) */}
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="ms-4 space-y-1">
                          {msg.toolCalls.map((tc, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Wrench className="h-3 w-3" />
                              <span className="font-mono">{tc.name}</span>
                              <span>→</span>
                              <span className="truncate max-w-xs">
                                {typeof tc.result === "object"
                                  ? JSON.stringify(tc.result).slice(0, 80)
                                  : String(tc.result).slice(0, 80)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Live streaming tool calls */}
                      {msg.streamingToolCalls && msg.streamingToolCalls.length > 0 && (
                        <div className="ms-4 space-y-1">
                          {msg.streamingToolCalls.map((tc, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Wrench className="h-3 w-3" />
                              <span className="font-mono">{tc.name}</span>
                              {tc.result === undefined ? (
                                <span className="italic">{t("ai.executing")}</span>
                              ) : (
                                <>
                                  <span>→</span>
                                  <span className="truncate max-w-xs">
                                    {typeof tc.result === "object"
                                      ? JSON.stringify(tc.result).slice(0, 80)
                                      : String(tc.result).slice(0, 80)}
                                  </span>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-3 border-t bg-background">
              <div className="flex items-center gap-2 max-w-3xl mx-auto">
                <Input
                  type="text"
                  placeholder={t("ai.askPlaceholder")}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  disabled={sending}
                />
                {sending ? (
                  <Button size="icon" variant="destructive" onClick={handleCancel} title={t("ai.stop")}>
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </Button>
                ) : (
                  <Button size="icon" onClick={handleSend} disabled={!input.trim()} aria-label={t("ai.send")}>
                    <Send className="h-4 w-4" />
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
              <h3 className="text-base font-semibold mb-1.5">{t("ai.assistantSahelFlow")}</h3>
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
