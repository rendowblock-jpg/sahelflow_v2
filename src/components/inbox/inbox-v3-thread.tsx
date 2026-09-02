"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
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
  Plus,
  RefreshCw,
  Reply,
  Send,
  Sparkles,
  Trash2,
  UserRound,
  Video,
  WifiOff,
  X,
} from "lucide-react";

import { CannedResponsePicker } from "@/components/inbox/canned-response-picker";
import {
  ActivityMessage,
  StatusControl,
} from "@/components/inbox/conversation-controls";
import { ConversationStatusBadge } from "@/components/inbox/conversation-status-badge";
import { InboxCustomerWorkPanel } from "@/components/inbox/inbox-customer-work-panel";
import {
  InboxMediaAttachment,
  documentKind,
} from "@/components/inbox/inbox-media-attachment";
import type { InboxMessage } from "@/components/inbox/inbox-workspace-types";
import { MessageExtraction } from "@/components/inbox/message-extraction";
import { MessageStatus } from "@/components/inbox/message-status";
import { WhatsAppPairingDialog } from "@/components/inbox/whatsapp-pairing-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useVoiceRecorder } from "@/components/inbox/use-voice-recorder";

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

/** "Active …" hint appears only after the thread has been idle this long. */
const LAST_ACTIVE_MIN_IDLE_MS = 5 * 60_000;
const LAST_ACTIVE_REFRESH_MS = 30_000;

