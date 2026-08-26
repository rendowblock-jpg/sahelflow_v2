"use client";

import { useState } from "react";
import { Download, FileText, ImageIcon, Loader2, Mic, Video } from "lucide-react";

import type { InboxMessage } from "@/components/inbox/inbox-workspace-types";
import { useI18n } from "@/hooks/use-i18n";
import { getInboxMediaCopy } from "@/lib/i18n/inbox-media";
import { getInboxWorkspaceCopy } from "@/lib/i18n/inbox-workspace";
import { cn } from "@/lib/utils";

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

export function InboxMediaAttachment({ message }: { message: InboxMessage }) {
  const { locale } = useI18n();
  const [runtimeFailed, setRuntimeFailed] = useState(false);
  const attachment = message.attachment;
  if (!attachment) return null;

  const local = attachment.localMedia;
  const label = mediaLabel(message.messageType, locale);
  const metadata = [
    attachment.mimeType,
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

  if (local.state === "failed" || runtimeFailed) {
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
          {runtimeFailed
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

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MediaIcon kind={message.messageType} />
        <span>{label}</span>
      </div>

      {message.messageType === "image" || message.messageType === "sticker" ? (
        <div
          className={cn(
            "overflow-hidden rounded-xl border border-border/60 bg-muted/20",
            message.messageType === "sticker" && "w-fit",
          )}
        >
          {/* The authenticated endpoint is dynamic and intentionally bypasses Next image optimization. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={readUrl}
            alt={label}
            loading="lazy"
            decoding="async"
            onError={() => setRuntimeFailed(true)}
            width={attachment.width ?? (message.messageType === "sticker" ? 192 : 640)}
            height={attachment.height ?? (message.messageType === "sticker" ? 192 : 480)}
            className={cn(
              "block h-auto max-h-[28rem] w-auto max-w-full object-contain",
              message.messageType === "sticker" && "max-h-48 max-w-48",
            )}
          />
        </div>
      ) : null}

      {message.messageType === "video" ? (
        <video
          src={readUrl}
          controls
          playsInline
          preload="metadata"
          onError={() => setRuntimeFailed(true)}
          aria-label={label}
          className="max-h-[28rem] w-full max-w-[34rem] rounded-xl border border-border/60 bg-black"
        />
      ) : null}

      {message.messageType === "audio" ? (
        <audio
          src={readUrl}
          controls
          preload="metadata"
          onError={() => setRuntimeFailed(true)}
          aria-label={label}
          className="h-10 w-full min-w-[15rem] max-w-[30rem]"
        />
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

      <div className="flex flex-wrap items-center gap-2">
        <DownloadButton
          href={downloadUrl}
          fallbackName={attachment.fileName ?? `whatsapp-${message.messageType ?? "media"}`}
          locale={locale}
          onFailure={() => setRuntimeFailed(true)}
          label={
            message.messageType === "document"
              ? getInboxMediaCopy(locale, "openDocument")
              : getInboxMediaCopy(locale, "download")
          }
          compact={message.messageType !== "document"}
        />
        <span className="text-[11px] leading-4 text-muted-foreground">
          {getInboxMediaCopy(locale, "ready")}
        </span>
      </div>
    </div>
  );
}
