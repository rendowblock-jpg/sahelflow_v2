"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageExtraction } from "@/components/inbox/message-extraction";
import { useI18n } from "@/hooks/use-i18n";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useWhatsAppSocket } from "@/hooks/use-whatsapp-socket";
import {
  messageText,
  jidToPhone,
  type SidecarChat,
  type IncomingMessage,
  type WhatsAppStatus,
  type WhatsAppUser,
} from "@/lib/whatsapp/types";
import {
  MessageCircle,
  MessageSquare,
  Send,
  Clock,
  QrCode,
  Loader2,
  RefreshCw,
  LogOut,
  Plug,
  AlertCircle,
  CheckCircle2,
  Smartphone,
} from "lucide-react";

interface SeededConversation {
  id: string;
  channel: string;
  contactName: string;
  contactPhone: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}
interface SeededMessage {
  id: string;
  body: string;
  direction: string;
  timestamp: string;
}

interface NormalizedChat {
  id: string;
  name: string;
  phone?: string;
  channel: "whatsapp" | "seeded";
  lastMessageText?: string;
  lastMessageAt?: number;
  unread: number;
}
interface NormalizedMessage {
  id: string;
  body: string;
  direction: "inbound" | "outbound";
  timestamp: number;
}

type Mode = "loading" | "live" | "seeded";