function relativeLastActive(
  value: number,
  now: number,
  locale: "ar" | "fr" | "en",
): string {
  const diff = Math.max(0, now - value);
  const rtf = new Intl.RelativeTimeFormat(localeCode(locale), {
    numeric: "auto",
  });
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return rtf.format(-days, "day");
  return new Intl.DateTimeFormat(localeCode(locale), {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

/**
 * Last-seen fallback (R4-a liveness). The WhatsApp sidecar emits no
 * presence/typing events (SidecarEvent is status/qr/message/message-update
 * only), so the thread header leans on persisted `lastMessageAt` instead of
 * live presence: an obviously-live conversation stays quiet, and once the
 * thread has been idle for 5+ minutes a muted "Active 12 minutes ago" hint
 * appears and refreshes on a slow 30s cadence.
 */
function ThreadLastActive({
  lastMessageAt,
  locale,
  t,
}: {
  lastMessageAt: number | undefined;
  locale: "ar" | "fr" | "en";
  t: ReturnType<typeof useInboxWorkspace>["t"];
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!lastMessageAt) return;
    const idleMs = Date.now() - lastMessageAt;
    // Self-scheduling wake-up: sleep until the indicator becomes visible,
    // then refresh on a slow cadence — never a busy interval.
    const delay =
      idleMs < LAST_ACTIVE_MIN_IDLE_MS
        ? LAST_ACTIVE_MIN_IDLE_MS - idleMs + 1_000
        : LAST_ACTIVE_REFRESH_MS;
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [lastMessageAt, now]);

  if (!lastMessageAt) return null;
  if (now - lastMessageAt < LAST_ACTIVE_MIN_IDLE_MS) return null;

  return (
    <>
      <span aria-hidden="true">·</span>
      <span
        dir="auto"
        data-inbox-last-active="true"
        className="shrink-0 truncate"
      >
        {t("inbox.liveness.lastActive", {
          time: relativeLastActive(lastMessageAt, now, locale),
        })}
      </span>
    </>
  );
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

const DOCUMENT_DROP_PATTERN = /\.(pdf|docx?|xlsx?|txt|csv)$/i;

/**
 * Permission-preserving clipboard write with an in-memory fallback. Returns
 * false only when the browser refused both paths so the UI can show a
 * truthful failure state (#317 safe message copy).
 */
async function writeClipboardText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy in-memory path.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function CopyMessageButton({
  text,
  copy,
}: {
  text: string;
  copy: ReturnType<typeof useInboxWorkspace>["copy"];
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <button
      type="button"
      onClick={() => {
        void writeClipboardText(text).then((ok) => {
          setState(ok ? "copied" : "failed");
          if (timerRef.current) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => setState("idle"), 2_000);
        });
      }}
      aria-live="polite"
      className={cn(
        "ms-2 inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 text-2xs font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring",
        state === "failed"
          ? "text-destructive opacity-100"
          : state === "copied"
            ? "text-primary opacity-100"
            : "text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover/message:opacity-100 focus-visible:opacity-100",
      )}
    >
      {state === "copied" ? (
        <Check className="size-3" aria-hidden="true" />
      ) : state === "failed" ? (
        <X className="size-3" aria-hidden="true" />
      ) : (
        <Copy className="size-3" aria-hidden="true" />
      )}
      {state === "copied"
        ? copy("messageCopied")
        : state === "failed"
          ? copy("messageCopyFailed")
          : copy("copyMessage")}
    </button>
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
  onReply,
  canInteract,
  upload,
  onCancelUpload,
}: {
  message: InboxMessage;
  locale: "ar" | "fr" | "en";
  t: ReturnType<typeof useInboxWorkspace>["t"];
  copy: ReturnType<typeof useInboxWorkspace>["copy"];
  candidate: boolean;
  onChooseCandidate: () => void;
  onRetry: (message: InboxMessage) => void;
  onReply: (message: InboxMessage) => void;
  canInteract: boolean;
  upload?: { progress: number; cancellable: boolean };
  onCancelUpload: (messageId: string) => void;
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

  // Chat geometry is direction-independent on purpose: inbound bubbles sit on
  // the physical left and outbound on the physical right in every locale —
  // the convention Algerian sellers know from WhatsApp in French/English.
  // Pinning dir="ltr" here stops the RTL document from flipping justify-* and
  // the logical corner tails; message text itself stays dir="auto" below.
  return (
    <div className="group/message space-y-1.5" dir="ltr">
      <div className={cn("flex", inbound ? "justify-start" : "justify-end")}>
        <div
          className={cn(
            "max-w-[min(38rem,80%)] rounded-[1.15rem] border px-3.5 py-2.5 shadow-[0_1px_1px_rgba(0,0,0,0.04)]",
            inbound
              ? "rounded-es-md border-border/70 bg-background text-foreground"
              : "rounded-ee-md border-primary/20 bg-primary/10 text-foreground",
          )}
        >
          {message.quoted || message.quotedMessageId ? (
            <div className="mb-2 rounded-lg border-s-2 border-primary/40 bg-background/60 px-2.5 py-1.5">
              <div className="flex items-center gap-1 text-2xs font-medium text-primary">
                <Reply className="size-3" aria-hidden="true" />
                <span>{copy("replyingTo")}</span>
              </div>
              <p
                className="mt-0.5 line-clamp-2 break-words text-2xs leading-4 text-muted-foreground"
                dir="auto"
              >
                {message.quoted?.preview || "…"}
              </p>
            </div>
          ) : null}

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
                        documentKind(
                          message.attachment.fileName ?? null,
                          message.attachment.mimeType,
                        ).label,
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

          {!inbound && upload ? (
            <div
              className="mt-2"
              role="status"
              aria-label={copy("uploadProgress", { percent: upload.progress })}
            >
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${upload.progress}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-2xs tabular-nums text-muted-foreground">
                  {copy("uploadProgress", { percent: upload.progress })}
                </span>
                {upload.cancellable ? (
                  <button
                    type="button"
                    onClick={() => onCancelUpload(message.id)}
                    className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-2xs font-medium text-destructive outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-3" aria-hidden="true" />
                    {copy("cancelUpload")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-1 flex items-center justify-end gap-1 text-2xs tabular-nums text-muted-foreground">
            <span>{messageTime(message.timestamp, locale)}</span>
            {!inbound ? (
              <MessageStatus status={message.deliveryStatus ?? "sent"} />
            ) : null}
          </div>
        </div>
      </div>

      {message.body.trim() || message.attachment?.fileName ? (
        <div
          className={cn(
            "flex gap-1",
            inbound ? "justify-start" : "justify-end",
          )}
        >
          {canInteract ? (
            <button
              type="button"
              onClick={() => onReply(message)}
              aria-label={copy("replyToMessage")}
              className="inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 text-2xs font-medium text-muted-foreground opacity-0 outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/message:opacity-100"
            >
              <Reply className="size-3 icon-rtl-flip" aria-hidden="true" />
              {copy("replyToMessage")}
            </button>
          ) : null}
          <CopyMessageButton
            text={message.body.trim() || message.attachment?.fileName || ""}
            copy={copy}
          />
        </div>
      ) : null}

      {canExtract ? (
        <div className={cn("flex", inbound ? "justify-start" : "justify-end")}>
          <button
            type="button"
            onClick={onChooseCandidate}
            aria-pressed={candidate}
            className={cn(
              "ms-2 inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 text-2xs font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring",
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
        <div className="flex flex-col items-end gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRetry(message)}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {t("inbox.retry")}
          </Button>
          {message.outboxErrorCode ? (
            <span className="font-mono text-2xs text-muted-foreground">
              {message.outboxErrorCode}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatRecordingElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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
  const audioInputRef = useRef<HTMLInputElement | null>(null);
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
    setSendError,
    sendReply,
    sendImage,
    sendVideo,
    sendDocument,
    sendVoice,
    uploads,
    cancelUpload,
    retryFailedMessage,
    canReply,
    canUpdateConversation,
    transport,
    refreshChats,
    markUnread,
  } = workspace;

  const [replySelection, setReplySelection] = useState<{
    key: string | null;
    message: InboxMessage | null;
  }>({ key: null, message: null });
  const [dragSession, setDragSession] = useState<{
    key: string | null;
    active: boolean;
  }>({ key: null, active: false });
  const activeConversationKey = activeChat?.conversationId ?? null;
  // Quote/drag state is conversation-scoped: deriving from the active key
  // clears both automatically on conversation switches without an effect.
  const replyTarget =
    replySelection.key === activeConversationKey ? replySelection.message : null;
  const dragActive =
    dragSession.key === activeConversationKey && dragSession.active;
  const setReplyTarget = (message: InboxMessage | null) =>
    setReplySelection({ key: activeConversationKey, message });
  const setDragActive = (active: boolean) =>
    setDragSession({ key: activeConversationKey, active });

  /**
   * In-composer voice recording (founder-installed Internal.28 campaign):
   * the mic button starts a bounded MediaRecorder take and hands the OGG/Opus
   * file to the same durable `sendVoice` path as the pickers (#329).
   */
  const voiceRecorder = useVoiceRecorder({
    enabled:
      activeChat?.channel === "whatsapp" &&
      canReply &&
      transport.status === "connected" &&
      !sending,
    onComplete: (file) => {
      const quotedId = replyTarget?.id ?? null;
      setReplyTarget(null);
      void sendVoice(file, quotedId);
    },
    onError: (message) => setSendError(message),
    copy: {
      micPermissionDenied: copy("voiceMicPermissionDenied"),
      micDeviceNotFound: copy("voiceMicDeviceNotFound"),
      micUnavailable: copy("voiceMicUnavailable"),
      recordingUnsupported: copy("voiceRecordingUnsupported"),
      processingFailed: copy("voiceProcessingFailed"),
    },
  });

  // Conversation switches (and unmounts) must never leave a live take open:
  // the cleanup discards the recording and releases the microphone.
  const { dispose: disposeVoiceTake } = voiceRecorder;
  useEffect(() => {
    return () => disposeVoiceTake();
  }, [activeConversationKey, disposeVoiceTake]);

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

  /**
   * Paste/drop ingestion (#317): route one dropped or pasted file into the
   * exact same validated send paths as the pickers — limits and permissions
   * are enforced by the hooks, never bypassed here.
   */
  const ingestSharedFile = (file: File) => {
    if (!canSend || voiceRecorder.state !== "idle") return;
    const quotedId = replyTarget?.id ?? null;
    const type = file.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    if (type.startsWith("image/")) {
      setReplyTarget(null);
      void sendImage(file, quotedId);
      return;
    }
    if (type === "video/mp4") {
      setReplyTarget(null);
      void sendVideo(file, quotedId);
      return;
    }
    if (type.startsWith("audio/")) {
      setReplyTarget(null);
      void sendVoice(file, quotedId);
      return;
    }
    if (
      type === "application/pdf" ||
      DOCUMENT_DROP_PATTERN.test(file.name)
    ) {
      setReplyTarget(null);
      void sendDocument(file, quotedId);
    }
  };

  const dispatchReply = () => {
    const quotedId = replyTarget?.id ?? null;
    setReplyTarget(null);
    void sendReply(quotedId);
  };

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
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
              {activeChat.phone ? (
                <span dir="ltr" className="truncate tabular-nums">
                  {activeChat.phone}
                </span>
              ) : null}
              {activeChat.phone ? <span aria-hidden="true">·</span> : null}
              <span className="truncate">
                {isWhatsAppConversation ? "WhatsApp" : copy("savedHistory")}
              </span>
              <ThreadLastActive
                lastMessageAt={activeChat.lastMessageAt}
                locale={locale}
                t={t}
              />
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

      <ScrollArea
        className={cn(
          "min-h-0 flex-1",
          // Short conversations anchor to the composer like WhatsApp — the
          // dead space between the last message and the composer is closed.
          messages.length > 0 &&
            !loadingMessages &&
            "[&_[data-slot=scroll-area-viewport]>div]:flex [&_[data-slot=scroll-area-viewport]>div]:min-h-full [&_[data-slot=scroll-area-viewport]>div]:flex-col [&_[data-slot=scroll-area-viewport]>div]:justify-end",
        )}
      >
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
                      className="flex items-center gap-3 py-2 text-2xs font-medium text-muted-foreground"
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
                    onReply={(entry) => setReplyTarget(entry)}
                    canInteract={canSend}
                    upload={uploads[message.id]}
                    onCancelUpload={cancelUpload}
                  />
                </Fragment>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <footer className="border-t border-border/60 bg-background/98 px-3 py-2 sm:px-4">
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

            <div
              className="rounded-2xl border border-border/75 bg-muted/15 p-2 shadow-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/15 data-[drag-active=true]:border-primary data-[drag-active=true]:bg-primary/5"
              data-drag-active={dragActive ? "true" : "false"}
              onDragOver={(event) => {
                if (!canSend) return;
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                setDragActive(false);
              }}
              onDrop={(event) => {
                if (!canSend) return;
                event.preventDefault();
                setDragActive(false);
                const file = event.dataTransfer?.files?.[0];
                if (file) ingestSharedFile(file);
              }}
              onPaste={(event) => {
                const file = event.clipboardData?.files?.[0];
                if (file && canSend) {
                  event.preventDefault();
                  ingestSharedFile(file);
                }
              }}
            >
              {replyTarget ? (
                <div
                  className="flex w-full items-start gap-2 rounded-xl border border-border/70 bg-background/80 px-2.5 py-1.5"
                  data-inbox-reply-chip="true"
                >
                  <Reply
                    className="mt-0.5 size-3.5 shrink-0 text-primary icon-rtl-flip"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-2xs font-medium text-primary">
                      {copy("replyingTo")}
                    </p>
                    <p
                      className="truncate text-2xs leading-4 text-muted-foreground"
                      dir="auto"
                    >
                      {replyTarget.body.trim() ||
                        replyTarget.attachment?.fileName ||
                        "…"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyTarget(null)}
                    aria-label={t("common.cancel")}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              ) : null}
              {voiceRecorder.state !== "idle" ? (
                <div
                  className="flex items-center gap-2 px-1 py-1"
                  data-inbox-voice-recorder={voiceRecorder.state}
                  role="status"
                  aria-label={copy("voiceRecording")}
                >
                  {voiceRecorder.state === "starting" ? (
                    <Loader2
                      className="size-4 shrink-0 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="relative flex size-2.5 shrink-0">
                      <span
                        className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/60"
                        aria-hidden="true"
                      />
                      <span
                        className="relative inline-flex size-2.5 rounded-full bg-destructive"
                        aria-hidden="true"
                      />
                    </span>
                  )}
                  <span
                    className="shrink-0 text-[13px] font-medium tabular-nums"
                    dir="ltr"
                  >
                    {formatRecordingElapsed(voiceRecorder.elapsedMs)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                    {copy("voiceRecording")}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={copy("voiceCancelRecording")}
                        data-inbox-voice-cancel="true"
                        onClick={voiceRecorder.cancel}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>
                      {copy("voiceCancelRecording")}
                    </TooltipContent>
                  </Tooltip>
                  <Button
                    type="button"
                    size="icon"
                    aria-label={copy("voiceStopAndSend")}
                    data-inbox-voice-send="true"
                    disabled={voiceRecorder.state !== "recording"}
                    onClick={voiceRecorder.stopAndSend}
                  >
                    <Check className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : (
              <div className="flex items-end gap-2">
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
                  const quotedId = replyTarget?.id ?? null;
                  setReplyTarget(null);
                  const declaredType =
                    file.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
                  if (
                    declaredType &&
                    declaredType !== "application/octet-stream"
                  ) {
                    void sendImage(file, quotedId);
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
                        void sendImage(file, quotedId);
                        return;
                      }
                      void sendImage(
                        new File([file], file.name, {
                          type: sniffedType,
                          lastModified: file.lastModified,
                        }),
                        quotedId,
                      );
                    })
                    .catch(() => void sendImage(file, quotedId));
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
                  const quotedId = replyTarget?.id ?? null;
                  setReplyTarget(null);
                  const declaredType =
                    file.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
                  if (
                    declaredType &&
                    declaredType !== "application/octet-stream"
                  ) {
                    void sendVideo(file, quotedId);
                    return;
                  }
                  void file
                    .slice(0, 12)
                    .arrayBuffer()
                    .then((buffer) => {
                      const bytes = new Uint8Array(buffer);
                      const fileType = String.fromCharCode(...bytes.slice(4, 8));
                      if (bytes.length < 12 || fileType !== "ftyp") {
                        void sendVideo(file, quotedId);
                        return;
                      }
                      void sendVideo(
                        new File([file], file.name, {
                          type: "video/mp4",
                          lastModified: file.lastModified,
                        }),
                        quotedId,
                      );
                    })
                    .catch(() => void sendVideo(file, quotedId));
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
                  const quotedId = replyTarget?.id ?? null;
                  setReplyTarget(null);
                  void sendDocument(file, quotedId);
                }}
              />
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/ogg,audio/opus,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav,.ogg,.oga,.opus,.mp3,.m4a,.aac,.wav"
                aria-label={copy("mediaAudio")}
                className="sr-only"
                tabIndex={-1}
                data-inbox-audio-input="true"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  event.currentTarget.value = "";
                  if (!file) return;
                  const quotedId = replyTarget?.id ?? null;
                  setReplyTarget(null);
                  void sendVoice(file, quotedId);
                }}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={sending || !canSend}
                        aria-label={copy("attachMenu")}
                        data-inbox-attach-menu="true"
                      >
                        <Plus className="size-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="start" sideOffset={8}>
                      <DropdownMenuItem
                        data-inbox-image-picker="true"
                        disabled={sending || !canSend}
                        onClick={() => imageInputRef.current?.click()}
                      >
                        <ImageIcon className="size-4" aria-hidden="true" />
                        {copy("mediaImage")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        data-inbox-video-picker="true"
                        disabled={sending || !canSend}
                        onClick={() => videoInputRef.current?.click()}
                      >
                        <Video className="size-4" aria-hidden="true" />
                        {copy("mediaVideo")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        data-inbox-document-picker="true"
                        disabled={sending || !canSend}
                        onClick={() => documentInputRef.current?.click()}
                      >
                        <FileText className="size-4" aria-hidden="true" />
                        {copy("mediaDocument")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  {copy("attachMenu")}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={
                      sending || !canSend || voiceRecorder.state !== "idle"
                    }
                    aria-label={copy("voiceRecord")}
                    data-inbox-audio-picker="true"
                    onClick={() => {
                      void voiceRecorder.start();
                    }}
                  >
                    <Mic className="size-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  {copy("voiceRecord")}
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
                    dispatchReply();
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
                onClick={dispatchReply}
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
              )}
            </div>
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
