"use client";

import {
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  ChevronRight,
  Loader2,
  Paperclip,
  Send,
  Square,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { useI18n } from "@/hooks/use-i18n";
import {
  AI_CHAT_COUNTER_VISIBLE_SHARE,
  AI_CHAT_MESSAGE_MAX_LENGTH,
} from "@/lib/ai/chat-limits";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * STR-01 — the composer deck, extracted from `ai-decision-canvas.tsx`.
 *
 * Everything the seller types into lives here: the screenshot attachment
 * pipeline (AI-21), the edit-mode notice (AI-15), the textarea with its
 * send/stop control, the near-limit counter (AI-17 residual) and the
 * on-demand shortcut disclosure (UI-03).
 *
 * The draft itself is NOT owned here. Three canvas concerns write it — the
 * `/agents?q=` deep-link prefill, edit-mode prefill and the follow-up chips —
 * so the canvas keeps `draft`/`setDraft`/`composerRef` and passes them down.
 * Owning the draft locally would have forced a second source of truth for the
 * same text, which is the defect this extraction exists to avoid.
 */

/**
 * Ledger AI-21 — visual extraction bridge for the agents composer. Sellers
 * screenshot conversations when the order details live in an image; the
 * composer accepts the screenshot, the proven extraction pipeline reads it,
 * and the reviewed result is appended to the draft. The seller always sends
 * it themselves — extraction never auto-sends anything.
 *
 * These client values only gate the picker/paste; the route re-authenticates
 * the same boundaries from the sniffed bytes (declarations never become
 * authority), pinned equal by the composer-attachment contract test.
 */
const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024;
const SCREENSHOT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SCREENSHOT_ACCEPT = "image/jpeg,image/png,image/webp";

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
function screenshotSummary(result: ScreenshotExtractionResult): string {
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

export function AiComposerDeck({
  workspace,
  draft,
  setDraft,
  composerRef,
  setupReady,
  sending,
  startingAnalysis,
  editing,
  stop,
  onCancelEdit,
  onSubmit,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  setupReady: boolean;
  sending: boolean;
  startingAnalysis: boolean;
  /** Edit mode is owned by the workspace hook; the deck only renders it. */
  editing: boolean;
  stop: () => void;
  onCancelEdit: () => void;
  onSubmit: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const { copy } = workspace;
  // Ledger AI-21: one bounded screenshot in flight; the chip above the
  // composer shows the honest reading state until the extraction resolves.
  const [screenshot, setScreenshot] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [readingScreenshot, setReadingScreenshot] = useState(false);
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);
  // The live preview URL is revoked through this ref — never inside a state
  // updater, which React may invoke twice (StrictMode) or skip entirely.
  const screenshotUrlRef = useRef<string | null>(null);
  // Ledger AI-17 residual: the counter owns the last stretch before the
  // bound — an always-visible counter is noise for the common short prompt.
  const counterVisibleFrom = Math.ceil(
    AI_CHAT_MESSAGE_MAX_LENGTH * AI_CHAT_COUNTER_VISIBLE_SHARE,
  );

  const clearScreenshot = () => {
    if (screenshotUrlRef.current) {
      URL.revokeObjectURL(screenshotUrlRef.current);
      screenshotUrlRef.current = null;
    }
    setScreenshot(null);
  };

  const extractScreenshot = async (shot: {
    file: File;
    previewUrl: string;
  }): Promise<void> => {
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

  return (
    <div
      data-ai-composer-deck="true"
      className="border-t border-border/70 bg-card/50 px-4 py-3 backdrop-blur-sm md:px-6 md:py-4"
    >
      {editing ? (
        <div
          data-ai-editing="true"
          className="mx-auto mb-2 flex w-full max-w-4xl items-center justify-between gap-3 rounded-surface border border-warning/30 bg-warning-soft px-3.5 py-2.5"
        >
          <p className="min-w-0 truncate text-xs text-foreground">
            {copy("editingNotice")}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 text-xs"
            onClick={onCancelEdit}
          >
            {copy("cancelEdit")}
          </Button>
        </div>
      ) : null}
      <div className="mx-auto w-full max-w-4xl">
        {screenshot ? (
          <div
            data-ai-screenshot-chip="true"
            className="mb-2 flex items-center gap-3 rounded-surface border border-border/60 bg-muted/25 px-3 py-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, never persisted */}
            <img
              src={screenshot.previewUrl}
              alt={screenshot.file.name || copy("attachScreenshot")}
              className="size-10 shrink-0 rounded-surface border border-border/60 object-cover"
            />
            {readingScreenshot ? (
              <Loader2
                className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            ) : null}
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {readingScreenshot
                ? copy("readingScreenshot")
                : screenshot.file.name || copy("attachScreenshot")}
            </p>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={copy("screenshotRemove")}
              data-ai-screenshot-remove="true"
              disabled={readingScreenshot}
              onClick={clearScreenshot}
            >
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        ) : null}
        <div
          data-ai-composer="true"
          className="flex w-full items-end gap-2 rounded-[1.5rem] border border-border/70 bg-card px-2 py-1.5 shadow-[0_1px_2px_oklch(0_0_0/0.04),0_10px_28px_oklch(0_0_0/0.06)] focus-within:border-primary/40"
        >
          <input
            ref={screenshotInputRef}
            type="file"
            accept={SCREENSHOT_ACCEPT}
            aria-label={copy("attachScreenshot")}
            className="sr-only"
            tabIndex={-1}
            data-ai-screenshot-input="true"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = "";
              if (file) ingestScreenshot(file);
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={copy("attachScreenshot")}
            data-ai-composer-attach="true"
            disabled={
              !setupReady || sending || readingScreenshot || startingAnalysis
            }
            onClick={() => screenshotInputRef.current?.click()}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            {readingScreenshot ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Paperclip className="size-4" aria-hidden="true" />
            )}
          </Button>
          <Textarea
            ref={composerRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={(event) => {
              // Ledger AI-21: screenshots arrive as paste too (WhatsApp/
              // Facebook screenshot workflows); one decision per image.
              const file = event.clipboardData?.files?.[0];
              if (file && setupReady && !sending && !readingScreenshot) {
                event.preventDefault();
                ingestScreenshot(file);
              }
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void onSubmit();
              }
            }}
            placeholder={workspace.copy("composerPlaceholder")}
            aria-label={workspace.copy("composerPlaceholder")}
            rows={1}
            dir="auto"
            maxLength={AI_CHAT_MESSAGE_MAX_LENGTH}
            disabled={!setupReady || sending || startingAnalysis}
            className="max-h-36 min-h-11 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-sm shadow-none focus-visible:ring-0"
          />
          {sending ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label={workspace.copy("stop")}
              className="shrink-0 rounded-full border-destructive/30 text-destructive hover:bg-destructive-soft hover:text-destructive"
              onClick={stop}
            >
              <Square className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              aria-label={workspace.copy("send")}
              disabled={
                !setupReady ||
                !draft.trim() ||
                startingAnalysis ||
                readingScreenshot
              }
              className="shrink-0 rounded-full shadow-sm"
              onClick={() => void onSubmit()}
            >
              {startingAnalysis ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />
              )}
            </Button>
          )}
        </div>
        {draft.length >= counterVisibleFrom ? (
          // Ledger AI-17 residual: honest near-limit counter, one bound with
          // both server schemas (chat-limits.ts). Numbers stay LTR.
          <p
            data-ai-composer-counter="true"
            dir="ltr"
            className={cn(
              "mt-1 text-end text-caption tabular-nums",
              draft.length >= AI_CHAT_MESSAGE_MAX_LENGTH
                ? "font-semibold text-warning"
                : "text-muted-foreground",
            )}
          >
            {getAiDecisionCopy(workspace.locale, "composerCounter", {
              count: draft.length,
              max: AI_CHAT_MESSAGE_MAX_LENGTH,
            })}
          </p>
        ) : null}
      </div>
      {/*
        UI-03 — this was four shortcuts printed permanently under the
        composer. A reference the seller reads once does not earn a
        standing row beneath the thing they type into every day, so it is
        on-demand disclosure now: collapsed by default, one line when open.

        `<details>` rather than React state — it is the native disclosure
        widget, so the trigger is a real button, keyboard- and
        screen-reader-operable, with expanded state announced for free.
        The label reuses `common.cheatsheet`, which already exists in all
        three locales, so this introduces no new copy keys.
      */}
      <details
        data-ai-shortcut-disclosure="true"
        className="group mx-auto mt-1.5 hidden w-full max-w-4xl px-1 md:block"
      >
        <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1 rounded-control text-caption text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <ChevronRight
            className="size-3 transition-transform group-open:rotate-90 rtl:rotate-180 rtl:group-open:rotate-90"
            aria-hidden="true"
          />
          {t("common.cheatsheet")}
        </summary>
        <p className="mt-1.5 flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
          <span>
            <kbd className="rounded-control border border-border/60 bg-muted/50 px-1.5 py-0.5 font-sans">
              /
            </kbd>{" "}
            {copy("shortcutFocusComposer")}
          </span>
          <span>
            <kbd className="rounded-control border border-border/60 bg-muted/50 px-1.5 py-0.5 font-sans">
              Esc
            </kbd>{" "}
            {copy("shortcutStopStream")}
          </span>
          <span dir="ltr">
            <kbd className="rounded-control border border-border/60 bg-muted/50 px-1.5 py-0.5 font-sans">
              Alt+↑↓
            </kbd>{" "}
            {copy("shortcutSwitchSessions")}
          </span>
          <span dir="ltr">
            <kbd className="rounded-control border border-border/60 bg-muted/50 px-1.5 py-0.5 font-sans">
              Ctrl+↵
            </kbd>{" "}
            {copy("shortcutApproveFocused")}
          </span>
        </p>
      </details>
    </div>
  );
}
