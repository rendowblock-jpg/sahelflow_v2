"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import { ImagePlus, Loader2, X } from "lucide-react";

import type { AiCopyFn } from "@/components/ai/ai-workspace-types";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

/**
 * AI-21: a screenshot is read by the proven extraction pipeline and the result
 * is appended to the draft for review; the seller always sends it themselves.
 * These client bounds only gate the picker/paste/drop — the route
 * re-authenticates them from the sniffed bytes (pinned equal by the
 * attachment contract).
 */
export const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024;
export const SCREENSHOT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const SCREENSHOT_ACCEPT = "image/jpeg,image/png,image/webp";

interface ScreenshotExtractionResult {
  order: {
    customerName?: string;
    phone?: string;
    wilaya?: string;
    commune?: string;
    address?: string;
    items: Array<{ productName: string; quantity: number; unitPrice?: number }>;
    totalPrice?: number;
    notes?: string;
  } | null;
  method: string;
  confidence: number;
  isComplete: boolean;
  missingFields?: string[];
}

/**
 * The block is addressed to the chat model, so the field labels stay in the
 * model contract language (English) while every surrounding UI string is
 * localized — the seller reviews and edits the draft before sending.
 */
export function screenshotSummary(result: ScreenshotExtractionResult): string {
  const order = result.order!;
  const lines: string[] = [
    `Order request extracted from a screenshot (${Math.round(result.confidence * 100)}% confidence):`,
  ];
  if (order.customerName) lines.push(`customer: ${order.customerName}`);
  if (order.phone) lines.push(`phone: ${order.phone}`);
  if (order.wilaya) lines.push(`wilaya: ${order.wilaya}`);
  if (order.commune) lines.push(`commune: ${order.commune}`);
  if (order.address) lines.push(`address: ${order.address}`);
  for (const item of order.items) {
    lines.push(
      `item: ${item.quantity} × ${item.productName}${
        item.unitPrice != null ? ` @ ${item.unitPrice} DZD` : ""
      }`,
    );
  }
  if (order.totalPrice != null) lines.push(`total: ${order.totalPrice} DZD`);
  if (order.notes) lines.push(`notes: ${order.notes}`);
  if (result.missingFields?.length) {
    lines.push(`missing: ${result.missingFields.join(", ")}`);
  }
  return lines.join("\n");
}

export interface AiScreenshot {
  file: File;
  previewUrl: string;
}

/** One bounded screenshot in flight, read into the draft for review. */
export function useAiScreenshotAttachment({
  copy,
  setDraft,
  composerRef,
}: {
  copy: AiCopyFn;
  setDraft: Dispatch<SetStateAction<string>>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [screenshot, setScreenshot] = useState<AiScreenshot | null>(null);
  const [readingScreenshot, setReadingScreenshot] = useState(false);
  // The live preview URL is revoked through this ref — never inside a state
  // updater, which React may invoke twice (StrictMode) or skip entirely.
  const screenshotUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (screenshotUrlRef.current) URL.revokeObjectURL(screenshotUrlRef.current);
    },
    [],
  );

  const clearScreenshot = useCallback(() => {
    if (screenshotUrlRef.current) {
      URL.revokeObjectURL(screenshotUrlRef.current);
      screenshotUrlRef.current = null;
    }
    setScreenshot(null);
  }, []);

  const extractScreenshot = async (shot: AiScreenshot): Promise<void> => {
    setReadingScreenshot(true);
    try {
      const form = new FormData();
      form.set("image", shot.file, shot.file.name || "screenshot");
      form.set("fileName", shot.file.name || "screenshot");
      const response = await fetch("/api/extraction/image", {
        method: "POST",
        body: form,
      });
      // The consent and rate-limit codes reuse the exact copy the chat send
      // path shows for the same failure (one truth per failure cause).
      if (response.status === 403) {
        toast.error(copy("consentMissing"));
        return;
      }
      if (response.status === 429) {
        toast.error(copy("rateLimited"));
        return;
      }
      if (!response.ok) {
        toast.error(copy("screenshotExtractFailed"));
        return;
      }
      const payload = (await response.json()) as {
        result?: ScreenshotExtractionResult;
      };
      const result = payload.result;
      if (!result || !result.order) {
        toast.error(copy("screenshotExtractFailed"));
        return;
      }
      const summary = screenshotSummary(result);
      setDraft((current) =>
        current.trim() ? `${current}\n\n${summary}` : summary,
      );
      clearScreenshot();
      composerRef.current?.focus();
    } catch {
      toast.error(copy("screenshotExtractFailed"));
    } finally {
      setReadingScreenshot(false);
    }
  };

  const ingestScreenshot = (file: File): void => {
    const mediaType = file.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    if (!SCREENSHOT_TYPES.has(mediaType)) {
      toast.error(copy("screenshotUnsupported"));
      return;
    }
    if (file.size <= 0 || file.size > SCREENSHOT_MAX_BYTES) {
      toast.error(
        copy("screenshotTooLarge", {
          limit: Math.round(SCREENSHOT_MAX_BYTES / (1024 * 1024)),
        }),
      );
      return;
    }
    if (screenshotUrlRef.current) {
      URL.revokeObjectURL(screenshotUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    screenshotUrlRef.current = previewUrl;
    const shot = { file, previewUrl };
    setScreenshot(shot);
    void extractScreenshot(shot);
  };

  return { screenshot, readingScreenshot, ingestScreenshot, clearScreenshot };
}

/** The one screenshot in flight, above the composer, with its reading state. */
export function AiScreenshotChip({
  screenshot,
  reading,
  copy,
  onRemove,
}: {
  screenshot: AiScreenshot;
  reading: boolean;
  copy: AiCopyFn;
  onRemove: () => void;
}) {
  return (
    <div
      data-ai-screenshot-chip="true"
      className="mb-2 flex items-center gap-3 rounded-surface border border-border bg-card px-3 py-2"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, never persisted */}
      <img
        src={screenshot.previewUrl}
        alt={screenshot.file.name || copy("attachScreenshot")}
        className="size-10 shrink-0 rounded-control border border-border object-cover"
      />
      {reading ? (
        <Loader2
          className="size-3.5 shrink-0 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      ) : null}
      <p className="min-w-0 flex-1 truncate text-body-sm text-muted-foreground">
        {reading
          ? copy("readingScreenshot")
          : screenshot.file.name || copy("attachScreenshot")}
      </p>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={copy("screenshotRemove")}
        data-ai-screenshot-remove="true"
        disabled={reading}
        onClick={onRemove}
      >
        <X className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Shown over the composer while a file is dragged onto it. */
export function AiDropOverlay({ label }: { label: string }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-surface bg-primary-subtle/90 text-body-sm font-medium text-primary"
    >
      <ImagePlus className="me-2 size-4" />
      {label}
    </div>
  );
}
