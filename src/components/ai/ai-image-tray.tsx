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

import { ImagePlus, Loader2, ScanText, X } from "lucide-react";

import { AiImageError, prepareAiImage } from "@/components/ai/ai-image-input";
import type { AiCopyFn, AiOutgoingImage } from "@/components/ai/ai-workspace-types";
import {
  AI_CHAT_ATTACHMENT_MAX_COUNT,
  AI_CHAT_ATTACHMENT_SOURCE_MAX_BYTES,
} from "@/lib/ai/chat/attachment-limits";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Agents image input. Images picked, pasted or dropped on the composer are
 * prepared (downsized in the browser) and sent WITH the message, so the
 * agent sees them. Each image can also be read as an order (AI-21): the
 * proven extraction route turns it into a text summary appended to the draft
 * for review — nothing is sent from that path.
 */

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

export interface AiTrayItem {
  key: string;
  file: File;
  image: AiOutgoingImage | null;
}

let traySequence = 0;

export function useAiImageTray({
  copy,
  setDraft,
  composerRef,
}: {
  copy: AiCopyFn;
  setDraft: Dispatch<SetStateAction<string>>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [items, setItems] = useState<AiTrayItem[]>([]);
  const [extractingKey, setExtractingKey] = useState<string | null>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Previews are revoked when an item leaves for good (remove / unmount);
  // sent images keep theirs, the message bubble now shows them.
  useEffect(
    () => () => {
      for (const item of itemsRef.current) {
        if (item.image) URL.revokeObjectURL(item.image.previewUrl);
      }
    },
    [],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const images = files.filter((file) => file.type.startsWith("image/"));
      if (images.length === 0) {
        if (files.length > 0) toast.error(copy("imageUnsupported"));
        return;
      }
      const room = AI_CHAT_ATTACHMENT_MAX_COUNT - itemsRef.current.length;
      if (room <= 0 || images.length > room) {
        toast.error(copy("imageLimit", { count: AI_CHAT_ATTACHMENT_MAX_COUNT }));
      }
      for (const file of images.slice(0, Math.max(room, 0))) {
        const key = `tray-${(traySequence += 1)}`;
        setItems((current) => [...current, { key, file, image: null }]);
        void prepareAiImage(file).then(
          (image) =>
            setItems((current) => {
              if (!current.some((item) => item.key === key)) {
                URL.revokeObjectURL(image.previewUrl);
                return current;
              }
              return current.map((item) => (item.key === key ? { ...item, image } : item));
            }),
          (error: unknown) => {
            setItems((current) => current.filter((item) => item.key !== key));
            const reason = error instanceof AiImageError ? error.reason : "unreadable";
            toast.error(
              reason === "unsupported"
                ? copy("imageUnsupported")
                : reason === "too-large"
                  ? copy("imageTooLarge", {
                      limit: Math.round(AI_CHAT_ATTACHMENT_SOURCE_MAX_BYTES / (1024 * 1024)),
                    })
                  : copy("imageUnreadable"),
            );
          },
        );
      }
    },
    [copy],
  );

  const remove = useCallback((key: string) => {
    setItems((current) => {
      const target = current.find((item) => item.key === key);
      if (target?.image) URL.revokeObjectURL(target.image.previewUrl);
      return current.filter((item) => item.key !== key);
    });
  }, []);

  /** Hand the prepared images to a send; the tray empties (nothing revoked). */
  const take = useCallback((): AiOutgoingImage[] => {
    const ready = itemsRef.current.flatMap((item) => (item.image ? [item.image] : []));
    setItems([]);
    return ready;
  }, []);

  /** Put images back after a refused send. */
  const restore = useCallback((images: AiOutgoingImage[]) => {
    if (images.length === 0) return;
    setItems((current) => [
      ...images.map((image) => ({
        key: `tray-${(traySequence += 1)}`,
        file: new File([], "image", { type: image.mediaType }),
        image,
      })),
      ...current,
    ]);
  }, []);

  const extractOrder = useCallback(
    async (key: string) => {
      const item = itemsRef.current.find((entry) => entry.key === key);
      if (!item) return;
      setExtractingKey(key);
      try {
        const form = new FormData();
        form.set("image", item.file, item.file.name || "screenshot");
        form.set("fileName", item.file.name || "screenshot");
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
        const payload = (await response.json()) as { result?: ScreenshotExtractionResult };
        const result = payload.result;
        if (!result || !result.order) {
          toast.error(copy("screenshotExtractFailed"));
          return;
        }
        const summary = screenshotSummary(result);
        setDraft((current) => (current.trim() ? `${current}\n\n${summary}` : summary));
        composerRef.current?.focus();
      } catch {
        toast.error(copy("screenshotExtractFailed"));
      } finally {
        setExtractingKey(null);
      }
    },
    [composerRef, copy, setDraft],
  );

  const preparing = items.some((item) => item.image === null);
  const readyCount = items.filter((item) => item.image !== null).length;

  return {
    items,
    preparing,
    readyCount,
    full: items.length >= AI_CHAT_ATTACHMENT_MAX_COUNT,
    extractingKey,
    addFiles,
    remove,
    take,
    restore,
    extractOrder,
  };
}

/** The attached images, inside the composer above the text. */
export function AiImageTray({
  tray,
  copy,
  disabled,
}: {
  tray: ReturnType<typeof useAiImageTray>;
  copy: AiCopyFn;
  disabled: boolean;
}) {
  if (tray.items.length === 0) return null;
  return (
    <ul data-ai-image-tray="true" className="flex flex-wrap gap-2 px-3 pt-3">
      {tray.items.map((item, index) => {
        const extracting = tray.extractingKey === item.key;
        return (
          <li
            key={item.key}
            data-ai-image-chip="true"
            className="group/chip relative size-16 overflow-hidden rounded-control border border-border bg-muted"
          >
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img
                src={item.image.previewUrl}
                alt={copy("imageAlt", { index: index + 1 })}
                className="size-full object-cover"
              />
            ) : (
              <span className="flex size-full items-center justify-center" aria-label={copy("imagePreparing")}>
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
              </span>
            )}
            {extracting ? (
              <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
              </span>
            ) : null}
            <button
              type="button"
              aria-label={copy("imageRemove")}
              title={copy("imageRemove")}
              data-ai-image-remove="true"
              disabled={disabled || extracting}
              onClick={() => tray.remove(item.key)}
              className="absolute end-1 top-1 flex size-5 items-center justify-center rounded-full bg-foreground/75 text-background opacity-90 transition hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
            {/* Read-as-order needs the original file; images restored after a
                refused send carry only their prepared bytes. */}
            {item.image && item.file.size > 0 ? (
              <button
                type="button"
                aria-label={copy("extractOrderFromImage")}
                title={copy("extractOrderFromImage")}
                data-ai-image-extract="true"
                disabled={disabled || tray.extractingKey !== null}
                onClick={() => void tray.extractOrder(item.key)}
                className={cn(
                  "absolute bottom-1 start-1 flex size-5 items-center justify-center rounded-full bg-foreground/75 text-background transition",
                  "opacity-0 focus-visible:opacity-100 group-hover/chip:opacity-100 disabled:opacity-40",
                )}
              >
                <ScanText className="size-3" aria-hidden="true" />
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Shown over the composer while files are dragged onto it. */
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

