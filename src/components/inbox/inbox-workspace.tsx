"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Flag,
  Info,
  Loader2,
  MessageCircle,
  MessageSquareText,
  PanelRight,
  PlugZap,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  UsersRound,
  WifiOff,
} from "lucide-react";

import { CannedResponsePicker } from "@/components/inbox/canned-response-picker";
import { ConversationCollaborationPanel } from "@/components/inbox/conversation-collaboration-panel";
import {
  ActivityMessage,
  ConversationControls,
} from "@/components/inbox/conversation-controls";
import { ConversationStatusBadge } from "@/components/inbox/conversation-status-badge";
import type {
  InboxChat,
  InboxMessage,
  InboxQueueFilter,
  InboxTransportState,
} from "@/components/inbox/inbox-workspace-types";
import { MessageExtraction } from "@/components/inbox/message-extraction";
import { MessageStatus } from "@/components/inbox/message-status";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useInboxWorkspace } from "@/hooks/use-inbox-workspace";
import { useMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const QUEUE_FILTERS: InboxQueueFilter[] = [
  "all",
  "unread",
  "open",
  "pending",
  "resolved",
];

const PRIORITY_CLASS: Record<string, string> = {
  urgent: "border-destructive/30 bg-destructive/8 text-destructive",
  high: "border-orange-500/30 bg-orange-500/8 text-orange-600 dark:text-orange-400",
  medium: "border-primary/25 bg-primary/8 text-primary",
  low: "border-border bg-muted/60 text-muted-foreground",
};

function shortId(value: string): string {
  return value.length <= 10 ? value : `…${value.slice(-10)}`;
}

function relativeTime(
  value: number | undefined,
  locale: "ar" | "fr" | "en",
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (!value) return "";
  const diff = Math.max(0, Date.now() - value);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t("inbox.justNow");
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("inbox.hoursAgo", { hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("inbox.yesterday");
  if (days < 7) return t("inbox.daysAgo", { days });
  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB",
    { day: "numeric", month: "short" },
  ).format(new Date(value));
}

function messageTime(value: number, locale: "ar" | "fr" | "en"): string {
  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB",
    { hour: "2-digit", minute: "2-digit" },
  ).format(new Date(value));
}

function queueLabel(
  filter: InboxQueueFilter,
  copy: ReturnType<typeof useInboxWorkspace>["copy"],
): string {
  switch (filter) {
    case "all":
      return copy("queueAll");
    case "unread":
      return copy("queueUnread");
    case "open":
      return copy("queueOpen");
    case "pending":
      return copy("queuePending");
    case "resolved":
      return copy("queueResolved");
  }
}

function TransportPill({
  transport,
  copy,
}: {
  transport: InboxTransportState;
  copy: ReturnType<typeof useInboxWorkspace>["copy"];
}) {
  const base = "inline-flex min-h-8 items-center gap-2 rounded-full border px-2.5 text-xs font-medium";
  if (transport.reachable === false) {
    return (
      <span className={cn(base, "border-destructive/20 bg-destructive/6 text-destructive")}>
        <WifiOff className="size-3.5" aria-hidden="true" />
        {copy("transportUnavailable")}
      </span>
    );
  }
  if (transport.status === "connected" && transport.wsOpen) {
    return (
      <span className={cn(base, "border-success/20 bg-success/8 text-success")}>
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        {copy("transportConnected")}
      </span>
    );
  }
  if (
    transport.status === "connecting" ||
    (transport.status === "connected" && !transport.wsOpen)
  ) {
    return (
      <span className={cn(base, "border-warning/20 bg-warning/8 text-warning")}>
        <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
        {copy("transportReconnecting")}
      </span>
    );
  }
  if (transport.status === "qr") {
    return (
      <span className={cn(base, "border-primary/20 bg-primary/8 text-primary")}>
        <QrCode className="size-3.5" aria-hidden="true" />
        {copy("pair")}
      </span>
    );
  }
  if (transport.status === "disconnected") {
    return (
      <span className={cn(base, "border-border bg-muted/60 text-muted-foreground")}>
        <Circle className="size-3.5" aria-hidden="true" />
        {copy("transportDisconnected")}
      </span>
    );
  }
  return (
    <span className={cn(base, "border-border bg-muted/40 text-muted-foreground")}>
      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      {copy("transportChecking")}
    </span>
  );
}

function ConversationRow({
  chat,
  active,
  locale,
  t,
  onSelect,
}: {
  chat: InboxChat;
  active: boolean;
  locale: "ar" | "fr" | "en";
  t: ReturnType<typeof useInboxWorkspace>["t"];
  onSelect: () => void;
}) {
  const status = chat.workflow.status ?? "open";
  const priority = chat.workflow.priority;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group relative flex min-h-[5.75rem] w-full items-start gap-3 border-b px-3 py-3 text-start outline-none transition-colors last:border-b-0 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active ? "bg-accent/75" : "bg-background hover:bg-muted/45",
      )}
    >
      {active ? (
        <span className="absolute inset-block-2 start-0 w-0.5 rounded-full bg-primary" />
      ) : null}
      <Avatar className="mt-0.5 size-10 shrink-0 border bg-background">
        <AvatarFallback className="bg-primary/8 text-sm font-semibold text-primary">
          {chat.name.charAt(0).toUpperCase() || <MessageCircle className="size-4" />}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {chat.name}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {relativeTime(chat.lastMessageAt, locale, t)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          {chat.phone ? (
            <span dir="ltr" className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
              {chat.phone}
            </span>
          ) : null}
          <span className="ms-auto shrink-0 text-[10px] font-medium text-muted-foreground">
            {status === "pending"
              ? t("inbox.status.pending")
              : status === "resolved"
                ? t("inbox.status.resolved")
                : status === "snoozed"
                  ? t("inbox.status.snooze")
                  : t("inbox.status.open")}
          </span>
        </span>
        <span className="mt-1.5 flex items-center gap-2">
          <span className={cn(
            "min-w-0 flex-1 truncate text-xs",
            chat.unread > 0 ? "font-medium text-foreground" : "text-muted-foreground",
          )}>
            {chat.lastMessageText || "—"}
          </span>
          {priority ? (
            <Flag
              className={cn(
                "size-3.5 shrink-0",
                priority === "urgent"
                  ? "text-destructive"
                  : priority === "high"
                    ? "text-orange-500"
                    : priority === "medium"
                      ? "text-primary"
                      : "text-muted-foreground",
              )}
              aria-label={t(`inbox.priority.${priority}`)}
            />
          ) : null}
          {chat.unread > 0 ? (
            <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold leading-5 text-primary-foreground">
              {chat.unread > 99 ? "99+" : chat.unread}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function QueuePane({ workspace }: { workspace: ReturnType<typeof useInboxWorkspace> }) {
  const {
    copy,
    t,
    locale,
    filteredChats,
    queueCounts,
    queueFilter,
    setQueueFilter,
    searchQuery,
    setSearchQuery,
    activeChatId,
    selectChat,
    loadingChats,
  } = workspace;

  const unreadEmpty = queueFilter === "unread" && queueCounts.unread === 0 && !searchQuery;
  return (
    <section
      aria-label={copy("conversations")}
      className="flex min-h-0 flex-col border-e bg-background md:w-[21rem] md:min-w-[21rem]"
    >
      <div className="border-b px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{copy("conversations")}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {copy("canonicalHistory")} · {queueCounts.all}
            </p>
          </div>
          {queueCounts.unread > 0 ? (
            <Badge variant="secondary" className="gap-1 px-2 text-[11px]">
              <BellRing className="size-3" aria-hidden="true" />
              {queueCounts.unread}
            </Badge>
          ) : null}
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-label={t("inbox.searchPlaceholder")}
            placeholder={t("inbox.searchPlaceholder")}
            className="h-9 ps-8 text-sm"
          />
        </div>

        <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5" role="group" aria-label={copy("workflow")}>
          {QUEUE_FILTERS.map((filter) => {
            const selected = queueFilter === filter;
            const count = queueCounts[filter];
            return (
              <button
                key={filter}
                type="button"
                aria-pressed={selected}
                onClick={() => setQueueFilter(filter)}
                className={cn(
                  "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary/25 bg-primary/10 text-primary"
                    : "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {queueLabel(filter, copy)}
                <span className={cn("tabular-nums", selected ? "text-primary" : "text-muted-foreground/70")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loadingChats ? (
          <div className="space-y-1 p-2" aria-label={t("common.loading")}>
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="h-[5.75rem] animate-pulse rounded-md bg-muted/55" />
            ))}
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="flex min-h-56 items-center justify-center p-6 text-center">
            <div className="max-w-56">
              <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted">
                {unreadEmpty ? (
                  <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                ) : (
                  <MessageSquareText className="size-4 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              <p className="mt-3 text-sm font-medium">
                {unreadEmpty ? copy("allCaughtUp") : copy("queueEmpty")}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {unreadEmpty ? copy("allCaughtUpHint") : copy("queueEmptyHint")}
              </p>
            </div>
          </div>
        ) : (
          <div>
            {filteredChats.map((chat) => (
              <ConversationRow
                key={chat.id}
                chat={chat}
                active={chat.id === activeChatId}
                locale={locale}
                t={t}
                onSelect={() => selectChat(chat)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </section>
  );
}

function MessageBubble({
  message,
  chat,
  locale,
  t,
  onRetry,
}: {
  message: InboxMessage;
  chat: InboxChat;
  locale: "ar" | "fr" | "en";
  t: ReturnType<typeof useInboxWorkspace>["t"];
  onRetry: (message: InboxMessage) => void;
}) {
  if (message.messageType === "activity" || message.direction === "system") {
    return <ActivityMessage body={message.body} timestamp={message.timestamp} />;
  }
  const inbound = message.direction === "inbound";
  return (
    <div className="space-y-2">
      <div className={cn("flex", inbound ? "justify-start" : "justify-end")}>
        <div
          className={cn(
            "max-w-[min(42rem,82%)] rounded-2xl border px-3.5 py-2.5 shadow-xs",
            inbound
              ? "rounded-es-md border-border bg-card text-foreground"
              : "rounded-ee-md border-primary/20 bg-primary text-primary-foreground",
          )}
        >
          <p className="whitespace-pre-wrap break-words text-sm leading-6" dir="auto">
            {message.body}
          </p>
          <div
            className={cn(
              "mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums",
              inbound ? "text-muted-foreground" : "text-primary-foreground/75",
            )}
          >
            <span>{messageTime(message.timestamp, locale)}</span>
            {!inbound ? <MessageStatus status={message.deliveryStatus ?? "sent"} /> : null}
          </div>
        </div>
      </div>

      {inbound && message.body.length > 10 ? (
        <div className="ms-3 max-w-2xl">
          <MessageExtraction
            messageId={message.id}
            messageBody={message.body}
            knownPhone={chat.phone}
          />
        </div>
      ) : null}

      {!inbound && message.deliveryStatus === "failed" && message.outboxEffectKey ? (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => onRetry(message)}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {t("inbox.retry")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ConversationContext({
  chat,
  workspace,
}: {
  chat: InboxChat;
  workspace: ReturnType<typeof useInboxWorkspace>;
}) {
  const { copy, t, canUpdateConversation } = workspace;
  const workflow = chat.workflow;
  const priority = workflow.priority;
  const labels = workflow.labels ?? [];
  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {copy("conversationContext")}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Avatar className="size-10 border bg-background">
            <AvatarFallback className="bg-primary/8 font-semibold text-primary">
              {chat.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{chat.name}</p>
            {chat.phone ? (
              <p dir="ltr" className="truncate font-mono text-[11px] text-muted-foreground">
                {chat.phone}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          <section>
            <h3 className="text-xs font-semibold text-foreground">{copy("workflow")}</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ConversationStatusBadge status={workflow.status ?? "open"} />
              {priority ? (
                <Badge variant="outline" className={cn("gap-1", PRIORITY_CLASS[priority] ?? PRIORITY_CLASS.low)}>
                  <Flag className="size-3" aria-hidden="true" />
                  {t(`inbox.priority.${priority}`)}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  {copy("noPriority")}
                </Badge>
              )}
            </div>
            <div className="mt-3">
              <ConversationControls
                conversationId={chat.conversationId}
                initial={workflow}
                canUpdate={canUpdateConversation}
              />
            </div>
          </section>

          <section className="border-t pt-4">
            <h3 className="text-xs font-semibold text-foreground">{copy("labels")}</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {labels.length > 0 ? (
                labels.slice(0, 8).map((label) => (
                  <Badge key={label} variant="secondary" className="max-w-full truncate text-[11px]">
                    {label}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">{copy("noLabels")}</span>
              )}
            </div>
          </section>

          <section className="border-t pt-4">
            <h3 className="text-xs font-semibold text-foreground">{copy("collaboration")}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {workflow.assigneeId
                ? `${copy("assignment")}: ${shortId(workflow.assigneeId)}`
                : copy("unassigned")}
            </p>
            <div className="mt-2">
              <ConversationCollaborationPanel conversationId={chat.conversationId} />
            </div>
          </section>

          <section className="border-t pt-4 text-xs">
            <h3 className="font-semibold text-foreground">{copy("savedHistory")}</h3>
            <dl className="mt-2 space-y-2 text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <dt>{copy("channel")}</dt>
                <dd className="font-medium text-foreground">{chat.channel === "whatsapp" ? "WhatsApp" : copy("canonicalHistory")}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>{copy("status")}</dt>
                <dd className="font-medium text-foreground">{workflow.status ?? "open"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>{copy("priority")}</dt>
                <dd className="font-medium text-foreground">{priority ? t(`inbox.priority.${priority}`) : copy("noPriority")}</dd>
              </div>
            </dl>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

function ThreadPane({ workspace }: { workspace: ReturnType<typeof useInboxWorkspace> }) {
  const {
    activeChat,
    clearActiveChat,
    messages,
    loadingMessages,
    messagesInnerRef,
    messagesEndRef,
    locale,
    t,
    copy,
    replyText,
    setReplyText,
    sending,
    sendError,
    sendReply,
    retryFailedMessage,
    canReply,
    transport,
  } = workspace;
  const isMobile = useMobile();
  const canSend =
    Boolean(activeChat?.channel === "whatsapp") &&
    transport.status === "connected" &&
    canReply;

  if (!activeChat) {
    return (
      <section className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-muted/10 p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl border bg-background">
            <MessageSquareText className="size-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-base font-semibold">{copy("selectConversation")}</h2>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            {copy("selectConversationHint")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/10">
      <header className="flex min-h-16 items-center justify-between gap-3 border-b bg-background px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          {isMobile ? (
            <Button type="button" variant="ghost" size="icon-sm" onClick={clearActiveChat} aria-label={t("common.backToConversations")}>
              <ArrowLeft className="size-4 icon-rtl-flip" aria-hidden="true" />
            </Button>
          ) : null}
          <Avatar className="size-9 border bg-background">
            <AvatarFallback className="bg-primary/8 text-sm font-semibold text-primary">
              {activeChat.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{activeChat.name}</h2>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              {activeChat.phone ? (
                <span dir="ltr" className="truncate font-mono">{activeChat.phone}</span>
              ) : null}
              <span aria-hidden="true">·</span>
              <span>{activeChat.channel === "whatsapp" ? "WhatsApp" : copy("savedHistory")}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">
            <ConversationStatusBadge status={activeChat.workflow.status ?? "open"} />
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="icon-sm" className="xl:hidden" aria-label={copy("conversationContext")}>
                <PanelRight className="size-4 icon-rtl-flip" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="end" className="w-[min(340px,92vw)] p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>{copy("conversationContext")}</SheetTitle>
                <SheetDescription>{activeChat.name}</SheetDescription>
              </SheetHeader>
              <ConversationContext chat={activeChat} workspace={workspace} />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div
          ref={messagesInnerRef}
          className="mx-auto w-full max-w-4xl space-y-4 px-3 py-5 sm:px-6"
          role="log"
          aria-live="polite"
          aria-label={copy("messages")}
        >
          {loadingMessages ? (
            <div className="flex min-h-40 items-center justify-center" role="status">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              {t("inbox.noMessages")}
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                chat={activeChat}
                locale={locale}
                t={t}
                onRetry={(entry) => void retryFailedMessage(entry)}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <footer className="border-t bg-background px-3 py-3 sm:px-4">
        {canSend ? (
          <div className="mx-auto max-w-4xl">
            <div className="flex items-end gap-2 rounded-xl border bg-muted/20 p-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
              <CannedResponsePicker
                disabled={sending}
                onSelect={(text) =>
                  setReplyText((current) =>
                    current.trim() ? `${current.trimEnd()}\n${text}` : text,
                  )
                }
              />
              <Textarea
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendReply();
                  }
                }}
                aria-label={t("inbox.replyPlaceholder")}
                placeholder={t("inbox.replyPlaceholder")}
                disabled={sending}
                rows={1}
                className="max-h-32 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0"
              />
              <Button
                type="button"
                size="icon"
                onClick={() => void sendReply()}
                disabled={sending || !replyText.trim()}
                aria-label={t("inbox.send")}
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="size-4 icon-rtl-flip" aria-hidden="true" />
                )}
              </Button>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-[10px] text-muted-foreground">
              <span>{t("inbox.send")}: Enter · Shift+Enter</span>
              <span>{copy("savedHistory")}</span>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-4xl items-center gap-2 rounded-lg border bg-muted/25 px-3 py-2.5 text-xs text-muted-foreground">
            {canReply ? (
              <WifiOff className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <Info className="size-4 shrink-0" aria-hidden="true" />
            )}
            <span>
              {canReply ? copy("replyLiveOnly") : copy("replyRestricted")}
            </span>
          </div>
        )}
        {sendError ? (
          <div className="mx-auto mt-2 flex max-w-4xl items-center gap-2 text-xs text-destructive">
            <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
            <span>{sendError}</span>
          </div>
        ) : null}
      </footer>
    </section>
  );
}

function PairingDialog({ workspace }: { workspace: ReturnType<typeof useInboxWorkspace> }) {
  const { copy, t, transport, canManageWhatsApp, connectWhatsApp, qrKey, refreshQr } = workspace;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (transport.status === "qr") setOpen(true);
    if (transport.status === "connected") setOpen(false);
  }, [transport.status]);

  if (!canManageWhatsApp) return null;

  return (
    <>
      {transport.status !== "connected" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            const started = await connectWhatsApp();
            if (started) setOpen(true);
          }}
        >
          <Smartphone className="size-3.5" aria-hidden="true" />
          {transport.status === "qr" ? copy("pair") : copy("connect")}
        </Button>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy("pairingTitle")}</DialogTitle>
            <DialogDescription>{copy("pairingDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="rounded-xl border bg-white p-3 shadow-xs">
              {/* Dynamic opaque QR endpoint: browser image loading is intentional. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={qrKey}
                src={`/api/whatsapp/qr-image?refresh=${qrKey}`}
                alt={t("inbox.qrAlt")}
                className="size-56"
              />
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={refreshQr}>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              {copy("refreshQr")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function WorkspaceHeader({ workspace }: { workspace: ReturnType<typeof useInboxWorkspace> }) {
  const {
    t,
    copy,
    transport,
    dataDegraded,
    refreshChats,
    canManageWhatsApp,
    setLogoutConfirmOpen,
  } = workspace;
  return (
    <>
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b bg-background px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageCircle className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight">{t("nav.inbox")}</h1>
              <p className="truncate text-xs text-muted-foreground">{t("inbox.subtitle")}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <TransportPill transport={transport} copy={copy} />
          {transport.user?.id ? (
            <span dir="ltr" className="hidden max-w-32 truncate font-mono text-[10px] text-muted-foreground lg:inline">
              {transport.user.id.split("@")[0]}
            </span>
          ) : null}
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => void refreshChats()} aria-label={t("common.refresh")}>
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
          <PairingDialog workspace={workspace} />
          {transport.status === "connected" && canManageWhatsApp ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setLogoutConfirmOpen(true)}>
              <PlugZap className="size-3.5" aria-hidden="true" />
              {copy("disconnect")}
            </Button>
          ) : null}
        </div>
      </header>
      {dataDegraded ? (
        <div className="flex items-center gap-2 border-b bg-warning/6 px-3 py-2 text-xs text-warning sm:px-4" role="status">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{copy("dataDegraded")}</span>
        </div>
      ) : null}
    </>
  );
}

export function InboxWorkspace() {
  const workspace = useInboxWorkspace();
  const { activeChat, logoutConfirmOpen, setLogoutConfirmOpen, disconnectWhatsApp, t } = workspace;

  return (
    <>
      <div
        data-inbox-workspace="v2"
        className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background"
      >
        <WorkspaceHeader workspace={workspace} />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <QueuePane workspace={workspace} />
          <ThreadPane workspace={workspace} />
          {activeChat ? (
            <aside className="hidden min-h-0 w-72 min-w-72 border-s bg-background xl:block">
              <ConversationContext chat={activeChat} workspace={workspace} />
            </aside>
          ) : null}
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
        onConfirm={disconnectWhatsApp}
      />
    </>
  );
}
