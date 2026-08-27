"use client";

import { Fragment, useRef } from "react";
import {
  AlertCircle,
  ArrowLeft,
  FileText,
  ImageIcon,
  Info,
  Loader2,
  Mail,
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
import {
  ActivityMessage,
  StatusControl,
} from "@/components/inbox/conversation-controls";
import { ConversationStatusBadge } from "@/components/inbox/conversation-status-badge";
import { InboxCustomerWorkPanel } from "@/components/inbox/inbox-customer-work-panel";
import { InboxMediaAttachment } from "@/components/inbox/inbox-media-attachment";
import type { InboxMessage } from "@/components/inbox/inbox-workspace-types";
import { MessageExtraction } from "@/components/inbox/message-extraction";
import { MessageStatus } from "@/components/inbox/message-status";
import { WhatsAppPairingDialog } from "@/components/inbox/whatsapp-pairing-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

function localeCode(locale: "ar" | "fr" | "en"): string {
  return locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB";
}

function messageTime(value: number, locale: "ar" | "fr" | "en"): string {
  return new Intl.DateTimeFormat(localeCode(locale), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function messageDayKey(value: number): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function messageDayLabel(value: number, locale: "ar" | "fr" | "en"): string {
  return new Intl.DateTimeFormat(localeCode(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
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

function formatBytes(value: number, locale: "ar" | "fr" | "en"): string {
  if (value < 1_024) return `${value} B`;
  const formatter = new Intl.NumberFormat(localeCode(locale), {
    maximumFractionDigits: 1,
  });
  if (value < 1_024 * 1_024) return `${formatter.format(value / 1_024)} KB`;
  return `${formatter.format(value / (1_024 * 1_024))} MB`;
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
  const binaryMedia = Boolean(
    message.messageType &&
      ["image", "video", "audio", "document", "sticker"].includes(
        message.messageType,
      ),
  );
  const canExtract = inbound && message.body.trim().length > 10;

  return (
    <div className="group/message space-y-1.5">
      <div className={cn("flex", inbound ? "justify-start" : "justify-end")}>
        <div
          className={cn(
            "max-w-[min(38rem,80%)] rounded-[1.15rem] border px-3.5 py-2.5 shadow-[0_1px_1px_rgba(0,0,0,0.04)]",
            inbound
              ? "rounded-es-md border-border/70 bg-background text-foreground"
              : "rounded-ee-md border-primary/20 bg-primary/10 text-foreground",
          )}
        >
          {media ? (
            <div
              className={cn(
                "mb-2 rounded-xl border p-3",
                inbound
                  ? "border-border/60 bg-muted/30"
                  : "border-primary/15 bg-background/55",
              )}
            >
              {binaryMedia ? (
                <InboxMediaAttachment message={message} />
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MediaIcon type={message.messageType} />
                    <span>{mediaLabel(message.messageType, copy)}</span>
                  </div>
                  {message.attachment?.fileName ? (
                    <p className="mt-1.5 break-all text-xs" dir="auto">
                      {message.attachment.fileName}
                    </p>
                  ) : null}
                  {message.attachment?.contact ? (
                    <p className="mt-1.5 text-xs" dir="auto">
                      {message.attachment.contact.displayName}
                    </p>
                  ) : null}
                  {message.attachment?.location ? (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${encodeURIComponent(message.attachment.location.latitude)}&mlon=${encodeURIComponent(message.attachment.location.longitude)}#map=17/${encodeURIComponent(message.attachment.location.latitude)}/${encodeURIComponent(message.attachment.location.longitude)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex min-h-8 items-center text-xs font-medium underline underline-offset-4"
                    >
                      {message.attachment.location.name ??
                        message.attachment.location.address ??
                        copy("openLocation")}
                    </a>
                  ) : null}
                  {message.attachment &&
                  (message.attachment.mimeType ||
                    message.attachment.sizeBytes !== null) ? (
                    <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                      {[
                        message.attachment.mimeType,
                        message.attachment.sizeBytes !== null
                          ? formatBytes(message.attachment.sizeBytes, locale)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    {message.attachment?.state === "rejected"
                      ? copy("mediaRejected")
                      : message.attachment?.state === "ready"
                        ? copy("structuredAttachmentReady")
                        : copy("mediaMetadataOnly")}
                  </p>
                </>
              )}
            </div>
          ) : null}

          {message.body.trim() ? (
            <p
              className="whitespace-pre-wrap break-words text-[14px] leading-[1.65]"
              dir="auto"
              data-sf-user-content="true"
            >
              {message.body}
            </p>
          ) : null}

          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums text-muted-foreground">
            <span>{messageTime(message.timestamp, locale)}</span>
            {!inbound ? (
              <MessageStatus status={message.deliveryStatus ?? "sent"} />
            ) : null}
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
              "ms-2 inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring",
              candidate
                ? "bg-primary/9 text-primary"
                : "text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover/message:opacity-100 focus-visible:opacity-100",
            )}
          >
            <Sparkles className="size-3" aria-hidden="true" />
            {copy("chooseOrderMessage")}
          </button>
        </div>
      ) : null}

      {!inbound &&
      message.deliveryStatus === "failed" &&
      message.outboxEffectKey ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRetry(message)}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {t("inbox.retry")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function InboxV3Thread({
  workspace,
  selectedCandidate,
  onBackToQueue,
  onSelectCandidate,
}: {
  workspace: ReturnType<typeof useInboxWorkspace>;
  selectedCandidate: InboxMessage | null;
  onBackToQueue: () => void;
  onSelectCandidate: (messageId: string) => void;
}) {
  const isMobile = useMobile();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const {
    activeChat,
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
    sendImage,
    sendVideo,
    sendDocument,
    retryFailedMessage,
    canReply,
    canUpdateConversation,
    transport,
    refreshChats,
    markUnread,
  } = workspace;

  if (!activeChat) {
    return (
      <section
        id="inbox-thread-pane"
        data-inbox-thread="empty"
        className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-muted/[0.06] p-8"
      >
        <div className="max-w-sm text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-background shadow-sm">
            <MessageSquareText
              className="size-5 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <h3 className="mt-4 text-base font-semibold">
            {copy("selectConversation")}
          </h3>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            {copy("selectConversationHint")}
          </p>
        </div>
      </section>
    );
  }

  const isWhatsAppConversation = activeChat.channel === "whatsapp";
  const canCompose = isWhatsAppConversation && canReply;
  const canSend = canCompose && transport.status === "connected";

  const renderContextPanel = () => (
    <InboxCustomerWorkPanel
      key={activeChat.conversationId}
      chat={activeChat}
      orderCandidate={selectedCandidate}
      canUpdateConversation={canUpdateConversation}
      refreshChats={refreshChats}
    />
  );

  return (
    <section
      id="inbox-thread-pane"
      data-inbox-thread="active"
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/[0.06]"
    >
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border/60 bg-background/95 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {isMobile ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onBackToQueue}
              aria-label={t("common.backToConversations")}
            >
              <ArrowLeft
                className="size-4 icon-rtl-flip"
                aria-hidden="true"
              />
            </Button>
          ) : null}

          <Avatar className="size-9 border border-border/70 bg-background">
            <AvatarFallback className="bg-primary/7 text-[13px] font-semibold text-primary">
              {activeChat.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h3 dir="auto" className="truncate text-[13px] font-semibold">
                {activeChat.name}
              </h3>
              {canUpdateConversation ? (
                <StatusControl
                  key={`${activeChat.conversationId}:${activeChat.workflow.status ?? "open"}`}
                  conversationId={activeChat.conversationId}
                  initialStatus={activeChat.workflow.status ?? "open"}
                  appearance="badge"
                  onUpdated={() => void refreshChats()}
                />
              ) : (
                <ConversationStatusBadge
                  status={activeChat.workflow.status ?? "open"}
                />
              )}
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              {activeChat.phone ? (
                <span dir="ltr" className="truncate tabular-nums">
                  {activeChat.phone}
                </span>
              ) : null}
              {activeChat.phone ? <span aria-hidden="true">·</span> : null}
              <span className="truncate">
                {isWhatsAppConversation ? "WhatsApp" : copy("savedHistory")}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {canUpdateConversation ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={copy("markUnread")}
                  onClick={() => {
                    void markUnread(activeChat).then((updated) => {
                      if (updated) onBackToQueue();
                    });
                  }}
                >
                  <Mail className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {copy("markUnread")}
              </TooltipContent>
            </Tooltip>
          ) : null}
          <Sheet>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <SheetTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      disabled={!selectedCandidate || !activeChat.transportId}
                      aria-label={t("inbox.extractOrderProfessionally")}
                    >
                      <Sparkles className="size-4" aria-hidden="true" />
                    </Button>
                  </SheetTrigger>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {t("inbox.extractOrderProfessionally")}
              </TooltipContent>
            </Tooltip>
            <SheetContent
              side="end"
              className="w-[min(440px,94vw)] overflow-y-auto sm:max-w-none"
            >
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" aria-hidden="true" />
                  {t("inbox.aiOrderAssistant")}
                </SheetTitle>
                <SheetDescription>
                  {copy("orderCandidateHint")}
                </SheetDescription>
              </SheetHeader>
              {selectedCandidate && activeChat.transportId ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {copy("orderCandidate")}
                    </p>
                    <p
                      dir="auto"
                      className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 [unicode-bidi:plaintext]"
                    >
                      {selectedCandidate.body}
                    </p>
                  </div>
                  <MessageExtraction
                    key={`${activeChat.conversationId}:${selectedCandidate.id}:header`}
                    conversationId={activeChat.transportId}
                    messageId={selectedCandidate.id}
                    messageBody={selectedCandidate.body}
                    knownPhone={activeChat.phone}
                  />
                </div>
              ) : null}
            </SheetContent>
          </Sheet>

          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={copy("conversationContext")}
              >
                <PanelRight
                  className="size-4 icon-rtl-flip"
                  aria-hidden="true"
                />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="end"
              className="w-[min(400px,94vw)] p-0 sm:max-w-none"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>{copy("conversationContext")}</SheetTitle>
                <SheetDescription>{activeChat.name}</SheetDescription>
              </SheetHeader>
              {renderContextPanel()}
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div
          ref={messagesInnerRef}
          className="mx-auto w-full max-w-[56rem] space-y-3 px-3 py-5 sm:px-6 lg:px-8"
          role="log"
          aria-live="polite"
          aria-label={copy("messages")}
        >
          {loadingMessages ? (
            <div
              className="flex min-h-40 items-center justify-center"
              role="status"
            >
              <Loader2
                className="size-5 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              {t("inbox.noMessages")}
            </div>
          ) : (
            messages.map((message, index) => {
              const previous = index > 0 ? messages[index - 1] : null;
              const showDay =
                !previous ||
                messageDayKey(previous.timestamp) !==
                  messageDayKey(message.timestamp);
              return (
                <Fragment key={message.id}>
                  {showDay ? (
                    <div
                      role="separator"
                      className="flex items-center gap-3 py-2 text-[10px] font-medium text-muted-foreground"
                    >
                      <span className="h-px flex-1 bg-border/55" />
                      <span>{messageDayLabel(message.timestamp, locale)}</span>
                      <span className="h-px flex-1 bg-border/55" />
                    </div>
                  ) : null}
                  <MessageBubble
                    message={message}
                    locale={locale}
                    t={t}
                    copy={copy}
                    candidate={selectedCandidate?.id === message.id}
                    onChooseCandidate={() => onSelectCandidate(message.id)}
                    onRetry={(entry) => void retryFailedMessage(entry)}
                  />
                </Fragment>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <footer className="border-t border-border/60 bg-background/98 px-3 py-2.5 sm:px-4">
        {canCompose ? (
          <div className="mx-auto max-w-[56rem]">
            {!canSend ? (
              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-warning/15 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
                <WifiOff
                  className="size-3.5 shrink-0 text-warning"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">{copy("replyLiveOnly")}</span>
                <WhatsAppPairingDialog workspace={workspace} />
              </div>
            ) : null}

            <div className="flex items-end gap-2 rounded-2xl border border-border/75 bg-muted/15 p-2 shadow-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/15">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label={copy("mediaImage")}
                className="sr-only"
                tabIndex={-1}
                data-inbox-image-input="true"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  event.currentTarget.value = "";
                  if (!file) return;
                  const declaredType =
                    file.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
                  if (
                    declaredType &&
                    declaredType !== "application/octet-stream"
                  ) {
                    void sendImage(file);
                    return;
                  }
                  void file
                    .slice(0, 12)
                    .arrayBuffer()
                    .then((buffer) => {
                      const bytes = new Uint8Array(buffer);
                      const ascii = (start: number, end: number) =>
                        String.fromCharCode(...bytes.slice(start, end));
                      let sniffedType = "";
                      if (
                        bytes.length >= 3 &&
                        bytes[0] === 0xff &&
                        bytes[1] === 0xd8 &&
                        bytes[2] === 0xff
                      ) {
                        sniffedType = "image/jpeg";
                      } else if (
                        bytes.length >= 8 &&
                        bytes[0] === 0x89 &&
                        ascii(1, 4) === "PNG" &&
                        bytes[4] === 0x0d &&
                        bytes[5] === 0x0a &&
                        bytes[6] === 0x1a &&
                        bytes[7] === 0x0a
                      ) {
                        sniffedType = "image/png";
                      } else if (
                        bytes.length >= 12 &&
                        ascii(0, 4) === "RIFF" &&
                        ascii(8, 12) === "WEBP"
                      ) {
                        sniffedType = "image/webp";
                      }
                      if (!sniffedType) {
                        void sendImage(file);
                        return;
                      }
                      void sendImage(
                        new File([file], file.name, {
                          type: sniffedType,
                          lastModified: file.lastModified,
                        }),
                      );
                    })
                    .catch(() => void sendImage(file));
                }}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4"
                aria-label={copy("mediaVideo")}
                className="sr-only"
                tabIndex={-1}
                data-inbox-video-input="true"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  event.currentTarget.value = "";
                  if (!file) return;
                  const declaredType =
                    file.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
                  if (
                    declaredType &&
                    declaredType !== "application/octet-stream"
                  ) {
                    void sendVideo(file);
                    return;
                  }
                  void file
                    .slice(0, 12)
                    .arrayBuffer()
                    .then((buffer) => {
                      const bytes = new Uint8Array(buffer);
                      const fileType = String.fromCharCode(...bytes.slice(4, 8));
                      if (bytes.length < 12 || fileType !== "ftyp") {
                        void sendVideo(file);
                        return;
                      }
                      void sendVideo(
                        new File([file], file.name, {
                          type: "video/mp4",
                          lastModified: file.lastModified,
                        }),
                      );
                    })
                    .catch(() => void sendVideo(file));
                }}
              />
              <input
                ref={documentInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/plain,text/csv"
                aria-label={copy("mediaDocument")}
                className="sr-only"
                tabIndex={-1}
                data-inbox-document-input="true"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  event.currentTarget.value = "";
                  if (!file) return;
                  void sendDocument(file);
                }}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={sending || !canSend}
                    aria-label={copy("mediaImage")}
                    data-inbox-image-picker="true"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <ImageIcon className="size-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  {copy("mediaImage")}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={sending || !canSend}
                    aria-label={copy("mediaVideo")}
                    data-inbox-video-picker="true"
                    onClick={() => videoInputRef.current?.click()}
                  >
                    <Video className="size-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  {copy("mediaVideo")}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={sending || !canSend}
                    aria-label={copy("mediaDocument")}
                    data-inbox-document-picker="true"
                    onClick={() => documentInputRef.current?.click()}
                  >
                    <FileText className="size-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  {copy("mediaDocument")}
                </TooltipContent>
              </Tooltip>
              <CannedResponsePicker
                disabled={sending}
                onSelect={(text) =>
                  setReplyText((current) =>
                    current.trim() ? `${current.trimEnd()}\n${text}` : text,
                  )
                }
              />
              <Textarea
                dir={
                  replyText.trim()
                    ? "auto"
                    : locale === "ar"
                      ? "rtl"
                      : "auto"
                }
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && canSend) {
                    event.preventDefault();
                    void sendReply();
                  }
                }}
                aria-label={t("inbox.replyPlaceholder")}
                placeholder={t("inbox.replyPlaceholder")}
                disabled={sending}
                rows={1}
                className="max-h-32 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-start text-[14px] shadow-none focus-visible:ring-0"
              />
              <Button
                type="button"
                size="icon"
                onClick={() => void sendReply()}
                disabled={sending || !canSend || !replyText.trim()}
                aria-label={t("inbox.send")}
              >
                {sending ? (
                  <Loader2
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Send
                    className="size-4 icon-rtl-flip"
                    aria-hidden="true"
                  />
                )}
              </Button>
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
              {copy("composerShortcut")}
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[56rem] items-center gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
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
          <div className="mx-auto mt-2 flex max-w-[56rem] items-center gap-2 text-xs text-destructive">
            <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
            <span>{sendError}</span>
          </div>
        ) : null}
      </footer>
    </section>
  );
}
