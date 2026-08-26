"use client";

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

function DownloadLink({
  href,
  label,
  compact = false,
}: {
  href: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 text-xs font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        compact && "min-h-8 px-2.5",
      )}
    >
      <Download className="size-3.5" aria-hidden="true" />
      {label}
    </a>
  );
}

export function InboxMediaAttachment({ message }: { message: InboxMessage }) {
  const { locale } = useI18n();
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

  if (local.state === "failed") {
    return (
      <div className="space-y-1.5">
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
          {getInboxMediaCopy(locale, "failed")}
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
          aria-label={label}
          className="max-h-[28rem] w-full max-w-[34rem] rounded-xl border border-border/60 bg-black"
        />
      ) : null}

      {message.messageType === "audio" ? (
        <audio
          src={readUrl}
          controls
          preload="metadata"
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
        <DownloadLink
          href={downloadUrl}
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
