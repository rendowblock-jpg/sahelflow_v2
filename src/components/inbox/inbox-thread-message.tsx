"use client";

import {
  Fragment,
  memo,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Check,
  Copy,
  FileText,
  ImageIcon,
  MapPin,
  Mic,
  Paperclip,
  RefreshCw,
  Reply,
  Sparkles,
  UserRound,
  Video,
  X,
} from "lucide-react";

import { InboxMediaAttachment, documentKind } from "@/components/inbox/inbox-media-attachment";
import type { InboxMessage } from "@/components/inbox/inbox-workspace-types";
import { InboxLinkPreview, firstHttpUrlInText } from "@/components/inbox/link-preview-card";
import { ActivityMessage } from "@/components/inbox/conversation-controls";
import { MessageStatus } from "@/components/inbox/message-status";
import { Button } from "@/components/ui/button";
import { useInboxWorkspace } from "@/hooks/use-inbox-workspace";
import { cn, DZ_CLOCK, intlLocale } from "@/lib/utils";

function messageTime(value: number, locale: "ar" | "fr" | "en"): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    ...DZ_CLOCK,
  }).format(new Date(value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Soft highlight of in-thread search matches inside a bubble body. */
function HighlightedMessageBody({
  body,
  query,
}: {
  body: string;
  query: string;
}) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return <>{body}</>;
  const parts = body.split(
    new RegExp(`(${escapeRegExp(trimmed)})`, "ig"),
  );
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark
            key={index}
            className="rounded-control bg-warning/30 px-0.5 text-foreground"
          >
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
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
  const formatter = new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: 1,
  });
  if (value < 1_024 * 1_024) return `${formatter.format(value / 1_024)} KB`;
  return `${formatter.format(value / (1_024 * 1_024))} MB`;
}

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
        "ms-2 inline-flex min-h-7 items-center gap-1.5 rounded-control px-2 text-caption font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring",
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

