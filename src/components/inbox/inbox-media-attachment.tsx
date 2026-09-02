"use client";

import { useEffect, useState } from "react";
import {
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Loader2,
  Mic,
  Music,
  Presentation,
  Video,
  type LucideIcon,
} from "lucide-react";

import type { InboxMessage } from "@/components/inbox/inbox-workspace-types";
import { VoiceNotePlayer } from "@/components/inbox/voice-note-player";
import { useI18n } from "@/hooks/use-i18n";
import { getInboxMediaCopy } from "@/lib/i18n/inbox-media";
import { getInboxWorkspaceCopy } from "@/lib/i18n/inbox-workspace";
import type { InboxLocalMediaProjection } from "@/lib/whatsapp/types";
import { cn } from "@/lib/utils";

const PENDING_MEDIA_POLL_MS = 3_000;
const MAX_PENDING_MEDIA_BATCH = 200;
const PENDING_MEDIA_BATCH_URL = "/api/inbox/media/status";

type PendingMediaListener = (projection: InboxLocalMediaProjection) => void;

const pendingMediaListeners = new Map<string, Set<PendingMediaListener>>();
let pendingMediaPollTimer: number | null = null;
let pendingMediaInitialTimer: number | null = null;
let pendingMediaPollInFlight = false;

function localeCode(locale: "ar" | "fr" | "en"): string {
  return locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB";
}

function mediaLabel(
  kind: string | undefined,
  locale: "ar" | "fr" | "en",
): string {
  switch (kind) {
    case "image":
      return getInboxWorkspaceCopy(locale, "mediaImage");
    case "video":
      return getInboxWorkspaceCopy(locale, "mediaVideo");
    case "audio":
      return getInboxWorkspaceCopy(locale, "mediaAudio");
    case "document":
      return getInboxWorkspaceCopy(locale, "mediaDocument");
    case "sticker":
      return getInboxWorkspaceCopy(locale, "mediaSticker");
    default:
      return getInboxWorkspaceCopy(locale, "mediaUnknown");
  }
}

function MediaIcon({ kind }: { kind: string | undefined }) {
  switch (kind) {
    case "image":
    case "sticker":
      return <ImageIcon className="size-4" aria-hidden="true" />;
    case "video":
      return <Video className="size-4" aria-hidden="true" />;
    case "audio":
      return <Mic className="size-4" aria-hidden="true" />;
    case "document":
      return <FileText className="size-4" aria-hidden="true" />;
    default:
      return <FileText className="size-4" aria-hidden="true" />;
  }
}

type DocumentKind = { label: string; Icon: LucideIcon };

const DOCUMENT_KIND_FALLBACK: DocumentKind = { label: "file", Icon: FileText };

// Attachment families render as stable Latin brand labels (Word, PDF, Excel,
// ZIP, …) instead of raw MIME strings. File-format names are universal in the
// Algerian market and keep the metadata line direction-safe (dir="ltr").
const DOCUMENT_KIND_BY_EXTENSION: Readonly<Record<string, DocumentKind>> = {
  doc: { label: "Word", Icon: FileText },
  docx: { label: "Word", Icon: FileText },
  rtf: { label: "Word", Icon: FileText },
  odt: { label: "Word", Icon: FileText },
  pdf: { label: "PDF", Icon: FileText },
  xls: { label: "Excel", Icon: FileSpreadsheet },
  xlsx: { label: "Excel", Icon: FileSpreadsheet },
  ods: { label: "Excel", Icon: FileSpreadsheet },
  csv: { label: "CSV", Icon: FileSpreadsheet },
  tsv: { label: "CSV", Icon: FileSpreadsheet },
  ppt: { label: "PowerPoint", Icon: Presentation },
  pptx: { label: "PowerPoint", Icon: Presentation },
  odp: { label: "PowerPoint", Icon: Presentation },
  zip: { label: "ZIP", Icon: FileArchive },
  rar: { label: "RAR", Icon: FileArchive },
  "7z": { label: "7Z", Icon: FileArchive },
  gz: { label: "Archive", Icon: FileArchive },
  tar: { label: "Archive", Icon: FileArchive },
  txt: { label: "TXT", Icon: FileText },
  md: { label: "TXT", Icon: FileText },
  jpg: { label: "image", Icon: ImageIcon },
  jpeg: { label: "image", Icon: ImageIcon },
  png: { label: "image", Icon: ImageIcon },
  gif: { label: "image", Icon: ImageIcon },
  webp: { label: "image", Icon: ImageIcon },
  avif: { label: "image", Icon: ImageIcon },
  heic: { label: "image", Icon: ImageIcon },
  mp4: { label: "video", Icon: Video },
  mov: { label: "video", Icon: Video },
  mkv: { label: "video", Icon: Video },
  avi: { label: "video", Icon: Video },
  webm: { label: "video", Icon: Video },
  "3gp": { label: "video", Icon: Video },
  mp3: { label: "audio", Icon: Music },
  ogg: { label: "audio", Icon: Music },
  oga: { label: "audio", Icon: Music },
  opus: { label: "audio", Icon: Music },
  wav: { label: "audio", Icon: Music },
  m4a: { label: "audio", Icon: Music },
  aac: { label: "audio", Icon: Music },
  amr: { label: "audio", Icon: Music },
  apk: { label: "APK", Icon: FileArchive },
  epub: { label: "EPUB", Icon: FileText },
};

