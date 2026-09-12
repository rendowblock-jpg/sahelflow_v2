"use client";

import { memo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  PencilLine,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

import { AiMarkdown } from "@/components/ai/markdown/ai-markdown";
import { AiToolResultCard } from "@/components/ai/ai-tool-result-card";
import type {
  AiCopyFn,
  AiMessageView,
} from "@/components/ai/ai-workspace-types";
import type { AiDecisionLocale } from "@/lib/i18n/ai-decision-workspace";
import { cn, DZ_CLOCK, intlLocale } from "@/lib/utils";

/**
 * STR-01 — extracted verbatim from `ai-decision-canvas.tsx`, which had grown to
 * 1,767 lines and was re-deriving every pattern inside one file. Behaviour is
 * unchanged; this is a move, not a rewrite.
 *
 * The contract assertions that pinned these strings moved with the code rather
 * than being relaxed — see `ai-feedback-contract`, `ai-canvas-upgrade-contract`
 * and `f06-page-completion-contract`, which now read this file.
 */
function messageClock(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(
    intlLocale(locale),
    { hour: "2-digit", minute: "2-digit", ...DZ_CLOCK },
  ).format(date);
}

/**
 * One chat bubble. Memoized on (message, copy): during streaming, only the
 * message currently receiving deltas re-renders — completed messages keep
 * their parsed markdown cached inside <AiMarkdown>. The newest assistant turn
 * keeps its action row visible (older turns reveal it on hover/focus).
 */
const MessageBubble = memo(function MessageBubble({
  message,
  copy,
  locale,
  isLatest,
  onEditMessage,
  onFeedback,
}: {
  message: AiMessageView;
  copy: AiCopyFn;
  locale: AiDecisionLocale;
  isLatest?: boolean;
  onEditMessage?: (messageId: string) => void;
  onFeedback?: (messageId: string, value: "up" | "down" | "none") => void;
}) {
  const assistant = message.role === "assistant";
  const [copied, setCopied] = useState(false);
  const clock = message.createdAt ? messageClock(message.createdAt, locale) : "";

  const copyMessage = async () => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_600);
    } catch {
      // Clipboard unavailable (permissions) — non-fatal, button resets.
    }
  };

  return (
    <article
      data-ai-message={message.role}
      className={cn("group/message flex", assistant ? "justify-start" : "justify-end")}
    >
      <div className={cn("min-w-0", assistant ? "w-full max-w-3xl" : "max-w-[85%] md:max-w-[78%]") }>
        {assistant ? (
          // Assistant turns read as decision blocks — a layered card on the
          // canvas grammar. The seller's turn stays the only filled bubble,
          // so role ownership is unmistakable at a glance.
          // The assistant turn is the workspace's own voice, so it carries no
          // container: no border, no fill, no shadow. The seller's turn is the
          // only enclosed surface, which is what makes role ownership readable
          // at a glance without an avatar or a per-turn label.
          <div className="text-sm leading-6 text-foreground">
            {message.content ? (
              <div>
                {/* Assistant output is model-emitted markdown: rendered through
                    the token-tree renderer — raw HTML can only become text. */}
                <AiMarkdown content={message.content} />
                {message.streaming ? (
                  <span
                    data-ai-streaming-caret="true"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            ) : message.streaming ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {copy("working")}
              </div>
            ) : message.interrupted ? (
              <p className="text-xs text-muted-foreground">{copy("stopped")}</p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-surface rounded-ee-control bg-primary px-4 py-2.5 text-sm leading-6 text-primary-foreground">
            {message.content ? (
              // Seller input is echoed verbatim — no markdown interpretation.
              <p dir="auto" className="whitespace-pre-wrap break-words">
                {message.content}
              </p>
            ) : message.streaming ? (
              <div className="flex items-center gap-2 text-xs opacity-80">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {copy("working")}
              </div>
            ) : null}
          </div>
        )}

        {assistant && message.toolCalls.length > 0 ? (
          <div className="space-y-2 pt-3">
            {message.toolCalls.map((tool) => (
              <AiToolResultCard key={tool.id} tool={tool} />
            ))}
          </div>
        ) : null}

        {/* Ledger AI-26: truthful provider signal — rendered only when the
            provider actually reported the turn (model + usage). Line stays
            LTR: model ids and token counts are technical identifiers. */}
        {assistant && !message.streaming && message.signal ? (
          <p
            data-ai-model-signal="true"
            className="mt-1.5 text-caption text-muted-foreground"
            dir="ltr"
          >
            {message.signal.totalTokens != null
              ? copy("modelSignal", {
                  model: message.signal.model,
                  tokens: message.signal.totalTokens,
                })
              : copy("modelSignalModelOnly", {
                  model: message.signal.model,
                })}
          </p>
        ) : null}

        {message.persistenceWarning ? (
          <div className="mt-3 rounded-surface border border-warning/25 bg-warning-soft px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-warning"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold">
                  {copy("responseNotPersisted")}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {copy("responseNotPersistedDescription")}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {assistant && onFeedback && !message.streaming && message.content ? (
          // Ledger AI-13: truthful thumbs — the opposite thumb overwrites,
          // the active thumb clears; nothing auto-sends or decorates.
          <div className="mt-1.5 flex items-center gap-1">
            <button
              type="button"
              data-ai-feedback-up="true"
              aria-pressed={message.feedback === "up"}
              aria-label={copy("feedbackUp")}
              title={copy("feedbackUp")}
              disabled={message.feedback === "up"}
              onClick={() => onFeedback(message.id, "up")}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-control text-muted-foreground opacity-0 outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/message:opacity-100",
                message.feedback === "up" && "bg-primary-soft text-primary opacity-100",
              )}
            >
              <ThumbsUp className="size-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-ai-feedback-down="true"
              aria-pressed={message.feedback === "down"}
              aria-label={copy("feedbackDown")}
              title={copy("feedbackDown")}
              disabled={message.feedback === "down"}
              onClick={() => onFeedback(message.id, "down")}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-control text-muted-foreground opacity-0 outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/message:opacity-100",
                message.feedback === "down" && "bg-destructive-soft text-destructive opacity-100",
              )}
            >
              <ThumbsDown className="size-3" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {message.content && !message.streaming ? (
          // Hover action row (ChatGPT-class): edit + copy + clock under every
          // completed message; the newest-message row stays visible.
          <div
            className={cn(
              "mt-1.5 flex items-center gap-1.5 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100",
              isLatest ? "opacity-100" : "opacity-0",
              assistant ? "justify-start" : "justify-end",
            )}
          >
            {!assistant && onEditMessage ? (
              <button
                type="button"
                onClick={() => onEditMessage(message.id)}
                aria-label={copy("editMessage")}
                title={copy("editMessage")}
                className="inline-flex size-7 items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PencilLine className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void copyMessage()}
              aria-label={copied ? copy("messageCopied") : copy("copyMessage")}
              title={clock ? `${copy("copyMessage")} · ${clock}` : copy("copyMessage")}
              className="inline-flex size-7 items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copied ? (
                <Check className="size-3.5 text-success" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
            </button>
            {clock ? (
              <span className="text-caption tabular-nums text-muted-foreground" dir="ltr">
                {clock}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
});

export { MessageBubble, messageClock };
