"use client";

import {
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  ArrowUp,
  ImagePlus,
  Loader2,
  Square,
  X,
} from "lucide-react";

import {
  AiComposerEditNotice,
  AiComposerFooter,
  AiShortcutsPopover,
} from "@/components/ai/ai-shortcuts-popover";
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
 * STR-01 — the composer deck: screenshot attachment (AI-21), edit notice
 * (AI-15), the input card with send/stop, the near-limit counter (AI-17) and
 * the on-demand shortcut reference (UI-03). The draft is owned by the canvas —
 * deep-link prefill, edit prefill and follow-up chips all write it — so this
 * deck receives `draft`/`setDraft`/`composerRef` rather than a second copy.
 *
 * AI-21: a screenshot is read by the proven extraction pipeline and the result
 * is appended to the draft for review; the seller always sends it themselves.
 * These client bounds only gate the picker/paste — the route re-authenticates
 * them from the sniffed bytes (pinned equal by the attachment contract).
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

  const sendDisabled =
    !setupReady || !draft.trim() || startingAnalysis || readingScreenshot;

  return (
    <div data-ai-composer-deck="true" className="shrink-0 pb-3 pt-2">
      <div className="sf-ai-column">
        {editing ? (
          <AiComposerEditNotice
            notice={copy("editingNotice")}
            cancelLabel={copy("cancelEdit")}
            onCancel={onCancelEdit}
          />
        ) : null}
        {screenshot ? (
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
            {readingScreenshot ? (
              <Loader2
                className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            ) : null}
            <p className="min-w-0 flex-1 truncate text-body-sm text-muted-foreground">
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
          className="rounded-surface border border-border bg-card transition-colors focus-within:border-primary/40"
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
            className="max-h-48 min-h-12 w-full resize-none border-0 bg-transparent px-3.5 pb-1 pt-3 text-body shadow-none dark:bg-transparent focus-visible:ring-0"
          />
          <div className="flex items-center gap-1 px-2 pb-2">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={copy("attachScreenshot")}
              title={copy("attachScreenshot")}
              data-ai-composer-attach="true"
              disabled={!setupReady || sending || readingScreenshot || startingAnalysis}
              onClick={() => screenshotInputRef.current?.click()}
              className="text-muted-foreground hover:text-foreground"
            >
              {readingScreenshot ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ImagePlus className="size-4" aria-hidden="true" />
              )}
            </Button>
            <span className="flex-1" />
            {draft.length >= counterVisibleFrom ? (
              // Ledger AI-17 residual: honest near-limit counter, one bound
              // with both server schemas (chat-limits.ts). Numbers stay LTR.
              <span
                data-ai-composer-counter="true"
                dir="ltr"
                className={cn(
                  "px-1.5 text-caption tabular-nums",
                  draft.length >= AI_CHAT_MESSAGE_MAX_LENGTH
                    ? "font-semibold text-warning"
                    : "text-muted-foreground",
                )}
              >
                {getAiDecisionCopy(workspace.locale, "composerCounter", {
                  count: draft.length,
                  max: AI_CHAT_MESSAGE_MAX_LENGTH,
                })}
              </span>
            ) : null}
            {sending ? (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label={workspace.copy("stop")}
                title={workspace.copy("stop")}
                className="rounded-full border-destructive/30 text-destructive hover:bg-destructive-soft hover:text-destructive"
                onClick={stop}
              >
                <Square className="size-3.5 fill-current" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon-sm"
                aria-label={workspace.copy("send")}
                title={workspace.copy("send")}
                disabled={sendDisabled}
                className="rounded-full"
                onClick={() => void onSubmit()}
              >
                {startingAnalysis ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ArrowUp className="size-4" aria-hidden="true" />
                )}
              </Button>
            )}
          </div>
        </div>
        <AiComposerFooter
          trust={getAiDecisionCopy(workspace.locale, "composerTrust")}
          sendLabel={getAiDecisionCopy(workspace.locale, "composerHintSend")}
          newlineLabel={getAiDecisionCopy(workspace.locale, "composerHintNewline")}
        >
          <AiShortcutsPopover copy={copy} label={t("common.cheatsheet")} />
        </AiComposerFooter>
      </div>
    </div>
  );
}
