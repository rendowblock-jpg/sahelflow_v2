"use client";

import { memo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Info,
  Loader2,
  PencilLine,
  Plug,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

import { AiMarkdown } from "@/components/ai/markdown/ai-markdown";
import { parseMcpRequestLine } from "@/lib/ai/mcp-request-line";
import { getAiToolLabel } from "@/lib/i18n/ai-tool-labels";
import {
  getConnectedAgentsCopy,
  type ConnectedAgentsLocale,
} from "@/lib/i18n/connected-agents";
import { AiToolResultCard } from "@/components/ai/ai-tool-result-card";
import type {
  AiCopyFn,
  AiMessageView,
} from "@/components/ai/ai-workspace-types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getAiDecisionCopy,
  type AiDecisionLocale,
} from "@/lib/i18n/ai-decision-workspace";
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
  const mcpRequest = assistant ? null : parseMcpRequestLine(message.content);

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

  const actionButton =
    "inline-flex size-7 items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

  const actionRow =
    !message.streaming && message.content ? (
      // Hover action row: the newest turn, and a turn carrying a vote, keep it
      // visible; older turns reveal it on hover/focus so the thread stays quiet.
      <div
        className={cn(
          "mt-1 flex items-center gap-0.5 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100",
          isLatest || message.feedback ? "opacity-100" : "opacity-0",
          assistant ? "justify-start -ms-1.5" : "justify-end",
        )}
      >
        {!assistant && onEditMessage ? (
          <button
            type="button"
            onClick={() => onEditMessage(message.id)}
            aria-label={copy("editMessage")}
            title={copy("editMessage")}
            className={actionButton}
          >
            <PencilLine className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void copyMessage()}
          aria-label={copied ? copy("messageCopied") : copy("copyMessage")}
          title={copy("copyMessage")}
          className={actionButton}
        >
          {copied ? (
            <Check className="size-3.5 text-success" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" aria-hidden="true" />
          )}
        </button>
        {assistant && onFeedback ? (
          // Ledger AI-13: truthful thumbs — the opposite thumb overwrites, the
          // active thumb clears; nothing auto-sends or decorates.
          <>
            <button
              type="button"
              data-ai-feedback-up="true"
              aria-pressed={message.feedback === "up"}
              aria-label={copy("feedbackUp")}
              title={copy("feedbackUp")}
              disabled={message.feedback === "up"}
              onClick={() => onFeedback(message.id, "up")}
              className={cn(actionButton, message.feedback === "up" && "bg-primary-soft text-primary")}
            >
              <ThumbsUp className="size-3.5" aria-hidden="true" />
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
                actionButton,
                message.feedback === "down" && "bg-destructive-soft text-destructive",
              )}
            >
              <ThumbsDown className="size-3.5" aria-hidden="true" />
            </button>
          </>
        ) : null}
        {/* Ledger AI-26: truthful provider signal — present only when the
            provider actually reported the turn (model + usage). Technical
            identifiers stay LTR. */}
        {assistant && message.signal ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={getAiDecisionCopy(locale, "turnDetails")}
                title={getAiDecisionCopy(locale, "turnDetails")}
                className={actionButton}
              >
                <Info className="size-3.5" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-60 p-3">
              <p className="text-caption font-medium text-muted-foreground">
                {getAiDecisionCopy(locale, "turnDetails")}
              </p>
              <dl data-ai-model-signal="true" className="mt-2 space-y-1.5 text-body-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{getAiDecisionCopy(locale, "modelLabel")}</dt>
                  <dd dir="ltr" className="truncate font-medium">{message.signal.model}</dd>
                </div>
                {message.signal.totalTokens != null ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">{getAiDecisionCopy(locale, "tokensLabel")}</dt>
                    <dd dir="ltr" className="font-medium tabular-nums">
                      {message.signal.totalTokens.toLocaleString(intlLocale(locale))}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </PopoverContent>
          </Popover>
        ) : null}
        {clock ? (
          <span className="px-1.5 text-caption tabular-nums text-muted-foreground" dir="ltr">
            {clock}
          </span>
        ) : null}
      </div>
    ) : null;

  const persistenceWarning = message.persistenceWarning ? (
    <div className="mt-3 flex items-start gap-2.5 rounded-surface border border-warning/25 bg-warning-subtle px-3.5 py-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <div>
        <p className="text-body-sm font-semibold">{copy("responseNotPersisted")}</p>
        <p className="mt-0.5 text-caption text-muted-foreground">
          {copy("responseNotPersistedDescription")}
        </p>
      </div>
    </div>
  ) : null;

  if (!assistant) {
    return (
      <article data-ai-message={message.role} className="group/message flex flex-col items-end">
        <div className="max-w-[85%] rounded-surface bg-muted px-4 py-2.5 text-body text-foreground">
          {mcpRequest ? (
            // An external agent's call is shown as what it asked for; the
            // sealed arguments stay in the proposal the seller reviews.
            <p data-ai-agent-request="true" className="flex items-center gap-2 text-body-sm font-medium">
              <Plug className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {getConnectedAgentsCopy(locale as ConnectedAgentsLocale, "agentRequest", {
                tool: getAiToolLabel(locale as ConnectedAgentsLocale, mcpRequest.tool),
              })}
            </p>
          ) : message.content ? (
            // Seller input is echoed verbatim — no markdown interpretation.
            <p dir="auto" className="whitespace-pre-wrap break-words">
              {message.content}
            </p>
          ) : message.streaming ? (
            <span className="flex items-center gap-2 text-caption text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {copy("working")}
            </span>
          ) : null}
        </div>
        {persistenceWarning}
        {actionRow}
      </article>
    );
  }

  return (
    <article data-ai-message={message.role} className="group/message">
      {/* One quiet identity line per assistant turn: the workspace speaks as a
          named agent, and the body below reads at full column width. */}
      <div className="mb-1.5 flex items-center gap-2">
        <span
          data-ai-agent-mark="true"
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary"
        >
          <Sparkles className="size-3.5" />
        </span>
        <span className="text-body-sm font-semibold">
          {getAiDecisionCopy(locale, "agentName")}
        </span>
      </div>
      <div className="ps-8">
        <div className="text-body leading-7 text-foreground">
          {message.content ? (
            <div>
              {/* Assistant output is model-emitted markdown: rendered through
                  the token-tree renderer — raw HTML can only become text. */}
              <AiMarkdown content={message.content} />
              {message.streaming ? (
                <span data-ai-streaming-caret="true" aria-hidden="true" />
              ) : null}
            </div>
          ) : message.streaming ? (
            <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {copy("working")}
            </div>
          ) : message.interrupted ? (
            <p className="text-body-sm text-muted-foreground">{copy("stopped")}</p>
          ) : null}
        </div>

        {message.toolCalls.length > 0 ? (
          <div className="space-y-2 pt-3">
            {message.toolCalls.map((tool) => (
              <AiToolResultCard key={tool.id} tool={tool} />
            ))}
          </div>
        ) : null}
        {persistenceWarning}
        {actionRow}
      </div>
    </article>
  );
});

export { MessageBubble, messageClock };
