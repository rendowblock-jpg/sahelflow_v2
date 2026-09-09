"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  Bot,
  ChevronRight,
  ChevronUp,
  Loader2,
  Paperclip,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";

import { AiActionProposalCard } from "@/components/ai/ai-action-proposal-card";
import {
  AiFollowUpChips,
  deriveFollowUpSuggestions,
} from "@/components/ai/ai-follow-up-chips";
import { MessageBubble } from "@/components/ai/ai-message-bubble";
import {
  ErrorNotice,
  InboxStrip,
  STARTERS,
  SetupNotice,
  StartSurface,
} from "@/components/ai/ai-start-surface";
import { AiReviewEvidence } from "@/components/ai/ai-review-evidence";
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
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";
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
    <main data-ai-decision-canvas="true" className="relative flex h-full min-h-0 flex-col bg-gradient-to-b from-muted/[0.28] via-background to-background">
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border/70 bg-card/70 px-4 backdrop-blur-sm md:px-6">
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
          <span className="relative flex size-9 shrink-0 items-center justify-center rounded-surface border border-primary/15 bg-gradient-to-b from-primary-strong to-primary-subtle text-primary shadow-sm">
            <Bot className="size-4" aria-hidden="true" />
            {workspace.setup ? (
              // Configuration truth on the avatar (AI-26): consent+key state
              // from the setup probe — never a fabricated provider heartbeat.
              //
              // UI-04: this dot and the labelled config chip in the same header
              // are bound to the same `setupReady`, so above `sm` the screen
              // stated one fact twice — once in words, once as an unlabelled
              // dot forty pixels away. The chip is `hidden sm:inline-flex`, so
              // the dot is scoped to the width where the chip is absent: one
              // indicator at every viewport, and never zero.
              <>
                <span
                  data-ai-status-dot={setupReady ? "ready" : "attention"}
                  aria-hidden="true"
                  className="absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full border-2 border-background sm:hidden"
                />
                {/* Below `sm` the dot is the only provider signal, and a bare
                    colour is not a signal to assistive tech. */}
                <span className="sr-only sm:hidden">
                  {setupReady
                    ? getAiDecisionCopy(workspace.locale, "providerReady")
                    : getAiDecisionCopy(workspace.locale, "setupAttention")}
                </span>
              </>
            ) : null}
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-sm font-bold tracking-tight">
                {activeSession?.title || workspace.copy("newSessionTitle")}
              </h2>
              {/* Ledger AI-01: seeded demo sessions are labelled honestly so
                  canned conversations are never mistaken for model output. */}
              {activeSession?.id.startsWith("demo-") ? (
                <Badge
                  variant="secondary"
                  className="shrink-0 text-caption font-medium"
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
              className="hidden items-center gap-1.5 text-caption font-medium text-muted-foreground sm:inline-flex"
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
                <Badge variant="secondary" className="ms-1 rounded-full px-2 text-caption tabular-nums">
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
                  <span data-ai-skeleton="true" className="mt-0.5 size-8 shrink-0 rounded-surface" />
                  <div className="w-full max-w-3xl space-y-2.5">
                    <span data-ai-skeleton="true" className="block h-3 w-24 rounded-full" />
                    <span data-ai-skeleton="true" className="block h-3.5 w-11/12 rounded-control" />
                    <span data-ai-skeleton="true" className="block h-3.5 w-4/5 rounded-control" />
                    <span data-ai-skeleton="true" className="block h-3.5 w-2/5 rounded-control" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <span data-ai-skeleton="true" className="block h-11 w-2/5 rounded-surface rounded-ee-control" />
                </div>
                <div className="flex gap-3">
                  <span data-ai-skeleton="true" className="mt-0.5 size-8 shrink-0 rounded-surface" />
                  <div className="w-full max-w-3xl space-y-2.5">
                    <span data-ai-skeleton="true" className="block h-3 w-24 rounded-full" />
                    <span data-ai-skeleton="true" className="block h-3.5 w-3/4 rounded-control" />
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

                {/* Ledger AI-14: grounded-control follow-up affordances under the last
                    completed answer; anchored dismissal resets on a new turn.
                    When the turn produced no grounded-control chips, fall back to two
                    shop job prompts so the thread never ends dead. */}
                {!sending && !editingMessageId && lastMessageId ? (
                  <AiFollowUpChips
                    suggestions={
                      followUpSuggestions.length > 0
                        ? followUpSuggestions
                        : [workspace.copy(STARTERS[0].prompt), workspace.copy(STARTERS[1].prompt)]
                    }
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
                    className="ms-11 max-w-3xl rounded-surface border border-primary/25 bg-primary-subtle p-4"
                    aria-labelledby="ai-proposed-changes-title"
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 id="ai-proposed-changes-title" className="text-sm font-bold tracking-tight">
                          {getAiDecisionCopy(workspace.locale, "proposedChanges")}
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {getAiDecisionCopy(workspace.locale, "proposedChangesDescription")}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => setReviewOpen(true)}
                      >
                        <ShieldCheck className="size-3.5" aria-hidden="true" />
                        {getAiDecisionCopy(workspace.locale, "inboxStripOpen")}
                        {proposals.length > 0 ? ` · ${proposals.length}` : ""}
                      </Button>
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
        className="border-t border-border/70 bg-card/50 px-4 py-3 backdrop-blur-sm md:px-6 md:py-4"
      >
        {editingMessage ? (
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
            className="flex w-full items-end gap-2 rounded-surface border border-border/70 bg-card p-2 shadow-[0_1px_2px_oklch(0_0_0/0.05),0_12px_32px_oklch(0_0_0/0.07)] focus-within:border-primary/40"
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
              className="shrink-0 rounded-surface border-destructive/30 text-destructive hover:bg-destructive-soft hover:text-destructive"
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
              className="shrink-0 rounded-surface shadow-sm"
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
            <span><kbd className="rounded-control border border-border/60 bg-muted/50 px-1.5 py-0.5 font-sans">/</kbd> {copy("shortcutFocusComposer")}</span>
            <span><kbd className="rounded-control border border-border/60 bg-muted/50 px-1.5 py-0.5 font-sans">Esc</kbd> {copy("shortcutStopStream")}</span>
            <span dir="ltr"><kbd className="rounded-control border border-border/60 bg-muted/50 px-1.5 py-0.5 font-sans">Alt+↑↓</kbd> {copy("shortcutSwitchSessions")}</span>
            <span dir="ltr"><kbd className="rounded-control border border-border/60 bg-muted/50 px-1.5 py-0.5 font-sans">Ctrl+↵</kbd> {copy("shortcutApproveFocused")}</span>
          </p>
        </details>
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