const DOCUMENT_KIND_BY_MIME: ReadonlyArray<{
  pattern: RegExp;
  kind: DocumentKind;
}> = [
  { pattern: /wordprocessingml|msword/, kind: { label: "Word", Icon: FileText } },
  {
    pattern: /spreadsheetml|ms-excel/,
    kind: { label: "Excel", Icon: FileSpreadsheet },
  },
  {
    pattern: /presentationml|ms-powerpoint/,
    kind: { label: "PowerPoint", Icon: Presentation },
  },
  { pattern: /pdf/, kind: { label: "PDF", Icon: FileText } },
  {
    pattern: /zip|x-7z|x-rar|x-tar|gzip|bzip2/,
    kind: { label: "Archive", Icon: FileArchive },
  },
  { pattern: /text\/csv/, kind: { label: "CSV", Icon: FileSpreadsheet } },
  { pattern: /^text\//, kind: { label: "TXT", Icon: FileText } },
  { pattern: /^image\//, kind: { label: "image", Icon: ImageIcon } },
  { pattern: /^video\//, kind: { label: "video", Icon: Video } },
  { pattern: /^audio\//, kind: { label: "audio", Icon: Music } },
  {
    pattern: /android\.package-archive/,
    kind: { label: "APK", Icon: FileArchive },
  },
  { pattern: /epub\+zip/, kind: { label: "EPUB", Icon: FileText } },
];

export function documentKind(
  fileName: string | null | undefined,
  mimeType: string | null | undefined,
): DocumentKind {
  const extension = fileName?.includes(".")
    ? (fileName.split(".").at(-1)?.toLowerCase() ?? null)
    : null;
  if (extension && DOCUMENT_KIND_BY_EXTENSION[extension]) {
    return DOCUMENT_KIND_BY_EXTENSION[extension];
  }
  if (mimeType) {
    const match = DOCUMENT_KIND_BY_MIME.find((rule) =>
      rule.pattern.test(mimeType),
    );
    if (match) return match.kind;
  }
  return DOCUMENT_KIND_FALLBACK;
}

function formatBytes(value: number, locale: "ar" | "fr" | "en"): string {
  if (value < 1_024) return `${value} B`;
  const formatter = new Intl.NumberFormat(localeCode(locale), {
    maximumFractionDigits: 1,
  });
  if (value < 1_024 * 1_024) return `${formatter.format(value / 1_024)} KB`;
  return `${formatter.format(value / (1_024 * 1_024))} MB`;
}

function safeDownloadName(value: string | null, fallback: string): string {
  const leaf = value
    ?.replaceAll("\\", "/")
    .split("/")
    .at(-1)
    ?.replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
  return leaf ? leaf.slice(0, 180) : fallback;
}

function downloadNameFromResponse(response: Response, fallback: string): string {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (encoded) {
    try {
      return safeDownloadName(decodeURIComponent(encoded), fallback);
    } catch {
      // Fall through to the ASCII filename or the local safe fallback.
    }
  }
  const ascii = /filename="([^"]+)"/i.exec(disposition)?.[1] ?? null;
  return safeDownloadName(ascii, fallback);
}

function DownloadButton({
  href,
  label,
  fallbackName,
  locale,
  onFailure,
  compact = false,
}: {
  href: string;
  label: string;
  fallbackName: string;
  locale: "ar" | "fr" | "en";
  onFailure: () => void;
  compact?: boolean;
}) {
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) throw new Error(`Media download failed: ${response.status}`);
      const blob = await response.blob();
      if (blob.size <= 0) throw new Error("Media download returned no bytes");

      const objectUrl = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = downloadNameFromResponse(response, fallbackName);
        anchor.rel = "noopener";
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      }
    } catch {
      onFailure();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={downloading}
      aria-busy={downloading}
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 text-xs font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-65",
        compact && "min-h-8 px-2.5",
      )}
    >
      {downloading ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="size-3.5" aria-hidden="true" />
      )}
      {downloading ? getInboxMediaCopy(locale, "downloading") : label}
    </button>
  );
}

