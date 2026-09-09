"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  Bot,
  ChevronUp,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import { AiActionProposalCard } from "@/components/ai/ai-action-proposal-card";
import { AiComposerDeck } from "@/components/ai/ai-composer-deck";
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
import { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { useI18n } from "@/hooks/use-i18n";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";

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
  // STR-01: the composer deck is its own module now, but the draft stays
  // here — the deep-link prefill, edit-mode prefill and the follow-up chips
  // all write it, so a single owner above all three is the honest place.
  const [draft, setDraft] = useState(initialDraft);
  const [prevInitialDraft, setPrevInitialDraft] = useState(initialDraft);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [awayFromTail, setAwayFromTail] = useState(false);
  // Ledger AI-14: dismissal is anchored to the conversation tail id — a new
  // turn naturally re-offers grounded suggestions.
  const [chipsDismissedFor, setChipsDismissedFor] = useState<string | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const tailRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const followTailRef = useRef(true);
  const setupReady = setup?.ready === true;
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

      <AiComposerDeck
        workspace={workspace}
        draft={draft}
        setDraft={setDraft}
        composerRef={composerRef}
        setupReady={setupReady}
        sending={sending}
        startingAnalysis={startingAnalysis}
        editing={editingMessage !== null}
        stop={stop}
        onCancelEdit={cancelEditMessage}
        onSubmit={submit}
      />

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
