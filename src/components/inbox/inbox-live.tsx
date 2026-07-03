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
  ArrowLeft,
  Search,
} from "lucide-react";
import { useMobile } from "@/hooks/use-mobile";

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
  const [searchQuery, setSearchQuery] = useState("");
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

  const isMobile = useMobile();
  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  // Filter chats by search query (client-side on loaded chats)
  const filteredChats = searchQuery.trim()
    ? chats.filter((c) =>
        c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.lastMessageText?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : chats;

  return (
    <>
    <div className="flex h-full flex-col">
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
        <div className={`${isMobile && activeChatId ? "hidden" : "flex"} w-full md:w-80 md:border-e flex flex-col bg-muted/20`}>
          <div className="p-4 border-b bg-background">
            <h1 className="text-base font-semibold flex items-center gap-2 tracking-tight">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              {t("inbox.title")}
            </h1>
            <div className="mt-2 relative">
              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("inbox.searchPlaceholder")}
                className="w-full rounded-md border bg-background ps-8 pe-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {filteredChats.length > 1
                ? t("inbox.conversationsCountPlural", { count: filteredChats.length })
                : t("inbox.conversationsCount", { count: filteredChats.length })}
              {mode === "seeded" && status !== "connected" && (
                <span className="ms-1 text-amber-600 dark:text-amber-400">({t("inbox.demo")})</span>
              )}
              {mode === "live" && <span className="ms-1 text-emerald-600 dark:text-emerald-400">({t("inbox.live")})</span>}
            </p>
          </div>
          <ScrollArea className="flex-1">
            {filteredChats.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {t("inbox.noConversationsShort")}
                <br />
                {status === "connected"
                  ? t("inbox.noConversationsConnected")
                  : t("inbox.noConversationsDisconnected")}
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {filteredChats.map((c) => {
                  const isActive = c.id === activeChatId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleSelectChat(c)}
                      className={`flex w-full items-start gap-3 rounded-lg p-3 text-start transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                        isActive
                          ? "bg-background shadow-sm ring-1 ring-border"
                          : "hover:bg-background/60"
                      }`}
                    >
                      <Avatar className="h-10 w-10 mt-1">
                        <AvatarFallback className={c.channel === "whatsapp" ? "bg-green-100 text-emerald-700" : "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400"}>
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
        <div className={`${isMobile && !activeChatId ? "hidden" : "flex"} flex-1 flex flex-col`}>
          {activeChat ? (
            <>
              <div className="p-3 border-b bg-background flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isMobile && (
                    <button
                      onClick={() => setActiveChatId(null)}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted transition-colors"
                    >
                      <ArrowLeft className="h-4 w-4 icon-rtl-flip" />
                    </button>
                  )}
                  <Avatar className="size-9">
                    <AvatarFallback className={activeChat.channel === "whatsapp" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 dark:bg-teal-900/30 dark:text-teal-400"}>
                      {activeChat.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">{activeChat.name}</h2>
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
                            className={`max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm ${
                              msg.direction === "inbound"
                                ? "bg-muted text-foreground rounded-es-md"
                                : "bg-primary text-primary-foreground rounded-ee-md"
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                            <p className={`text-[10px] mt-1 ${msg.direction === "inbound" ? "text-muted-foreground" : "text-primary-foreground/70"}`}>
                              {new Date(msg.timestamp).toLocaleTimeString(locale === "ar" ? "ar" : locale === "en" ? "en-US" : "fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                        {msg.direction === "inbound" && msg.body.length > 10 && (
                          <div className="ms-4">
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

              <div className="p-3 border-t bg-background">
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
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 icon-rtl-flip" />}
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
                      <Send className="h-4 w-4 icon-rtl-flip" />
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
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-sm">
                <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl border bg-muted">
                  <MessageSquare className="size-6 text-muted-foreground" />
                </div>
                <h3 className="text-base font-semibold mb-1.5">{t("inbox.noConversationSelected")}</h3>
                <p className="text-sm text-muted-foreground text-balance">
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
      <div className="space-y-0">
        <div className="border-b bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-sm flex items-center justify-between">
          <span className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-4 w-4" />
            {t("inbox.serviceNotStarted")}
          </span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="h-3 w-3 me-1" />
            {t("inbox.retry")}
          </Button>
        </div>
        <div className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          {t("inbox.setupGuide") || "To connect WhatsApp: 1) The sidecar service must be running (it starts automatically with the desktop app). 2) Click Connect below. 3) Scan the QR code with your phone's WhatsApp settings."}
        </div>
      </div>
    );
  }
  if (status === "connected") {
    return (
      <div className="border-b bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2 text-sm flex items-center justify-between">
        <span className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          {t("inbox.whatsappConnected")}
          {user?.id && <span className="font-mono text-xs">· {user.id.split("@")[0]}</span>}
          {!wsOpen && <span className="text-xs">{t("inbox.reconnecting")}</span>}
        </span>
        <Button variant="outline" size="sm" onClick={onLogout} className="text-destructive">
          <LogOut className="h-3 w-3 me-1" />
          {t("inbox.disconnect")}
        </Button>
      </div>
    );
  }
  if (status === "qr") {
    return (
      <div className="border-b bg-teal-50 dark:bg-teal-950/30 px-4 py-2 text-sm flex items-center gap-2 text-teal-700 dark:text-teal-300">
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
        <Smartphone className="h-3 w-3 me-1" />
        {t("inbox.connect")}
      </Button>
    </div>
  );
}

// ── QR pairing card ─────────────────────────────────────────────────────────
function QrPairingCard({ qrKey, onRefresh }: { qrKey: number; onRefresh: () => void }) {
  const { t } = useI18n();
  return (
    <div className="border-b bg-teal-50/50 dark:bg-teal-950/20 px-4 py-6 flex flex-col items-center gap-3">
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
        <RefreshCw className="h-3 w-3 me-1" />
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
