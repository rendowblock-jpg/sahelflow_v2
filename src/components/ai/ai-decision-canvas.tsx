"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ShieldCheck, SquarePen } from "lucide-react";

import {
  AiCanvasSessionMenu,
  AiTitleRenameField,
} from "@/components/ai/ai-canvas-session-menu";
import { AiComposerDeck } from "@/components/ai/ai-composer-deck";
import { AiMessageLog } from "@/components/ai/ai-message-log";
import { buildAiQuickJobs } from "@/components/ai/ai-quick-jobs";
import {
  ErrorNotice,
  InboxStrip,
  SetupNotice,
} from "@/components/ai/ai-canvas-notices";
import { AiReviewEvidence } from "@/components/ai/ai-review-evidence";
import { StartSurface } from "@/components/ai/ai-start-surface";
import type { AiOutgoingImage } from "@/components/ai/ai-workspace-types";
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
import { useAiCanvasShortcuts } from "@/hooks/use-ai-canvas-shortcuts";
import { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";
import { toast } from "@/lib/toast";

/**
 * The Agents canvas. A new chat is a home — greeting, the composer in the
 * middle of the page, the shop's live numbers and the seller jobs. A
 * conversation is a centered reading column with the composer docked under
 * it. The header carries the conversation's name (renamed in place), the
 * approvals entry and one menu for everything else.
 */
export function AiDecisionCanvas({
  workspace,
  wideReview,
  mobile,
  startingAnalysis,
  initialDraft = "",
  reviewOpen,
  onReviewOpenChange,
  onBack,
  onNewChat,
  onSend,
  onStart,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  wideReview: boolean;
  mobile: boolean;
  startingAnalysis: boolean;
  /** Composer prefill from a /agents?q= deep link (record-surface "Ask AI"). */
  initialDraft?: string;
  reviewOpen: boolean;
  onReviewOpenChange: (open: boolean) => void;
  onBack: () => void;
  onNewChat: () => void;
  onSend: (message: string, images?: AiOutgoingImage[]) => Promise<boolean>;
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
    composingNewChat,
    loadingConversation,
    locale,
  } = workspace;
  // STR-01: the draft stays here — the deep-link prefill, edit-mode prefill,
  // follow-up chips and quick jobs all write it, so a single owner above all
  // of them is the honest place.
  const [draft, setDraft] = useState(initialDraft);
  const [prevInitialDraft, setPrevInitialDraft] = useState(initialDraft);
  const [awayFromTail, setAwayFromTail] = useState(false);
  const [renamingTitle, setRenamingTitle] = useState<string | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const tailRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const followTailRef = useRef(true);
  const setupReady = setup?.ready === true;
  const quickJobs = useMemo(() => buildAiQuickJobs(workspace), [workspace]);
  const home =
    composingNewChat ||
    !activeSession ||
    (!loadingConversation && messages.length === 0 && !sending);
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
    if (home) return;
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
  }, [activeSession?.id, home]);

  useEffect(() => {
    followTailRef.current = true;
    tailRef.current?.scrollIntoView({ block: "end" });
  }, [activeSession?.id, home]);

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

  const submit = async (images: AiOutgoingImage[] = []) => {
    const value = draft.trim();
    if ((!value && images.length === 0) || sending || !setupReady || startingAnalysis) {
      return false;
    }
    if (editingMessageId) {
      // Ledger AI-15: an edited send truncates the durable tail, then re-sends
      // (the edited turn keeps its stored images).
      const accepted = await editAndResend(editingMessageId, value);
      if (accepted) setDraft("");
      return accepted;
    }
    setDraft("");
    const accepted = await onSend(value, images);
    if (!accepted) setDraft((current) => current || value);
    return accepted;
  };

  const saveTitle = async () => {
    if (!activeSession || renamingTitle === null) return;
    const value = renamingTitle.trim();
    setRenamingTitle(null);
    if (!value || value === activeSession.title) return;
    const ok = await workspace.renameSession(activeSession.id, value);
    if (!ok) toast.error(workspace.copy("genericError"));
  };

  // Ledger AI-22: the discoverable keyboard surface ("/", Escape, Alt+↑/↓,
  // Ctrl+Enter). The canvas owns the composer ref it focuses.
  useAiCanvasShortcuts({ workspace, composerRef });

  const composer = (variant: "hero" | "docked") => (
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
      quickJobs={quickJobs}
      variant={variant}
    />
  );

  const title = home
    ? getAiDecisionCopy(locale, "newChat")
    : activeSession?.title || workspace.copy("newSessionTitle");

  return (
    <main
      data-ai-decision-canvas="true"
      data-ai-canvas-mode={home ? "home" : "conversation"}
      className="relative flex h-full min-h-0 flex-col bg-background"
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-3 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
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
          {renamingTitle !== null && activeSession ? (
            <AiTitleRenameField
              value={renamingTitle}
              label={getAiDecisionCopy(locale, "renameAction")}
              onChange={setRenamingTitle}
              onSave={() => void saveTitle()}
              onCancel={() => setRenamingTitle(null)}
            />
          ) : (
            <div className="flex min-w-0 items-center gap-2 px-1">
              <h2
                dir="auto"
                className={
                  home
                    ? "truncate text-body-sm font-medium text-muted-foreground"
                    : "truncate text-body font-semibold"
                }
              >
                {title}
              </h2>
              {/* Ledger AI-01: seeded demo sessions are labelled honestly so
                  canned conversations are never mistaken for model output. */}
              {!home && activeSession?.id.startsWith("demo-") ? (
                <Badge variant="secondary" className="shrink-0 text-caption font-medium">
                  {getAiDecisionCopy(locale, "demoBadge")}
                </Badge>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!wideReview ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-ai-open-review="true"
              aria-label={getAiDecisionCopy(locale, "reviewEvidence")}
              onClick={() => onReviewOpenChange(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              <span className="hidden md:inline">
                {getAiDecisionCopy(locale, "reviewEvidence")}
              </span>
              {reviewBadgeCount > 0 ? (
                <span className="rounded-full bg-warning-soft px-1.5 text-caption font-semibold tabular-nums text-warning">
                  {reviewBadgeCount}
                </span>
              ) : null}
            </Button>
          ) : null}
          {mobile && !home ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={getAiDecisionCopy(locale, "newChat")}
              onClick={onNewChat}
              className="text-muted-foreground hover:text-foreground"
            >
              <SquarePen className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
          {!home && activeSession ? (
            <AiCanvasSessionMenu
              workspace={workspace}
              session={activeSession}
              onRename={() => setRenamingTitle(activeSession.title ?? "")}
            />
          ) : null}
        </div>
      </header>

      {!home ? <SetupNotice workspace={workspace} /> : null}
      <ErrorNotice workspace={workspace} />
      {/* Ledger F-06: pending agent work across ALL sessions, surfaced where
          the seller works — the approval loop is the page's main output. */}
      {!home ? (
        <InboxStrip
          workspace={workspace}
          wideReview={wideReview}
          onOpenReview={() => onReviewOpenChange(true)}
        />
      ) : null}

      {home ? (
        <ScrollArea className="min-h-0 flex-1">
          <StartSurface
            workspace={workspace}
            starting={startingAnalysis || sending}
            quickJobs={quickJobs}
            composer={composer("hero")}
            onStart={onStart}
          />
        </ScrollArea>
      ) : (
        <>
          <div ref={scrollRootRef} className="relative min-h-0 flex-1">
            <AiMessageLog
              workspace={workspace}
              tailRef={tailRef}
              onOpenReview={() => onReviewOpenChange(true)}
              onPickSuggestion={(prompt) => {
                setDraft(prompt);
                composerRef.current?.focus();
              }}
            />
            {awayFromTail && messages.length > 0 ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
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
          {composer("docked")}
        </>
      )}

      {!wideReview ? (
        <Sheet open={reviewOpen} onOpenChange={onReviewOpenChange}>
          <SheetContent side="end" className="w-full p-0 sm:max-w-md">
            <SheetHeader className="sr-only">
              <SheetTitle>{getAiDecisionCopy(locale, "reviewEvidence")}</SheetTitle>
              <SheetDescription>
                {getAiDecisionCopy(locale, "reviewEvidenceDescription")}
              </SheetDescription>
            </SheetHeader>
            <AiReviewEvidence workspace={workspace} />
          </SheetContent>
        </Sheet>
      ) : null}
    </main>
  );
}