function validPolledProjection(
  value: unknown,
): InboxLocalMediaProjection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.state !== "pending" &&
    candidate.state !== "ready" &&
    candidate.state !== "failed"
  ) {
    return null;
  }
  if (candidate.statusUrl !== undefined && typeof candidate.statusUrl !== "string") {
    return null;
  }
  if (candidate.readUrl !== undefined && typeof candidate.readUrl !== "string") {
    return null;
  }
  if (
    candidate.downloadUrl !== undefined &&
    typeof candidate.downloadUrl !== "string"
  ) {
    return null;
  }
  if (
    candidate.state === "ready" &&
    (typeof candidate.readUrl !== "string" ||
      typeof candidate.downloadUrl !== "string")
  ) {
    return null;
  }
  return {
    state: candidate.state,
    ...(typeof candidate.statusUrl === "string"
      ? { statusUrl: candidate.statusUrl }
      : {}),
    ...(typeof candidate.readUrl === "string"
      ? { readUrl: candidate.readUrl }
      : {}),
    ...(typeof candidate.downloadUrl === "string"
      ? { downloadUrl: candidate.downloadUrl }
      : {}),
  };
}

function messageIdFromStatusUrl(statusUrl: string | undefined): string | null {
  if (!statusUrl) return null;
  const match = /^\/api\/inbox\/media\/([^/?#]+)\/status$/.exec(statusUrl);
  if (!match?.[1]) return null;
  try {
    const messageId = decodeURIComponent(match[1]).trim();
    return messageId &&
      messageId.length <= 256 &&
      !/[\u0000-\u001f\u007f]/.test(messageId)
      ? messageId
      : null;
  } catch {
    return null;
  }
}

function notifyPendingMedia(
  messageId: string,
  projection: InboxLocalMediaProjection,
): void {
  for (const listener of pendingMediaListeners.get(messageId) ?? []) {
    listener(projection);
  }
}

function stopSharedPendingMediaPollIfIdle(): void {
  if (pendingMediaListeners.size !== 0) return;
  if (pendingMediaInitialTimer !== null) {
    window.clearTimeout(pendingMediaInitialTimer);
    pendingMediaInitialTimer = null;
  }
  if (pendingMediaPollTimer !== null) {
    window.clearInterval(pendingMediaPollTimer);
    pendingMediaPollTimer = null;
  }
}

async function pollPendingMediaBatch(): Promise<void> {
  if (
    pendingMediaPollInFlight ||
    pendingMediaListeners.size === 0 ||
    document.visibilityState !== "visible"
  ) {
    return;
  }
  const messageIds = Array.from(pendingMediaListeners.keys()).slice(
    0,
    MAX_PENDING_MEDIA_BATCH,
  );
  if (messageIds.length === 0) return;

  pendingMediaPollInFlight = true;
  try {
    const response = await fetch(PENDING_MEDIA_BATCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageIds }),
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) {
      for (const messageId of messageIds) {
        notifyPendingMedia(messageId, { state: "failed" });
      }
      return;
    }
    if (!response.ok) return;

    const data = (await response.json()) as {
      media?: unknown;
      missing?: unknown;
    };
    const media =
      data.media && typeof data.media === "object" && !Array.isArray(data.media)
        ? (data.media as Record<string, unknown>)
        : {};
    const missing = new Set(
      Array.isArray(data.missing)
        ? data.missing.filter((value): value is string => typeof value === "string")
        : [],
    );

    for (const messageId of messageIds) {
      if (missing.has(messageId)) {
        notifyPendingMedia(messageId, { state: "failed" });
        continue;
      }
      const next = validPolledProjection(media[messageId]);
      if (next) notifyPendingMedia(messageId, next);
    }
  } catch {
    // Durable intent truth remains authoritative. Retry on the shared interval.
  } finally {
    pendingMediaPollInFlight = false;
  }
}