export const MessageBubble = memo(function MessageBubble({
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
  groupStart = true,
  groupEnd = true,
  highlighted = false,
  quotedJumpable = false,
  onJumpToQuoted,
  searchQuery = "",
}: {
  message: InboxMessage;
  locale: "ar" | "fr" | "en";
  t: ReturnType<typeof useInboxWorkspace>["t"];
  copy: ReturnType<typeof useInboxWorkspace>["copy"];
  candidate: boolean;
  onChooseCandidate: (messageId: string) => void;
  onRetry: (message: InboxMessage) => void;
  onReply: (message: InboxMessage) => void;
  canInteract: boolean;
  upload?: { progress: number; cancellable: boolean };
  onCancelUpload: (messageId: string) => void;
  /** First bubble of a visual sender-group (drives margins + tail corners). */
  groupStart?: boolean;
  /** Last bubble of a visual sender-group (carries the tail corner). */
  groupEnd?: boolean;
  /** Momentary jump/search target highlight. */
  highlighted?: boolean;
  quotedJumpable?: boolean;
  onJumpToQuoted?: (quotedMessageId: string) => void;
  searchQuery?: string;
}) {
  if (message.messageType === "activity" || message.direction === "system") {
    return <ActivityMessage body={message.body} timestamp={message.timestamp} />;
  }

  const inbound = message.direction === "inbound";
  const media = isMediaMessage(message);
  // Ledger INB-16: at most one preview per bubble, text bubbles only.
  const linkUrl = media ? null : firstHttpUrlInText(message.body);
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
  const renderQuoteBody = () => (
    <>
      <div className="flex items-center gap-1 text-caption font-medium text-primary">
        <Reply className="size-3" aria-hidden="true" />
        <span>{copy("replyingTo")}</span>
      </div>
      <p
        className="mt-0.5 line-clamp-2 break-words text-caption leading-4 text-muted-foreground"
        dir="auto"
      >
        {message.quoted?.preview || "…"}
      </p>
    </>
  );

  return (
    <div
      data-message-id={message.id}
      className={cn(
        // `relative` anchors the floated hover-action clusters below; without a
        // positioned ancestor they would resolve against the scroll container.
        "group/message relative space-y-1.5",
        groupStart ? "mt-4" : "mt-1",
        highlighted &&
          "rounded-surface ring-2 ring-primary/60 ring-offset-2 ring-offset-background transition-shadow",
      )}
      dir="ltr"
    >
      <div className={cn("flex", inbound ? "justify-start" : "justify-end")}>
        <div
          className={cn(
            "max-w-[min(38rem,80%)] rounded-[1.15rem] border px-3.5 py-2.5 shadow-[0_1px_1px_rgba(0,0,0,0.04)]",
            inbound
              ? "border-border/70 bg-background text-foreground"
              : "border-primary/20 bg-primary-soft text-foreground",
            // Tail corner sits on the group's last bubble; continuation
            // bubbles soften their connecting corners (WhatsApp grouping).
            inbound && groupEnd && "rounded-es-control",
            !inbound && groupEnd && "rounded-ee-control",
            inbound && !groupStart && "rounded-ss-control",
            !inbound && !groupStart && "rounded-se-control",
          )}
        >
          {message.quoted || message.quotedMessageId ? (
            quotedJumpable && onJumpToQuoted ? (
              <button
                type="button"
                onClick={() => {
                  const quotedId = message.quotedMessageId;
                  if (quotedId) onJumpToQuoted(quotedId);
                }}
                aria-label={copy("jumpToMessage")}
                title={copy("jumpToMessage")}
                className="mb-2 block w-full rounded-surface border-s-2 border-primary/40 bg-background/60 px-2.5 py-1.5 text-start outline-none transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
              >
                {renderQuoteBody()}
              </button>
            ) : (
              <div
                title={copy("quoteNotLoaded")}
                className="mb-2 rounded-surface border-s-2 border-primary/40 bg-background/60 px-2.5 py-1.5"
              >
                {renderQuoteBody()}
              </div>
            )
          ) : null}

          {media ? (
            <div
              className={cn(
                "mb-2 rounded-surface border p-3",
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
              <HighlightedMessageBody body={message.body} query={searchQuery} />
            </p>
          ) : null}

          {/* Ledger INB-16: WhatsApp-style link preview card for text bubbles.
              Renders nothing until real metadata arrives — honest absence. */}
          {!media && linkUrl ? (
            <InboxLinkPreview
              url={linkUrl}
              label={copy("linkPreviewLabel")}
            />
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
                <span className="text-caption tabular-nums text-muted-foreground">
                  {copy("uploadProgress", { percent: upload.progress })}
                </span>
                {upload.cancellable ? (
                  <button
                    type="button"
                    onClick={() => onCancelUpload(message.id)}
                    className="inline-flex min-h-7 items-center gap-1 rounded-control px-2 text-caption font-medium text-destructive outline-none transition-colors hover:bg-destructive-soft focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-3" aria-hidden="true" />
                    {copy("cancelUpload")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-1 flex items-center justify-end gap-1 text-caption tabular-nums text-muted-foreground">
            <span>{messageTime(message.timestamp, locale)}</span>
            {!inbound ? (
              <MessageStatus status={message.deliveryStatus ?? "sent"} />
            ) : null}
          </div>
        </div>
      </div>

      {message.body.trim() || message.attachment?.fileName ? (
        // The controls were `opacity-0` but still in flow, so this row reserved
        // its full height under EVERY bubble — permanent dead space that reads
        // as loose, un-WhatsApp-like density.
        // Floated, not collapsed. An earlier revision used
        // `grid-rows-[0fr]` to reclaim the dead space, but that zeroes the box
        // of controls that stay in the tab order — a focusable element with no
        // dimensions. Absolute positioning removes the row from flow while the
        // controls keep their real size whenever they are revealed.
        <div
          className={cn(
            "pointer-events-none absolute -bottom-1 z-10 flex gap-1 opacity-0 transition-opacity duration-150 group-hover/message:pointer-events-auto group-hover/message:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 motion-reduce:transition-none",
            inbound ? "start-0" : "end-0",
          )}
        >
          {canInteract ? (
            <button
              type="button"
              onClick={() => onReply(message)}
              aria-label={copy("replyToMessage")}
              className="inline-flex min-h-7 items-center gap-1.5 rounded-control px-2 text-caption font-medium text-muted-foreground opacity-0 outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/message:opacity-100"
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
        // The selected candidate keeps its chip visible (it is a persistent
        // state, not a hover affordance), so the row stays expanded whenever
        // `candidate` is true and only collapses in the unselected case.
        <div
          className={cn(
            "flex",
            candidate
              ? "pt-1"
              : "pointer-events-none absolute -bottom-1 z-10 opacity-0 transition-opacity duration-150 group-hover/message:pointer-events-auto group-hover/message:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 motion-reduce:transition-none",
            candidate ? (inbound ? "justify-start" : "justify-end") : inbound ? "start-24" : "end-24",
          )}
        >
          <button
            type="button"
            onClick={() => onChooseCandidate(message.id)}
            aria-pressed={candidate}
            className={cn(
              "ms-2 inline-flex min-h-7 items-center gap-1.5 rounded-control px-2 text-caption font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring",
              candidate
                ? "bg-primary-soft text-primary"
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
            <span className="font-mono text-caption text-muted-foreground">
              {message.outboxErrorCode}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
