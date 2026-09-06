"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Bot,
  BrainCircuit,
  Check,
  ChevronUp,
  CircleDollarSign,
  ClipboardCheck,
  Copy,
  Loader2,
  PackageSearch,
  Paperclip,
  PencilLine,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Square,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";

import { AiActionProposalCard } from "@/components/ai/ai-action-proposal-card";
import {
  AiFollowUpChips,
  deriveFollowUpSuggestions,
} from "@/components/ai/ai-follow-up-chips";
import { AiMarkdown } from "@/components/ai/markdown/ai-markdown";
import { AiReviewEvidence } from "@/components/ai/ai-review-evidence";
import { AiToolResultCard } from "@/components/ai/ai-tool-result-card";
import type {
  AiCapabilityGroup,
  AiMessageView,
  AiShopBriefing,
  AiWorkspaceError,
} from "@/components/ai/ai-workspace-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { useI18n } from "@/hooks/use-i18n";
import {
  AI_CHAT_COUNTER_VISIBLE_SHARE,
  AI_CHAT_MESSAGE_MAX_LENGTH,
} from "@/lib/ai/chat-limits";
import { getAiDecisionCopy, type AiDecisionLocale } from "@/lib/i18n/ai-decision-workspace";
import { getAiToolGroupLabel, getAiToolLabel } from "@/lib/i18n/ai-tool-labels";
import type { AiWorkspaceCopyKey } from "@/lib/i18n/ai-workspace";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

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

function errorMessage(
  error: AiWorkspaceError,
  workspace: ReturnType<typeof useAiWorkspace>,
): string {
  switch (error.code) {
    case "AI_CONSENT_REQUIRED":
      return workspace.copy("consentMissing");
    case "AI_LICENSE_REQUIRED":
      return workspace.copy("licenseRequired");
    case "AI_RATE_LIMITED":
      return workspace.copy("rateLimited");
    case "AI_INVALID_MESSAGE":
    case "AI_INVALID_REQUEST":
      return workspace.copy("invalidMessage");
    case "AI_SESSION_NOT_FOUND":
      return workspace.copy("sessionMissing");
    case "AI_RESPONSE_NOT_PERSISTED":
      return workspace.copy("responseNotPersisted");
    case "AI_SESSION_LOAD_FAILED":
      return workspace.copy("conversationLoadFailed");
    case "AI_SESSION_CREATE_FAILED":
      return workspace.copy("sessionCreateFailed");
    case "AI_PROVIDER_UNAVAILABLE":
      return workspace.copy("providerDegraded");
    case "AI_PROVIDER_REPORTED":
      // F-09: the server's locale-native verdict IS the banner text — no
      // invented title on top of it. Falls back to the degraded copy only
      // if an older paired server sent an empty message.
      return error.detail && error.detail.trim()
        ? error.detail
        : workspace.copy("providerDegraded");
    case "AI_STREAM_TIMEOUT":
      return workspace.copy("streamTimeout");
    default:
      return workspace.copy("genericError");
  }
}

const STARTERS = [
  {
    id: "pending",
    title: "launchPendingTitle",
    description: "launchPendingDescription",
    prompt: "launchPendingPrompt",
    icon: ClipboardCheck,
  },
  {
    id: "revenue",
    title: "launchRevenueTitle",
    description: "launchRevenueDescription",
    prompt: "launchRevenuePrompt",
    icon: CircleDollarSign,
  },
  {
    id: "returns",
    title: "launchReturnsTitle",
    description: "launchReturnsDescription",
    prompt: "launchReturnsPrompt",
    icon: RotateCcw,
  },
  {
    id: "products",
    title: "launchProductsTitle",
    description: "launchProductsDescription",
    prompt: "launchProductsPrompt",
    icon: PackageSearch,
  },
] as const;

