"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ShieldCheck } from "lucide-react";

import { AiCanvasSessionMenu } from "@/components/ai/ai-canvas-session-menu";
import { AiComposerDeck } from "@/components/ai/ai-composer-deck";
import { AiMessageLog } from "@/components/ai/ai-message-log";
import {
  ErrorNotice,
  InboxStrip,
  SetupNotice,
} from "@/components/ai/ai-canvas-notices";
import { AiReviewEvidence } from "@/components/ai/ai-review-evidence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAiCanvasShortcuts } from "@/hooks/use-ai-canvas-shortcuts";
import { useAiWorkspace } from "@/hooks/use-ai-workspace";
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
  const {
    activeSession,
    messages,
    proposals,
    sending,
    setup,
    stop,
    inbox,
    inboxError,
    editingMessageId,
    cancelEditMessage,
    editAndResend,
  } = workspace;
  // STR-01: the composer deck is its own module now, but the draft stays
  // here — the deep-link prefill, edit-mode prefill and the follow-up chips
  // all write it, so a single owner above all three is the honest place.
  const [draft, setDraft] = useState(initialDraft);
  const [prevInitialDraft, setPrevInitialDraft] = useState(initialDraft);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [awayFromTail, setAwayFromTail] = useState(false);
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
  const editingMessage = editingMessageId
    ? messages.find(
        (message) => message.id === editingMessageId && message.role === "user",
      ) ?? null
    : null;

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

  // Ledger AI-22: the discoverable keyboard surface ("/", Escape, Alt+↑/↓,
  // Ctrl+Enter). STR-01 moved it into its own hook — it is window-level
  // behaviour rather than canvas markup — and the canvas still owns the
  // composer ref it focuses.
  useAiCanvasShortcuts({ workspace, composerRef });

  const lastSignalModel =
    [...messages].reverse().find((message) => message.signal?.model)?.signal
      ?.model ?? null;

  return (
    <main data-ai-decision-canvas="true" className="relative flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/70 px-3 md:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
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
          {workspace.setup ? (
            // Configuration truth (AI-26): consent + key state from the setup
            // probe — never a fabricated provider heartbeat. Below `sm` the dot
            // is the only indicator; above it the labelled chip takes over, so
            // one fact is stated once at every width.
            <>
              <span
                data-ai-status-dot={setupReady ? "ready" : "attention"}
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full sm:hidden"
              />
              <span className="sr-only sm:hidden">
                {setupReady
                  ? getAiDecisionCopy(workspace.locale, "providerReady")
                  : getAiDecisionCopy(workspace.locale, "setupAttention")}
              </span>
            </>
          ) : null}
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 dir="auto" className="truncate text-title-3">
                {activeSession?.title ||
                  (activeSession
                    ? workspace.copy("newSessionTitle")
                    : getAiDecisionCopy(workspace.locale, "newChat"))}
              </h2>
              {/* Ledger AI-01: seeded demo sessions are labelled honestly so
                  canned conversations are never mistaken for model output. */}
              {activeSession?.id.startsWith("demo-") ? (
                <Badge variant="secondary" className="shrink-0 text-caption font-medium">
                  {getAiDecisionCopy(workspace.locale, "demoBadge")}
                </Badge>
              ) : null}
            </div>
            <p className="truncate text-caption text-muted-foreground">
              {activeSession && messages.length > 0 ? (
                <>
                  {getAiDecisionCopy(workspace.locale, "messagesMeta", {
                    count: messages.length,
                  })}
                  {lastSignalModel ? (
                    <>
                      {" · "}
                      <span dir="ltr">{lastSignalModel}</span>
                    </>
                  ) : null}
                </>
              ) : (
                getAiDecisionCopy(workspace.locale, "agentRole")
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* The chip states the ready fact only; the setup notice below the
              header owns the "needs attention" explanation and its fix. */}
          {workspace.setup && setupReady ? (
            <span
              data-ai-config-chip="true"
              className="hidden items-center gap-1.5 rounded-full px-2 py-1 text-caption font-medium text-muted-foreground sm:inline-flex"
            >
              <span data-ai-status-dot="ready" aria-hidden="true" className="size-1.5 rounded-full" />
              {getAiDecisionCopy(workspace.locale, "providerReady")}
            </span>
          ) : null}
          {!wideReview ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-ai-open-review="true"
              aria-label={getAiDecisionCopy(workspace.locale, "reviewEvidence")}
              onClick={() => setReviewOpen(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              <span className="hidden md:inline">
                {getAiDecisionCopy(workspace.locale, "reviewEvidence")}
              </span>
              {reviewBadgeCount > 0 ? (
                <span className="rounded-full bg-warning-soft px-1.5 text-caption font-semibold tabular-nums text-warning">
                  {reviewBadgeCount}
                </span>
              ) : null}
            </Button>
          ) : null}
          {activeSession ? (
            <AiCanvasSessionMenu workspace={workspace} session={activeSession} />
          ) : null}
        </div>
      </header>

      {/* On an empty conversation the start surface carries the full setup
          checklist, so the one-line notice would only repeat it. */}
      {messages.length > 0 || workspace.loadingConversation || !setup ? (
        <SetupNotice workspace={workspace} />
      ) : null}
      <ErrorNotice workspace={workspace} />
      {/* Ledger F-06: pending agent work across ALL sessions, surfaced where
          the seller works — the approval loop is the page's main output. */}
      <InboxStrip
        workspace={workspace}
        wideReview={wideReview}
        onOpenReview={() => setReviewOpen(true)}
      />

      <div ref={scrollRootRef} className="relative min-h-0 flex-1">
        <AiMessageLog
          workspace={workspace}
          startingAnalysis={startingAnalysis}
          tailRef={tailRef}
          onStart={onStart}
          onOpenReview={() => setReviewOpen(true)}
          onPickSuggestion={(prompt) => {
            setDraft(prompt);
            composerRef.current?.focus();
          }}
        />
        {awayFromTail && messages.length > 0 ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
            <button
              type="button"
              onClick={() => {
                followTailRef.current = true;
                setAwayFromTail(false);
                tailRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
              }}
              aria-label={workspace.copy("scrollToLatest")}
              className="pointer-events-auto inline-flex size-9 items-center justify-center rounded-full border border-border bg-popover text-foreground shadow-(--elevation-2) outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowDown className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

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