function ensureSharedPendingMediaPoll(): void {
  if (pendingMediaPollTimer !== null) return;
  pendingMediaInitialTimer = window.setTimeout(() => {
    pendingMediaInitialTimer = null;
    void pollPendingMediaBatch();
  }, 0);
  pendingMediaPollTimer = window.setInterval(() => {
    void pollPendingMediaBatch();
  }, PENDING_MEDIA_POLL_MS);
}

function subscribePendingMedia(
  messageId: string,
  listener: PendingMediaListener,
): () => void {
  const listeners = pendingMediaListeners.get(messageId) ?? new Set();
  listeners.add(listener);
  pendingMediaListeners.set(messageId, listeners);
  ensureSharedPendingMediaPoll();

  return () => {
    const current = pendingMediaListeners.get(messageId);
    current?.delete(listener);
    if (current?.size === 0) pendingMediaListeners.delete(messageId);
    stopSharedPendingMediaPollIfIdle();
  };
}

export function InboxMediaAttachment({ message }: { message: InboxMessage }) {
  const { locale } = useI18n();
  const projectedLocal = message.attachment?.localMedia;
  const pendingMessageId =
    projectedLocal?.state === "pending"
      ? messageIdFromStatusUrl(projectedLocal.statusUrl)
      : null;
  const [polledLocal, setPolledLocal] = useState<{
    messageId: string;
    projection: InboxLocalMediaProjection;
  } | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);

  useEffect(() => {
    if (!pendingMessageId) return;
    return subscribePendingMedia(pendingMessageId, (projection) => {
      setPolledLocal({ messageId: pendingMessageId, projection });
    });
  }, [pendingMessageId]);

  const local =
    projectedLocal?.state === "pending" &&
    pendingMessageId &&
    polledLocal?.messageId === pendingMessageId
      ? polledLocal.projection
      : projectedLocal;
  const attachment = message.attachment;
  if (!attachment) return null;

  const label = mediaLabel(message.messageType, locale);
  const kind = documentKind(attachment.fileName, attachment.mimeType);
  const metadata = [
    kind.label,
    attachment.sizeBytes !== null
      ? formatBytes(attachment.sizeBytes, locale)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (attachment.state === "rejected") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MediaIcon kind={message.messageType} />
          <span>{label}</span>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {getInboxWorkspaceCopy(locale, "mediaRejected")}
        </p>
      </div>
    );
  }

  if (!local || local.state === "pending") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span>{label}</span>
        </div>
        {metadata ? (
          <p className="text-xs text-muted-foreground" dir="ltr">
            {metadata}
          </p>
        ) : null}
        <p className="text-xs leading-5 text-muted-foreground">
          {getInboxMediaCopy(locale, "loading")}
        </p>
      </div>
    );
  }

  if (local.state === "failed" || downloadFailed) {
    return (
      <div className="space-y-1.5" role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MediaIcon kind={message.messageType} />
          <span>{label}</span>
        </div>
        {metadata ? (
          <p className="text-xs text-muted-foreground" dir="ltr">
            {metadata}
          </p>
        ) : null}
        <p className="text-xs leading-5 text-muted-foreground">
          {downloadFailed
            ? getInboxMediaCopy(locale, "downloadFailed")
            : getInboxMediaCopy(locale, "failed")}
        </p>
      </div>
    );
  }

  const readUrl = local.readUrl;
  const downloadUrl = local.downloadUrl;
  if (!readUrl || !downloadUrl) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MediaIcon kind={message.messageType} />
          <span>{label}</span>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {getInboxMediaCopy(locale, "previewUnavailable")}
        </p>
      </div>
    );
  }

  // Derived bounded thumbnail (#317): used for inline image previews and as
  // the video poster frame; any failure falls back to the full canonical read.
  const thumbnailUrl =
    !thumbnailFailed && local.thumbnailUrl ? local.thumbnailUrl : null;
  const inlineImageSrc = thumbnailUrl ?? readUrl;

  const showInlinePreview = !previewFailed;
  const KindIcon = kind.Icon;

  return (
    <div className="space-y-2.5">
      {message.messageType === "document" ? (
        // WhatsApp-style document card: one identity row (type tile + name +
        // friendly format/size) instead of a stacked header + raw MIME lines.
        // Direction-neutral by contract: media never branches on message
        // direction — only the surrounding bubble is styled per direction.
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground"
          >
            <KindIcon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block break-words text-sm font-medium leading-5"
              dir="auto"
            >
              {attachment.fileName ?? label}
            </span>
            <span
              className="mt-0.5 block text-xs text-muted-foreground"
              dir="ltr"
            >
              {metadata}
            </span>
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm font-medium">
            <MediaIcon kind={message.messageType} />
            <span>{label}</span>
          </div>

          {showInlinePreview &&
          (message.messageType === "image" ||
            message.messageType === "sticker") ? (
            <div
              className={cn(
                "overflow-hidden rounded-xl border border-border/60 bg-muted/20",
                message.messageType === "sticker" && "w-fit",
              )}
            >
              {/* The authenticated endpoint is dynamic and intentionally bypasses Next image optimization. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={inlineImageSrc}
                alt={label}
                loading="lazy"
                decoding="async"
                onError={() => {
                  if (inlineImageSrc === thumbnailUrl) {
                    setThumbnailFailed(true);
                  } else {
                    setPreviewFailed(true);
                  }
                }}
                width={attachment.width ?? (message.messageType === "sticker" ? 192 : 640)}
                height={attachment.height ?? (message.messageType === "sticker" ? 192 : 480)}
                className={cn(
                  "block h-auto max-h-[28rem] w-auto max-w-full object-contain",
                  message.messageType === "sticker" && "max-h-48 max-w-48",
                )}
              />
            </div>
          ) : null}

          {showInlinePreview && message.messageType === "video" ? (
            <video
              src={readUrl}
              poster={thumbnailUrl ?? undefined}
              controls
              playsInline
              preload="metadata"
              onError={() => setPreviewFailed(true)}
              aria-label={label}
              className="max-h-[28rem] w-full max-w-[34rem] rounded-xl border border-border/60 bg-black"
            />
          ) : null}

          {showInlinePreview && message.messageType === "audio" ? (
            <VoiceNotePlayer src={readUrl} label={label} locale={locale} />
          ) : null}

          {previewFailed ? (
            <p className="text-xs leading-5 text-muted-foreground" role="status">
              {getInboxMediaCopy(locale, "previewUnavailable")}
            </p>
          ) : null}

          {attachment.fileName ? (
            <p className="break-all text-xs font-medium" dir="auto">
              {attachment.fileName}
            </p>
          ) : null}
          {metadata ? (
            <p className="text-xs text-muted-foreground" dir="ltr">
              {metadata}
            </p>
          ) : null}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <DownloadButton
          href={downloadUrl}
          fallbackName={attachment.fileName ?? `whatsapp-${message.messageType ?? "media"}`}
          locale={locale}
          onFailure={() => setDownloadFailed(true)}
          label={
            message.messageType === "document"
              ? getInboxMediaCopy(locale, "openDocument")
              : getInboxMediaCopy(locale, "download")
          }
          compact
        />
        <span className="text-2xs leading-4 text-muted-foreground">
          {getInboxMediaCopy(locale, "ready")}
        </span>
      </div>
    </div>
  );
}