function SetupNotice({
  workspace,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
}) {
  const { setup, setupError, refreshSetup, locale } = workspace;
  if (setup?.ready === true) return null;

  if (!setup && !setupError) {
    return (
      <div className="flex items-center gap-2.5 border-b bg-muted/25 px-4 py-2.5 text-xs text-muted-foreground md:px-6">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {getAiDecisionCopy(locale, "setupChecking")}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/20 bg-warning/5 px-4 py-2.5 md:px-6">
      <div className="flex min-w-0 items-start gap-2.5">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-warning"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {setupError
              ? workspace.copy("setupUnavailable")
              : getAiDecisionCopy(locale, "setupAttention")}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {setupError
              ? workspace.copy("setupUnavailableDescription")
              : !setup?.consentAccepted
                ? workspace.copy("consentMissing")
                : workspace.copy("keyMissing")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {setupError ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refreshSetup()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {workspace.copy("retry")}
          </Button>
        ) : null}
        <Button asChild variant="outline" size="sm">
          <Link href="/settings?group=intelligence">
            <Settings2 className="size-4" aria-hidden="true" />
            {workspace.copy("openSettings")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function ErrorNotice({
  workspace,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
}) {
  const { error, retry } = workspace;
  if (!error) return null;
  const persistenceOnly = error.code === "AI_RESPONSE_NOT_PERSISTED";

  return (
    <div className="mx-4 mt-3 flex items-start justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/[0.06] p-3.5 shadow-sm md:mx-6">
      <div className="flex min-w-0 items-start gap-2.5">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{errorMessage(error, workspace)}</p>
          {error.detail && error.code !== "AI_PROVIDER_REPORTED" ? (
            // AI_PROVIDER_REPORTED already renders the server message as the
            // title — repeating it as the sub-line would duplicate the text.
            <p dir="auto" className="mt-1 text-xs leading-5 text-muted-foreground">
              {error.detail}
            </p>
          ) : null}
        </div>
      </div>
      {!persistenceOnly ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => void retry()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {workspace.copy("retry")}
        </Button>
      ) : null}
    </div>
  );
}

type AiCopyFn = (
  key: AiWorkspaceCopyKey,
  params?: Record<string, string | number>,
) => string;

function messageClock(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB",
    { hour: "2-digit", minute: "2-digit" },
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
      className={cn("group/message flex gap-3", assistant ? "justify-start" : "justify-end")}
    >
      {assistant ? (
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-gradient-to-b from-primary/12 to-primary/[0.04] text-primary shadow-sm">
          <Bot className="size-4" aria-hidden="true" />
        </span>
      ) : null}
      <div className={cn("min-w-0", assistant ? "w-full max-w-3xl" : "max-w-[85%] md:max-w-[78%]") }>
        {assistant ? (
          // Byline owns identity (F-06): the turn is attributed to the
          // assistant, the clock stays on the hover row (AI-12).
          <p className="mb-1.5 text-2xs font-semibold tracking-wide text-muted-foreground">
            {getAiDecisionCopy(locale, "assistantName")}
          </p>
        ) : null}
        {assistant ? (
          // Assistant turns read as the workspace's own voice — a flat,
          // borderless surface on the canvas. The seller's turn stays the
          // only filled bubble, so role ownership is unmistakable at a glance.
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
          <div className="rounded-2xl rounded-ee-md bg-primary px-4 py-2.5 text-sm leading-6 text-primary-foreground shadow-sm">
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
            className="mt-1.5 text-2xs text-muted-foreground"
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
          <div className="mt-3 rounded-xl border border-warning/25 bg-warning/[0.06] px-3.5 py-3">
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
                "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/message:opacity-100",
                message.feedback === "up" && "bg-primary/10 text-primary opacity-100",
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
                "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/message:opacity-100",
                message.feedback === "down" && "bg-destructive/10 text-destructive opacity-100",
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
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PencilLine className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void copyMessage()}
              aria-label={copied ? copy("messageCopied") : copy("copyMessage")}
              title={clock ? `${copy("copyMessage")} · ${clock}` : copy("copyMessage")}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copied ? (
                <Check className="size-3.5 text-success" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
            </button>
            {clock ? (
              <span className="text-2xs tabular-nums text-muted-foreground" dir="ltr">
                {clock}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
});

function SetupChecklistRow({
  ready,
  label,
  readyLabel,
  missingLabel,
}: {
  ready: boolean;
  label: string;
  readyLabel: string;
  missingLabel: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border bg-background/60 px-3 py-2">
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md",
            ready ? "bg-success/10 text-success" : "bg-warning/10 text-warning",
          )}
        >
          {ready ? (
            <Check className="size-3.5" aria-hidden="true" />
          ) : (
            <AlertTriangle className="size-3.5" aria-hidden="true" />
          )}
        </span>
        <span className="truncate text-xs font-medium">{label}</span>
      </span>
      <span
        className={cn(
          "shrink-0 text-2xs font-semibold",
          ready ? "text-success" : "text-warning",
        )}
      >
        {ready ? readyLabel : missingLabel}
      </span>
    </li>
  );
}

/**
 * Ledger F-06 — the agents workforce, rendered from capability truth.
 * Groups and availability come from /api/ai/capabilities, which projects the
 * SAME central policy map the registry and proposal runtime enforce — the page
 * can never claim an ability the agent does not have, nor hide one it has.
 */
function AbilityGroupCard({
  group,
  locale,
}: {
  group: AiCapabilityGroup;
  locale: ReturnType<typeof useAiWorkspace>["locale"];
}) {
  return (
    <div
      data-ai-ability-group={group.id}
      className="rounded-xl border border-border/60 bg-card/60 p-4"
    >
      <p className="text-sm font-semibold">
        {getAiToolGroupLabel(locale, group.id)}
      </p>
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {group.tools.map((tool) => {
          const sensitive = tool.executionClass === "sensitive";
          return (
            <li
              key={tool.name}
              data-ai-ability={tool.name}
              data-ai-ability-class={tool.executionClass}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors",
                sensitive
                  ? "border-warning/30 bg-warning/[0.08] text-warning"
                  : "border-border/60 bg-background text-foreground",
              )}
            >
              {getAiToolLabel(locale, tool.name)}
              {sensitive ? (
                <>
                  <ShieldCheck className="size-3" aria-hidden="true" />
                  <span className="sr-only">
                    {getAiDecisionCopy(locale, "abilityNeedsApproval")}
                  </span>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AbilitiesPanel({
  workspace,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
}) {
  const { capabilities, capabilitiesError, loadingCapabilities, locale } =
    workspace;

  return (
    <section data-ai-abilities="true" className="mt-10 w-full text-start">
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {getAiDecisionCopy(locale, "abilitiesTitle")}
      </p>
      {loadingCapabilities ? (
        // Structure-matching skeleton (§26.8): the shape of two group cards.
        <div
          data-ai-abilities-skeleton="true"
          aria-hidden="true"
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="rounded-xl border bg-card/60 p-4">
              <span data-ai-skeleton="true" className="block h-3.5 w-20 rounded-full" />
              <span data-ai-skeleton="true" className="mt-3 block h-4 w-3/4 rounded-full" />
              <span data-ai-skeleton="true" className="mt-1.5 block h-4 w-1/2 rounded-full" />
            </div>
          ))}
        </div>
      ) : capabilitiesError || !capabilities ? (
        // Honest unavailability — the stale-marketing sentence is never shown
        // as if it were live truth.
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {getAiDecisionCopy(locale, "abilitiesUnavailable")}
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            {getAiDecisionCopy(locale, "abilitiesDescription")}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {capabilities.groups.map((group) => (
              <AbilityGroupCard key={group.id} group={group} locale={locale} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** F-06: the shop's real numbers, next to the jobs they ground. A count that
 *  could not be measured renders no badge — never a fabricated zero. */
function starterCount(
  id: (typeof STARTERS)[number]["id"],
  briefing: AiShopBriefing | undefined,
): { copyKey: "starterCountPending" | "starterCountToday" | "starterCountLowStock"; count: number } | null {
  if (!briefing) return null;
  if (id === "pending" && briefing.pendingOrders != null) {
    return { copyKey: "starterCountPending", count: briefing.pendingOrders };
  }
  if (id === "revenue" && briefing.ordersToday != null) {
    return { copyKey: "starterCountToday", count: briefing.ordersToday };
  }
  if (id === "products" && briefing.lowStockProducts != null) {
    return { copyKey: "starterCountLowStock", count: briefing.lowStockProducts };
  }
  return null;
}

/**
 * Ledger F-06 — the shop-wide approval loop, surfaced where the seller works.
 * Pending sensitive actions exist across ALL sessions; without this strip
 * they were invisible unless the seller already knew to open the review
 * pane. Hidden while the rail owns the surface (wideReview) and while the
 * inbox is loading or failed (honest absence, not a fake "all clear").
 */
function InboxStrip({
  workspace,
  wideReview,
  onOpenReview,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  wideReview: boolean;
  onOpenReview: () => void;
}) {
  const { inbox, inboxLoading, inboxError, locale } = workspace;
  if (wideReview || inboxLoading || inboxError || inbox.length === 0) {
    return null;
  }
  return (
    <div
      data-ai-inbox-strip="true"
      className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/[0.05] px-4 py-3 shadow-sm md:mx-6"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {getAiDecisionCopy(locale, "inboxStripCount", { count: inbox.length })}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {getAiDecisionCopy(locale, "inboxStripDescription")}
          </p>
        </div>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onOpenReview}>
        {getAiDecisionCopy(locale, "inboxStripOpen")}
      </Button>
    </div>
  );
}

function StartSurface({
  workspace,
  starting,
  onStart,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  starting: boolean;
  onStart: (prompt: string) => Promise<boolean>;
}) {
  const ready = workspace.setup?.ready === true;

  return (
    <div data-ai-start-state="true" className="mx-auto flex w-full max-w-3xl flex-col items-center py-10 text-center md:py-14">
      <span className="relative flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/15 to-primary/[0.04] text-primary shadow-sm">
        <BrainCircuit className="size-7" aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight">
        {getAiDecisionCopy(workspace.locale, "startTitle")}
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        {getAiDecisionCopy(workspace.locale, "startDescription")}
      </p>
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-2xs font-medium text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        {getAiDecisionCopy(workspace.locale, "safeStartNote")}
      </p>

      {!ready && workspace.setup ? (
        <div className="mt-7 w-full rounded-xl border bg-card/60 p-4 text-start shadow-sm md:p-5">
          <p className="text-sm font-semibold">
            {getAiDecisionCopy(workspace.locale, "setupRequiredTitle")}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {getAiDecisionCopy(workspace.locale, "setupRequiredCapabilities")}
          </p>
          {/* Truthful two-row checklist: the same configuration facts the
              review panel owns (consent + key), never provider health. */}
          <ul className="mt-3 space-y-1.5">
            <SetupChecklistRow
              ready={workspace.setup.consentAccepted === true}
              label={workspace.copy("consent")}
              readyLabel={workspace.copy("accepted")}
              missingLabel={workspace.copy("missing")}
            />
            <SetupChecklistRow
              ready={workspace.setup.keyConfigured === true}
              label={workspace.copy("gemini")}
              readyLabel={workspace.copy("configured")}
              missingLabel={workspace.copy("notConfigured")}
            />
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(
              [
                "setupChipPendingOrders",
                "setupChipBestProducts",
                "setupChipRevenueToday",
                "setupChipTopWilayas",
              ] as const
            ).map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-2xs text-muted-foreground"
              >
                {getAiDecisionCopy(workspace.locale, chip)}
              </span>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
            <ShieldCheck
              className="mt-0.5 size-3.5 shrink-0 text-primary"
              aria-hidden="true"
            />
            {getAiDecisionCopy(workspace.locale, "setupRequiredPrivacyNote")}
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href="/settings?group=intelligence">
              <Settings2 className="size-4" aria-hidden="true" />
              {workspace.copy("openSettings")}
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="mt-9 flex w-full items-center gap-3">
        <span className="h-px flex-1 bg-border/60" aria-hidden="true" />
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {getAiDecisionCopy(workspace.locale, "startJobsTitle")}
        </p>
        <span className="h-px flex-1 bg-border/60" aria-hidden="true" />
      </div>
      <div className="mt-4 grid w-full gap-3 sm:grid-cols-2">
        {STARTERS.map((starter) => {
          const Icon = starter.icon;
          const count = starterCount(starter.id, workspace.capabilities?.briefing);
          return (
            <button
              key={starter.id}
              type="button"
              disabled={!ready || starting}
              onClick={() => void onStart(workspace.copy(starter.prompt))}
              className={cn(
                "group/starter rounded-xl border border-border/60 bg-card/60 p-4 text-start transition-all duration-200",
                "hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-[0_2px_4px_oklch(0_0_0/0.04),0_12px_28px_oklch(0_0_0/0.07)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              <span className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-gradient-to-b from-primary/12 to-primary/[0.04] text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {workspace.copy(starter.title)}
                    </span>
                    {count ? (
                      <span
                        data-ai-briefing-count={starter.id}
                        className="shrink-0 rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-0.5 text-2xs font-semibold tabular-nums text-primary"
                      >
                        {getAiDecisionCopy(workspace.locale, count.copyKey, {
                          count: count.count,
                        })}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {workspace.copy(starter.description)}
                  </span>
                </span>
                <ArrowRight
                  className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-all duration-200 group-hover/starter:translate-x-0.5 group-hover/starter:opacity-60 rtl:-scale-x-100 rtl:group-hover/starter:-translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </button>
          );
        })}
      </div>

      {/* F-06: the workforce itself — what the agent can do on THIS shop,
          live from the tool policy, with honest availability markers. */}
      <AbilitiesPanel workspace={workspace} />
    </div>
  );
}

export function AiDecisionCanvas({
  workspace,
  wideReview,
  mobile,
  startingAnalysis,
  initialDraft = "",
  onBack,
  onSend,
  onStart,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  wideReview: boolean;
  mobile: boolean;
  startingAnalysis: boolean;
  /** Composer prefill from a /agents?q= deep link (record-surface "Ask AI"). */
  initialDraft?: string;
  onBack: () => void;
  onSend: (message: string) => Promise<boolean>;
  onStart: (prompt: string) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const {
    activeSession,
    messages,
    proposals,
    loadingConversation,
    sending,
    setup,
    stop,
    canRegenerate,
    regenerate,
    copy,
    sessions,
    activeSessionId,
    selectSession,
    inbox,
    inboxError,
    approveProposal,
    historyCapped,
    loadingOlderMessages,
    loadOlderMessages,
    editingMessageId,
    beginEditMessage,
    cancelEditMessage,
    editAndResend,
    sendFeedback,
  } = workspace;
  const [draft, setDraft] = useState(initialDraft);
  const [prevInitialDraft, setPrevInitialDraft] = useState(initialDraft);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [awayFromTail, setAwayFromTail] = useState(false);
  // Ledger AI-14: dismissal is anchored to the conversation tail id — a new
  // turn naturally re-offers grounded suggestions.
  const [chipsDismissedFor, setChipsDismissedFor] = useState<string | null>(null);
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
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const tailRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const followTailRef = useRef(true);
  const setupReady = setup?.ready === true;
  // Ledger AI-17 residual: the counter owns the last 30% of the bound —
  // always-visible counters are noise for the common short prompt.
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

  const extractScreenshot = async (
    shot: { file: File; previewUrl: string },
  ): Promise<void> => {
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
  // Ledger F-06: the badge is shop-wide truth. The inbox covers pending
  // proposals from EVERY session (the current session's are a subset); when
  // the inbox is unavailable the session queue remains the honest fallback.
  const reviewBadgeCount = inboxError
    ? proposals.length
    : inbox.length > 0
      ? inbox.length
      : proposals.length;
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1]!.id : null;
  const editingMessage = editingMessageId
    ? messages.find(
        (message) => message.id === editingMessageId && message.role === "user",
      ) ?? null
    : null;
  const followUpSuggestions = useMemo(
    () =>
      sending || editingMessageId
        ? []
        : deriveFollowUpSuggestions(messages, copy),
    [copy, editingMessageId, messages, sending],
  );

  useEffect(() => {
    const viewport = scrollRootRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport) return;
    const updateFollowState = () => {
      const remaining = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      followTailRef.current = remaining < 96;
      // Mirrors the ref into state (value-guarded) to drive the scroll pill.
      setAwayFromTail(remaining >= 96);
    };
    updateFollowState();
    viewport.addEventListener("scroll", updateFollowState, { passive: true });
    return () => viewport.removeEventListener("scroll", updateFollowState);
  }, [activeSession?.id]);

  useEffect(() => {
    followTailRef.current = true;
    tailRef.current?.scrollIntoView({ block: "end" });
  }, [activeSession?.id]);

  // Deep-link prefill (?q=): a fresh prompt seeds the composer only while
  // it is still empty — the seller's own typing always wins. (Render-phase
  // adjust-state-on-prop-change recipe; no setState inside an effect.)
  if (initialDraft !== prevInitialDraft) {
    setPrevInitialDraft(initialDraft);
    if (!draft) {
      setDraft(initialDraft);
    }
  }

  // Ledger AI-15: entering edit mode prefills the composer with the durable
  // message text once, per edit session.
  const [prevEditingId, setPrevEditingId] = useState<string | null>(null);
  if (editingMessageId !== prevEditingId) {
    setPrevEditingId(editingMessageId);
    if (editingMessageId && editingMessage) {
      setDraft(editingMessage.content);
    }
  }

  // Ledger AI-14: a new turn re-offers suggestions after an explicit dismissal.
  const [prevTailForChips, setPrevTailForChips] = useState<string | null>(null);
  if (lastMessageId !== prevTailForChips) {
    setPrevTailForChips(lastMessageId);
    if (chipsDismissedFor !== null && chipsDismissedFor !== lastMessageId) {
      setChipsDismissedFor(null);
    }
  }

  useEffect(() => {
    if (!sending || !followTailRef.current) return;
    tailRef.current?.scrollIntoView({ block: "end" });
  }, [messages, sending]);

  const submit = async () => {
    const value = draft.trim();
    if (!value || sending || !setupReady || startingAnalysis) return;
    if (editingMessageId) {
      // Ledger AI-15: an edited send truncates the durable tail, then re-sends.
      const accepted = await editAndResend(editingMessageId, value);
      if (accepted) setDraft("");
      return;
    }
    const accepted = await onSend(value);
    if (accepted) setDraft("");
  };

  // Ledger AI-22: discoverable keyboard surface. "/" focuses the composer
  // (Gmail/WhatsApp convention, inert while typing), Escape stops an active
  // stream (or cancels edit mode), Alt+↑/↓ walks the session list, and
  // Ctrl+Enter approves the focused proposal card.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Radix-owned surfaces (sheets/dialogs) consume Escape first.
        if (document.querySelector('[role="dialog"]')) return;
        if (editingMessageId) {
          event.preventDefault();
          cancelEditMessage();
          return;
        }
        if (sending) {
          event.preventDefault();
          stop();
        }
        return;
      }
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        const target = event.target as HTMLElement | null;
        if (
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.isContentEditable
        ) {
          return;
        }
        event.preventDefault();
        composerRef.current?.focus();
        return;
      }
      if (event.ctrlKey && event.key === "Enter") {
        const focused = document.activeElement?.closest<HTMLElement>(
          "[data-ai-proposal-id]",
        );
        const proposalId = focused?.dataset.aiProposalId;
        if (!proposalId) return;
        const handle =
          proposals.find((entry) => entry.proposal.id === proposalId) ??
          inbox.find((entry) => entry.proposal.id === proposalId);
        if (handle) {
          event.preventDefault();
          void approveProposal(handle);
        }
        return;
      }
      if (
        event.altKey &&
        !event.ctrlKey &&
        (event.key === "ArrowUp" || event.key === "ArrowDown")
      ) {
        if (sessions.length === 0) return;
        const index = sessions.findIndex(
          (session) => session.id === activeSessionId,
        );
        if (index < 0) return;
        const next = event.key === "ArrowUp" ? index - 1 : index + 1;
        if (next < 0 || next >= sessions.length) return;
        event.preventDefault();
        selectSession(sessions[next]!.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeSessionId,
    approveProposal,
    cancelEditMessage,
    editingMessageId,
    inbox,
    proposals,
    selectSession,
    sending,
    sessions,
    stop,
  ]);

  return (
    <main data-ai-decision-canvas="true" className="relative flex h-full min-h-0 flex-col bg-background">
      <header className="flex min-h-16 items-center justify-between gap-3 border-b px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {mobile ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={workspace.copy("backToSessions")}
              onClick={onBack}
            >
              <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Button>
          ) : null}
          <span className="relative flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-gradient-to-b from-primary/12 to-primary/[0.04] text-primary shadow-sm">
            <Bot className="size-4" aria-hidden="true" />
            {workspace.setup ? (
              // Configuration truth on the avatar (AI-26): consent+key state
              // from the setup probe — never a fabricated provider heartbeat.
              <span
                data-ai-status-dot={setupReady ? "ready" : "attention"}
                aria-hidden="true"
                className="absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full border-2 border-background"
              />
            ) : null}
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-base font-semibold tracking-tight">
                {activeSession?.title || workspace.copy("newSessionTitle")}
              </h2>
              {/* Ledger AI-01: seeded demo sessions are labelled honestly so
                  canned conversations are never mistaken for model output. */}
              {activeSession?.id.startsWith("demo-") ? (
                <Badge
                  variant="secondary"
                  className="shrink-0 text-2xs font-medium"
                >
                  {getAiDecisionCopy(workspace.locale, "demoBadge")}
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {activeSession
                ? `${getAiDecisionCopy(workspace.locale, "durableSession")} · ${getAiDecisionCopy(workspace.locale, "messagesMeta", { count: messages.length })}`
                : getAiDecisionCopy(workspace.locale, "newAnalysis")}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {workspace.setup ? (
            <Badge
              variant="outline"
              data-ai-config-chip="true"
              className="hidden items-center gap-1.5 text-2xs font-medium text-muted-foreground sm:inline-flex"
            >
              <span
                data-ai-status-dot={setupReady ? "ready" : "attention"}
                aria-hidden="true"
                className="size-1.5 rounded-full"
              />
              {setupReady
                ? getAiDecisionCopy(workspace.locale, "providerReady")
                : getAiDecisionCopy(workspace.locale, "setupAttention")}
            </Badge>
          ) : null}
          {!wideReview ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setReviewOpen(true)}
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              {getAiDecisionCopy(workspace.locale, "reviewEvidence")}
              {reviewBadgeCount > 0 ? (
                <Badge variant="secondary" className="ms-1 rounded-full px-2 text-2xs tabular-nums">
                  {reviewBadgeCount}
                </Badge>
              ) : null}
            </Button>
          ) : null}
        </div>
      </header>

      <SetupNotice workspace={workspace} />
      <ErrorNotice workspace={workspace} />
      {/* Ledger F-06: pending agent work across ALL sessions, surfaced where
          the seller works — the approval loop is the page's main output. */}
      <InboxStrip
        workspace={workspace}
        wideReview={wideReview}
        onOpenReview={() => setReviewOpen(true)}
      />

      <div ref={scrollRootRef} className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            aria-busy={sending}
            aria-label={workspace.copy("messageLog")}
            className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8"
          >
            {loadingConversation ? (
              // Structure-matching skeleton (§26.8): the shape of a turn pair
              // instead of a bare spinner — no fake content, no layout jump.
              <div
                data-ai-conversation-skeleton="true"
                aria-hidden="true"
                className="mx-auto w-full max-w-3xl space-y-7 py-2"
              >
                <div className="flex gap-3">
                  <span data-ai-skeleton="true" className="mt-0.5 size-8 shrink-0 rounded-lg" />
                  <div className="w-full max-w-3xl space-y-2.5">
                    <span data-ai-skeleton="true" className="block h-3 w-24 rounded-full" />
                    <span data-ai-skeleton="true" className="block h-3.5 w-11/12 rounded-md" />
                    <span data-ai-skeleton="true" className="block h-3.5 w-4/5 rounded-md" />
                    <span data-ai-skeleton="true" className="block h-3.5 w-2/5 rounded-md" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <span data-ai-skeleton="true" className="block h-11 w-2/5 rounded-2xl rounded-ee-md" />
                </div>
                <div className="flex gap-3">
                  <span data-ai-skeleton="true" className="mt-0.5 size-8 shrink-0 rounded-lg" />
                  <div className="w-full max-w-3xl space-y-2.5">
                    <span data-ai-skeleton="true" className="block h-3 w-24 rounded-full" />
                    <span data-ai-skeleton="true" className="block h-3.5 w-3/4 rounded-md" />
                  </div>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <StartSurface
                workspace={workspace}
                starting={startingAnalysis || sending}
                onStart={onStart}
              />
            ) : (
              <div className="space-y-6">
                {historyCapped ? (
                  <div className="flex justify-center" data-ai-load-older="true">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-full text-xs shadow-sm"
                      disabled={loadingOlderMessages}
                      onClick={() => void loadOlderMessages()}
                    >
                      {loadingOlderMessages ? (
                        <Loader2
                          className="me-1.5 size-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <ChevronUp className="me-1.5 size-3.5" aria-hidden="true" />
                      )}
                      {copy("loadEarlier")}
                    </Button>
                  </div>
                ) : null}
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    copy={copy}
                    locale={workspace.locale}
                    isLatest={message.id === lastMessageId}
                    onEditMessage={beginEditMessage}
                    onFeedback={sendFeedback}
                  />
                ))}

                {canRegenerate ? (
                  <div data-ai-regenerate="true" className="ms-11 flex">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => void regenerate()}
                    >
                      <RotateCcw className="me-1.5 size-3.5" aria-hidden="true" />
                      {t("ai.canvas.regenerate")}
                    </Button>
                  </div>
                ) : null}

                {/* Ledger AI-14: grounded follow-up affordances under the last
                    completed answer; anchored dismissal resets on a new turn. */}
                {!sending && !editingMessageId && lastMessageId ? (
                  <AiFollowUpChips
                    suggestions={followUpSuggestions}
                    copy={copy}
                    onPick={(prompt) => {
                      setDraft(prompt);
                      composerRef.current?.focus();
                    }}
                    onDismiss={() => setChipsDismissedFor(lastMessageId)}
                    className={
                      chipsDismissedFor === lastMessageId ? "hidden" : undefined
                    }
                  />
                ) : null}

                {proposals.length > 0 ? (
                  <section
                    data-ai-inline-proposals="true"
                    className="ms-11 max-w-3xl border-s-2 border-primary/25 ps-4"
                    aria-labelledby="ai-proposed-changes-title"
                  >
                    <div className="mb-3">
                      <h2 id="ai-proposed-changes-title" className="text-sm font-semibold">
                        {getAiDecisionCopy(workspace.locale, "proposedChanges")}
                      </h2>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {getAiDecisionCopy(workspace.locale, "proposedChangesDescription")}
                      </p>
                    </div>
                    <div className="space-y-3">
                      {proposals.map((handle) => (
                        <div
                          key={handle.proposal.id}
                          data-ai-proposal-id={handle.proposal.id}
                        >
                          <AiActionProposalCard
                            handle={handle}
                            approving={
                              workspace.approvingProposalId === handle.proposal.id
                            }
                            onApprove={workspace.approveProposal}
                            interactive={false}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            )}
            <div ref={tailRef} className="h-px" aria-hidden="true" />
          </div>
        </ScrollArea>
      </div>

      {awayFromTail && messages.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-10 flex justify-center">
          <button
            type="button"
            onClick={() => {
              followTailRef.current = true;
              setAwayFromTail(false);
              tailRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
            }}
            aria-label={workspace.copy("scrollToLatest")}
            className="pointer-events-auto inline-flex size-9 items-center justify-center rounded-full border border-border/60 bg-card/90 text-foreground shadow-md outline-none backdrop-blur-sm transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowDown className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div
        data-ai-composer-deck="true"
        className="border-t px-4 py-3 md:px-6 md:py-4"
      >
        {editingMessage ? (
          <div
            data-ai-editing="true"
            className="mx-auto mb-2 flex w-full max-w-4xl items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/[0.07] px-3.5 py-2.5"
          >
            <p className="min-w-0 truncate text-xs text-foreground">
              {copy("editingNotice")}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 text-xs"
              onClick={cancelEditMessage}
            >
              {copy("cancelEdit")}
            </Button>
          </div>
        ) : null}
        <div className="mx-auto w-full max-w-4xl">
          {screenshot ? (
            <div
              data-ai-screenshot-chip="true"
              className="mb-2 flex items-center gap-3 rounded-xl border border-border/60 bg-muted/25 px-3 py-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, never persisted */}
              <img
                src={screenshot.previewUrl}
                alt={screenshot.file.name || copy("attachScreenshot")}
                className="size-10 shrink-0 rounded-lg border border-border/60 object-cover"
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
                  : (screenshot.file.name || copy("attachScreenshot"))}
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
            className="flex w-full items-end gap-2 rounded-2xl border bg-card/80 p-2 shadow-sm"
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
            disabled={!setupReady || sending || readingScreenshot || startingAnalysis}
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
                void submit();
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
              className="shrink-0 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={stop}
            >
              <Square className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              aria-label={workspace.copy("send")}
              disabled={!setupReady || !draft.trim() || startingAnalysis || readingScreenshot}
              className="shrink-0 rounded-xl shadow-sm"
              onClick={() => void submit()}
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
                "mt-1 text-end text-2xs tabular-nums",
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
        <p className="mx-auto mt-1.5 hidden w-full max-w-4xl flex-wrap items-center gap-x-3 gap-y-1 px-1 text-2xs text-muted-foreground md:flex">
          <span><kbd className="rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 font-sans">/</kbd> {copy("shortcutFocusComposer")}</span>
          <span><kbd className="rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 font-sans">Esc</kbd> {copy("shortcutStopStream")}</span>
          <span dir="ltr"><kbd className="rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 font-sans">Alt+↑↓</kbd> {copy("shortcutSwitchSessions")}</span>
          <span dir="ltr"><kbd className="rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 font-sans">Ctrl+↵</kbd> {copy("shortcutApproveFocused")}</span>
        </p>
      </div>

      {!wideReview ? (
        <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
          <SheetContent side="end" className="w-[min(440px,96vw)] p-0 sm:max-w-none">
            <SheetHeader className="sr-only">
              <SheetTitle>{getAiDecisionCopy(workspace.locale, "reviewEvidence")}</SheetTitle>
              <SheetDescription>
                {getAiDecisionCopy(workspace.locale, "reviewEvidenceDescription")}
              </SheetDescription>
            </SheetHeader>
            <AiReviewEvidence workspace={workspace} />
          </SheetContent>
        </Sheet>
      ) : null}
    </main>
  );
}
