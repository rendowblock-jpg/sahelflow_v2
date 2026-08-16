"use client";

import {
  AlertCircle,
  ArrowLeft,
  FileText,
  ImageIcon,
  Info,
  Loader2,
  MapPin,
  MessageSquareText,
  Mic,
  PanelRight,
  Paperclip,
  RefreshCw,
  Send,
  Sparkles,
  UserRound,
  Video,
  WifiOff,
} from "lucide-react";

import { CannedResponsePicker } from "@/components/inbox/canned-response-picker";
import { ActivityMessage } from "@/components/inbox/conversation-controls";
import { ConversationStatusBadge } from "@/components/inbox/conversation-status-badge";
import { InboxCustomerWorkPanel } from "@/components/inbox/inbox-customer-work-panel";
import type { InboxMessage } from "@/components/inbox/inbox-workspace-types";
import { MessageStatus } from "@/components/inbox/message-status";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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

function messageTime(value: number, locale: "ar" | "fr" | "en"): string {
  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB",
    { hour: "2-digit", minute: "2-digit" },
  ).format(new Date(value));
}

function MediaIcon({ type }: { type: string | undefined }) {
  switch (type) {
    case "image":
      return <ImageIcon className="size-4" aria-hidden="true" />;
    case "video":
      return <Video className="size-4" aria-hidden="true" />;
    case "audio":
      return <Mic className="size-4" aria-hidden="true" />;
    case "document":
      return <FileText className="size-4" aria-hidden="true" />;
    case "location":
      return <MapPin className="size-4" aria-hidden="true" />;
    case "contact":
      return <UserRound className="size-4" aria-hidden="true" />;
    default:
      return <Paperclip className="size-4" aria-hidden="true" />;
  }
}

function mediaLabel(
  messageType: string | undefined,
  copy: ReturnType<typeof useInboxWorkspace>["copy"],
): string {
  switch (messageType) {
    case "image":
      return copy("mediaImage");
    case "video":
      return copy("mediaVideo");
    case "audio":
      return copy("mediaAudio");
    case "document":
      return copy("mediaDocument");
    case "sticker":
      return copy("mediaSticker");
    case "location":
      return copy("mediaLocation");
    case "contact":
      return copy("mediaContact");
    default:
      return copy("mediaUnknown");
  }
}

function isMediaMessage(message: InboxMessage): boolean {
  return Boolean(
    message.messageType &&
      !["text", "activity", "template"].includes(message.messageType),
  );
}