export function InboxLive() {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<Mode>("loading");
  const [chats, setChats] = useState<NormalizedChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<NormalizedMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [qrKey, setQrKey] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Refs mirroring state for use inside event callbacks (avoid stale closures)
  const statusRef = useRef<WhatsAppStatus | null>(null);
  const activeChatIdRef = useRef<string | null>(null);

  // ── Load chats: live when connected, seeded otherwise ─────────────────
  const loadChats = useCallback(async (currentStatus: WhatsAppStatus | null) => {
    if (currentStatus === "connected") {
      try {
        const res = await fetch("/api/whatsapp/chats?limit=50");
        if (res.ok) {
          const data = (await res.json()) as { chats: SidecarChat[] };
          setChats(
            data.chats.map((c) => ({
              id: c.jid,
              name: c.name,
              phone: jidToPhone(c.jid),
              channel: "whatsapp" as const,
              lastMessageText: c.lastMessage?.text,
              lastMessageAt: c.lastMessage ? c.lastMessage.timestamp * 1000 : undefined,
              unread: c.unread,
            })),
          );
          setMode("live");
          return;
        }
      } catch {
        /* fall through to seeded */
      }
    }
    // Seeded fallback
    try {
      const res = await fetch("/api/conversations");
      const data = (await res.json()) as { conversations: SeededConversation[] };
      setChats(
        data.conversations.map((c) => ({
          id: c.id,
          name: c.contactName,
          phone: c.contactPhone ?? undefined,
          channel: "seeded" as const,
          lastMessageAt: c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : undefined,
          unread: c.unreadCount,
        })),
      );
      setMode("seeded");
    } catch {
      setChats([]);
      setMode("seeded");
    }
  }, []);

  // ── Load messages for a specific chat (called from the select handler) ─
  const loadMessages = useCallback(
    async (chatId: string, channel: "whatsapp" | "seeded") => {
      setLoadingMessages(true);
      try {
        if (channel === "whatsapp") {
          const res = await fetch(
            `/api/whatsapp/chats/${encodeURIComponent(chatId)}/messages?limit=200`,
          );
          if (res.ok) {
            const data = (await res.json()) as { messages: IncomingMessage[] };
            setMessages(
              data.messages.map((m) => ({
                id: m.key.id,
                body: messageText(m.message),
                direction: (m.key.fromMe ? "outbound" : "inbound") as "inbound" | "outbound",
                timestamp: m.messageTimestamp * 1000,
              })),
            );
            return;
          }
        } else {
          const res = await fetch(`/api/conversations/${chatId}`);
          if (res.ok) {
            const data = (await res.json()) as { conversation: { messages: SeededMessage[] } };
            setMessages(
              data.conversation.messages.map((m) => ({
                id: m.id,
                body: m.body,
                direction: (m.direction === "inbound" ? "inbound" : "outbound") as "inbound" | "outbound",
                timestamp: new Date(m.timestamp).getTime(),
              })),
            );
            return;
          }
        }
      } catch {
        /* ignore */
      } finally {
        setLoadingMessages(false);
      }
    },
    [],
  );

  // ── WS event callbacks (event-driven, not effects) ────────────────────
  const handleStatusChange = useCallback(
    (newStatus: WhatsAppStatus, _user: WhatsAppUser | null) => {
      statusRef.current = newStatus;
      void loadChats(newStatus);
      // user info is surfaced via the hook's own state; we only side-effect here
    },
    [loadChats],
  );

  const handleMessage = useCallback(
    (msg: IncomingMessage) => {
      const activeId = activeChatIdRef.current;
      if (activeId && activeId === msg.key.remoteJid) {
        setMessages((prev) => [
          ...prev,
          {
            id: msg.key.id,
            body: messageText(msg.message),
            direction: (msg.key.fromMe ? "outbound" : "inbound") as "inbound" | "outbound",
            timestamp: msg.messageTimestamp * 1000,
          },
        ]);
      }
      // Refresh the chat list so the new last-message + unread shows
      void loadChats(statusRef.current);
    },
    [loadChats],
  );

  const { status, user, wsOpen, reconnect } = useWhatsAppSocket({
    onStatusChange: handleStatusChange,
    onMessage: handleMessage,
  });

  const sidecarReachable = status !== null;

  // ── Initial mount: load seeded data so the list isn't empty while WS connects
  useEffect(() => {
    void loadChats(statusRef.current);
  }, [loadChats]);

  // ── Chat select (event handler, not an effect) ─────────────────────────
  const handleSelectChat = useCallback(
    (chat: NormalizedChat) => {
      activeChatIdRef.current = chat.id;
      setActiveChatId(chat.id);
      setMessages([]);
      void loadMessages(chat.id, chat.channel);
    },
    [loadMessages],
  );

  // ── Auto-scroll to the latest message ─────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── QR auto-refresh (every 20s while in 'qr' state) ────────────────────
  useEffect(() => {
    if (status !== "qr") return;
    const id = setInterval(() => setQrKey((k) => k + 1), 20000);
    return () => clearInterval(id);
  }, [status]);

  // ── Send a reply ──────────────────────────────────────────────────────
  async function handleSend() {
    const active = chats.find((c) => c.id === activeChatId);
    if (!active || active.channel !== "whatsapp" || !replyText.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: active.id, text: replyText.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? t("inbox.sendFailed"));
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          body: replyText.trim(),
          direction: "outbound",
          timestamp: Date.now(),
        },
      ]);
      setReplyText("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : t("inbox.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  async function handleConnect() {
    try {
      await fetch("/api/whatsapp/connect", { method: "POST" });
      reconnect();
    } catch {
      /* ignore */
    }
  }

  function handleLogout() {
    setLogoutConfirmOpen(true);
  }

  async function performLogout() {
    try {
      await fetch("/api/whatsapp/logout", { method: "DELETE" });
      reconnect();
    } catch {
      /* ignore */
    }
  }

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  return (
    <>
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <StatusBar
        status={status}
        user={user}
        wsOpen={wsOpen}
        sidecarReachable={sidecarReachable}
        onConnect={handleConnect}
        onLogout={handleLogout}
        onRetry={reconnect}
      />

      {status === "qr" && (
        <QrPairingCard qrKey={qrKey} onRefresh={() => setQrKey((k) => k + 1)} />
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Conversation list */}
        <div className="w-80 border-r flex flex-col">
          <div className="p-4 border-b">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {t("inbox.title")}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {chats.length > 1
                ? t("inbox.conversationsCountPlural", { count: chats.length })
                : t("inbox.conversationsCount", { count: chats.length })}
              {mode === "seeded" && status !== "connected" && (
                <span className="ml-1 text-amber-600">({t("inbox.demo")})</span>
              )}
              {mode === "live" && <span className="ml-1 text-green-600">({t("inbox.live")})</span>}
            </p>
          </div>
          <ScrollArea className="flex-1">
            {chats.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {t("inbox.noConversationsShort")}
                <br />
                {status === "connected"
                  ? t("inbox.noConversationsConnected")
                  : t("inbox.noConversationsDisconnected")}
              </div>
            ) : (
              <div className="divide-y">
                {chats.map((c) => {
                  const isActive = c.id === activeChatId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleSelectChat(c)}
                      className={`flex w-full items-start gap-3 p-3 text-left hover:bg-accent/50 transition-colors ${
                        isActive ? "bg-accent" : ""
                      }`}
                    >
                      <Avatar className="h-10 w-10 mt-1">
                        <AvatarFallback className={c.channel === "whatsapp" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}>
                          {c.channel === "whatsapp" ? <MessageCircle className="h-5 w-5" /> : c.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate">{c.name}</span>
                          {c.lastMessageAt && (
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {formatRelative(c.lastMessageAt, t, locale)}
                            </span>
                          )}
                        </div>
                        {c.phone && (
                          <p className="text-xs text-muted-foreground font-mono">{c.phone}</p>
                        )}
                        {c.lastMessageText && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{c.lastMessageText}</p>
                        )}
                        <div className="flex items-center justify-between mt-1">
                          <Badge variant="outline" className="text-xs">
                            {c.channel === "whatsapp" ? "WhatsApp" : t("inbox.channelDemo")}
                          </Badge>
                          {c.unread > 0 && (
                            <Badge className="bg-primary text-primary-foreground text-xs px-1.5 py-0">
                              {c.unread}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Message thread */}
        <div className="flex-1 flex flex-col">
          {activeChat ? (
            <>
              <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback className={activeChat.channel === "whatsapp" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}>
                      {activeChat.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="font-semibold">{activeChat.name}</h2>
                    <p className="text-xs text-muted-foreground font-mono">{activeChat.phone}</p>
                  </div>
                </div>
                <Badge variant="outline">
                  {activeChat.channel === "whatsapp" ? "WhatsApp" : t("inbox.channelDemo")}
                </Badge>
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4 max-w-3xl mx-auto">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-8">{t("inbox.noMessages")}</p>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className="space-y-2">
                        <div className={`flex ${msg.direction === "inbound" ? "justify-start" : "justify-end"}`}>
                          <div
                            className={`max-w-[70%] rounded-lg p-3 ${
                              msg.direction === "inbound"
                                ? "bg-muted text-foreground"
                                : "bg-primary text-primary-foreground"
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                            <p className={`text-xs mt-1 ${msg.direction === "inbound" ? "text-muted-foreground" : "text-primary-foreground/70"}`}>
                              {new Date(msg.timestamp).toLocaleTimeString(locale === "ar" ? "ar" : locale === "en" ? "en-US" : "fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                        {msg.direction === "inbound" && msg.body.length > 10 && (
                          <div className="ml-4">
                            <MessageExtraction
                              messageId={msg.id}
                              messageBody={msg.body}
                              knownPhone={activeChat.phone}
                            />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <div className="p-4 border-t">
                {activeChat.channel === "whatsapp" && status === "connected" ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      aria-label={t("inbox.replyPlaceholder")} placeholder={t("inbox.replyPlaceholder")}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSend();
                        }
                      }}
                      disabled={sending}
                    />
                    <Button size="icon" aria-label={t("inbox.send")} onClick={handleSend} disabled={sending || !replyText.trim()}>
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      placeholder={
                        activeChat.channel === "seeded"
                          ? t("inbox.seededReplyPlaceholder")
                          : t("inbox.disconnectedReplyPlaceholder")
                      }
                      disabled
                      className="flex-1"
                    />
                    <Button size="icon" disabled>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                {sendError && (
                  <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {sendError}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="rounded-full bg-muted p-4 mb-4 mx-auto w-fit">
                  <MessageSquare className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-1">{t("inbox.noConversationSelected")}</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  {t("inbox.selectConversationHint")}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
      <ConfirmDialog
        open={logoutConfirmOpen}
        onOpenChange={setLogoutConfirmOpen}
        title={t("inbox.confirmLogout")}
        description={t("inbox.confirmLogoutDesc")}
        confirmLabel={t("inbox.logout")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={performLogout}
      />
    </>
  );
}

// ── Status bar ──────────────────────────────────────────────────────────────
function StatusBar({
  status,
  user,
  wsOpen,
  sidecarReachable,
  onConnect,
  onLogout,
  onRetry,
}: {
  status: WhatsAppStatus | null;
  user: WhatsAppUser | null;
  wsOpen: boolean;
  sidecarReachable: boolean;
  onConnect: () => void;
  onLogout: () => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  if (status === null) {
    return (
      <div className="border-b bg-muted/30 px-4 py-2 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("inbox.checkingConnection")}
      </div>
    );
  }
  if (!sidecarReachable) {
    return (
      <div className="border-b bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-sm flex items-center justify-between">
        <span className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-4 w-4" />
          {t("inbox.serviceNotStarted")}
        </span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3 w-3 mr-1" />
          {t("inbox.retry")}
        </Button>
      </div>
    );
  }
  if (status === "connected") {
    return (
      <div className="border-b bg-green-50 dark:bg-green-950/30 px-4 py-2 text-sm flex items-center justify-between">
        <span className="flex items-center gap-2 text-green-700 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4" />
          {t("inbox.whatsappConnected")}
          {user?.id && <span className="font-mono text-xs">· {user.id.split("@")[0]}</span>}
          {!wsOpen && <span className="text-xs">{t("inbox.reconnecting")}</span>}
        </span>
        <Button variant="outline" size="sm" onClick={onLogout} className="text-destructive">
          <LogOut className="h-3 w-3 mr-1" />
          {t("inbox.disconnect")}
        </Button>
      </div>
    );
  }
  if (status === "qr") {
    return (
      <div className="border-b bg-blue-50 dark:bg-blue-950/30 px-4 py-2 text-sm flex items-center gap-2 text-blue-700 dark:text-blue-300">
        <QrCode className="h-4 w-4" />
        {t("inbox.scanQrHint")}
      </div>
    );
  }
  if (status === "connecting") {
    return (
      <div className="border-b bg-muted/30 px-4 py-2 text-sm flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("inbox.connecting")}
      </div>
    );
  }
  return (
    <div className="border-b bg-muted/30 px-4 py-2 text-sm flex items-center justify-between">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Plug className="h-4 w-4" />
        {t("inbox.disconnected")}
      </span>
      <Button variant="outline" size="sm" onClick={onConnect}>
        <Smartphone className="h-3 w-3 mr-1" />
        {t("inbox.connect")}
      </Button>
    </div>
  );
}

// ── QR pairing card ─────────────────────────────────────────────────────────
function QrPairingCard({ qrKey, onRefresh }: { qrKey: number; onRefresh: () => void }) {
  const { t } = useI18n();
  return (
    <div className="border-b bg-blue-50/50 dark:bg-blue-950/20 px-4 py-6 flex flex-col items-center gap-3">
      <Card className="p-4">
        <CardContent className="p-0 flex flex-col items-center gap-3">
          {/* QR is a dynamic opaque PNG from an API route — <img> is correct here
              (next/image would try to optimize a constantly-changing endpoint). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={qrKey}
            src="/api/whatsapp/qr-image"
            alt={t("inbox.qrAlt")}
            className="h-64 w-64"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
            }}
          />
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            {t("inbox.qrInstructions")}
          </p>
        </CardContent>
      </Card>
      <Button variant="ghost" size="sm" onClick={onRefresh}>
        <RefreshCw className="h-3 w-3 mr-1" />
        {t("inbox.refreshQr")}
      </Button>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function formatRelative(ms: number, t: (key: string, params?: Record<string, string | number>) => string, locale: string): string {
  const diff = Date.now() - ms;
  const hours = diff / (1000 * 60 * 60);
  if (hours < 1) return t("inbox.justNow");
  if (hours < 24) return t("inbox.hoursAgo", { hours: Math.floor(hours) });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("inbox.yesterday");
  if (days < 7) return t("inbox.daysAgo", { days });
  return new Date(ms).toLocaleDateString(locale === "ar" ? "ar" : locale === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "short" });
}