function MessageBubble({
  message,
  locale,
  t,
  copy,
  candidate,
  onChooseCandidate,
  onRetry,
}: {
  message: InboxMessage;
  locale: "ar" | "fr" | "en";
  t: ReturnType<typeof useInboxWorkspace>["t"];
  copy: ReturnType<typeof useInboxWorkspace>["copy"];
  candidate: boolean;
  onChooseCandidate: () => void;
  onRetry: (message: InboxMessage) => void;
}) {
  if (message.messageType === "activity" || message.direction === "system") {
    return <ActivityMessage body={message.body} timestamp={message.timestamp} />;
  }

  const inbound = message.direction === "inbound";
  const media = isMediaMessage(message);
  const canExtract = inbound && message.body.trim().length > 10;

  return (
    <div className="group/message space-y-2">
      <div className={cn("flex", inbound ? "justify-start" : "justify-end")}>
        <div
          className={cn(
            "max-w-[min(42rem,86%)] rounded-2xl border px-3.5 py-2.5 shadow-xs",
            inbound
              ? "rounded-es-md border-border bg-card text-foreground"
              : "rounded-ee-md border-primary/20 bg-primary text-primary-foreground",
          )}
        >
          {media ? (
            <div
              className={cn(
                "mb-2 rounded-xl border p-3",
                inbound
                  ? "border-border bg-muted/35"
                  : "border-primary-foreground/20 bg-primary-foreground/10",
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <MediaIcon type={message.messageType} />
                <span>{mediaLabel(message.messageType, copy)}</span>
              </div>
              <p
                className={cn(
                  "mt-1.5 text-xs leading-5",
                  inbound ? "text-muted-foreground" : "text-primary-foreground/75",
                )}
              >
                {copy("mediaMetadataOnly")}
              </p>
            </div>
          ) : null}

          {message.body.trim() ? (
            <p className="whitespace-pre-wrap break-words text-[14px] leading-6" dir="auto" data-sf-user-content="true">
              {message.body}
            </p>
          ) : null}

          <div
            className={cn(
              "mt-1 flex items-center justify-end gap-1 text-xs tabular-nums",
              inbound ? "text-muted-foreground" : "text-primary-foreground/75",
            )}
          >
            <span>{messageTime(message.timestamp, locale)}</span>
            {!inbound ? <MessageStatus status={message.deliveryStatus ?? "sent"} /> : null}
          </div>
        </div>
      </div>

      {canExtract ? (
        <div className={cn("flex", inbound ? "justify-start" : "justify-end")}>
          <button
            type="button"
            onClick={onChooseCandidate}
            aria-pressed={candidate}
            className={cn(
              "ms-3 inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring",
              candidate
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover/message:opacity-100 focus-visible:opacity-100",
            )}
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            {copy("chooseOrderMessage")}
          </button>
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

export function InboxThreadWorkbench({
  workspace,
  selectedCandidate,
  onSelectCandidate,
}: {
  workspace: ReturnType<typeof useInboxWorkspace>;
  selectedCandidate: InboxMessage | null;
  onSelectCandidate: (messageId: string) => void;
}) {
  const isMobile = useMobile();
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
    canUpdateConversation,
    transport,
    refreshChats,
  } = workspace;

  if (!activeChat) {
    return (
      <section
        data-inbox-thread="empty"
        className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-muted/10 p-8"
      >
        <div className="max-w-sm text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl border bg-background">
            <MessageSquareText className="size-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <h3 className="mt-4 text-base font-semibold">{copy("selectConversation")}</h3>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{copy("selectConversationHint")}</p>
        </div>
      </section>
    );
  }

  const canSend =
    activeChat.channel === "whatsapp" &&
    transport.status === "connected" &&
    canReply;

  const renderContextPanel = () => (
    <InboxCustomerWorkPanel
      chat={activeChat}
      orderCandidate={selectedCandidate}
      canUpdateConversation={canUpdateConversation}
      refreshChats={refreshChats}
    />
  );

  return (
    <>
      <section data-inbox-thread="active" className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/10">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b bg-background px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            {isMobile ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={clearActiveChat}
                aria-label={t("common.backToConversations")}
              >
                <ArrowLeft className="size-4 icon-rtl-flip" aria-hidden="true" />
              </Button>
            ) : null}
            <Avatar className="size-9 border bg-background">
              <AvatarFallback className="bg-primary/8 text-sm font-semibold text-primary">
                {activeChat.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="truncate text-sm font-semibold">{activeChat.name}</h3>
                <ConversationStatusBadge status={activeChat.workflow.status ?? "open"} />
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                {activeChat.phone ? <span dir="ltr" className="truncate tabular-nums">{activeChat.phone}</span> : null}
                <span aria-hidden="true">·</span>
                <span className="truncate">{activeChat.channel === "whatsapp" ? "WhatsApp" : copy("savedHistory")}</span>
              </div>
            </div>
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="min-[1500px]:hidden"
                aria-label={copy("conversationContext")}
              >
                <PanelRight className="size-4 icon-rtl-flip" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side={locale === "ar" ? "left" : "right"}
              className="w-[min(390px,94vw)] p-0 sm:max-w-none"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>{copy("conversationContext")}</SheetTitle>
                <SheetDescription>{activeChat.name}</SheetDescription>
              </SheetHeader>
              {renderContextPanel()}
            </SheetContent>
          </Sheet>
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
              <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">{t("inbox.noMessages")}</div>
            ) : (
              messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  locale={locale}
                  t={t}
                  copy={copy}
                  candidate={selectedCandidate?.id === message.id}
                  onChooseCandidate={() => onSelectCandidate(message.id)}
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
                  dir="auto"
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
                  className="max-h-32 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-[14px] shadow-none focus-visible:ring-0"
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={() => void sendReply()}
                  disabled={sending || !replyText.trim()}
                  aria-label={t("inbox.send")}
                >
                  {sending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4 icon-rtl-flip" aria-hidden="true" />}
                </Button>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
                <span>{copy("composerShortcut")}</span>
                <span>{copy("savedHistory")}</span>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-4xl items-center gap-2 rounded-lg border bg-muted/25 px-3 py-2.5 text-sm text-muted-foreground">
              {canReply ? <WifiOff className="size-4 shrink-0" aria-hidden="true" /> : <Info className="size-4 shrink-0" aria-hidden="true" />}
              <span>{canReply ? copy("replyLiveOnly") : copy("replyRestricted")}</span>
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

      {!isMobile ? (
        <aside className="hidden min-h-0 w-[19rem] min-w-[19rem] border-s bg-background min-[1500px]:block">
          {renderContextPanel()}
        </aside>
      ) : null}
    </>
  );
}
