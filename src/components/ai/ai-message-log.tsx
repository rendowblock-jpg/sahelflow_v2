"use client";

import { useMemo, useState, type RefObject } from "react";
import { ChevronUp, Loader2, RotateCcw, ShieldCheck } from "lucide-react";

import { AiActionProposalCard } from "@/components/ai/ai-action-proposal-card";
import {
  AiFollowUpChips,
  deriveFollowUpSuggestions,
} from "@/components/ai/ai-follow-up-chips";
import { MessageBubble } from "@/components/ai/ai-message-bubble";
import { STARTERS, StartSurface } from "@/components/ai/ai-start-surface";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { useI18n } from "@/hooks/use-i18n";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";

/**
 * STR-01 — the conversation log, extracted from ai-decision-canvas.tsx.
 *
 * This owns everything between the notices and the composer: the
 * structure-matching hydration skeleton, the empty-state start surface, the
 * load-earlier control, the message list, regenerate, the grounded follow-up
 * chips and the chronological (non-interactive) proposal objects.
 *
 * What deliberately stayed in the canvas: the scroll root, the follow-tail
 * refs and the away-from-tail pill. Those are canvas geometry, and the pill
 * lives outside the scroll region. `tailRef` is handed down so the tail
 * marker stays inside the log it measures.
 */
export function AiMessageLog({
  workspace,
  startingAnalysis,
  tailRef,
  onStart,
  onOpenReview,
  onPickSuggestion,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  startingAnalysis: boolean;
  tailRef: RefObject<HTMLDivElement | null>;
  onStart: (prompt: string) => Promise<boolean>;
  onOpenReview: () => void;
  /** Writes the canvas-owned draft and returns focus to the composer. */
  onPickSuggestion: (prompt: string) => void;
}) {
  const { t } = useI18n();
  const {
    messages,
    proposals,
    loadingConversation,
    sending,
    copy,
    canRegenerate,
    regenerate,
    historyCapped,
    loadingOlderMessages,
    loadOlderMessages,
    editingMessageId,
    beginEditMessage,
    sendFeedback,
  } = workspace;
  // Ledger AI-14: dismissal is anchored to the conversation tail id — a new
  // turn naturally re-offers grounded suggestions.
  const [chipsDismissedFor, setChipsDismissedFor] = useState<string | null>(null);
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1]!.id : null;
  const followUpSuggestions = useMemo(
    () =>
      sending || editingMessageId
        ? []
        : deriveFollowUpSuggestions(messages, copy),
    [copy, editingMessageId, messages, sending],
  );

  // Ledger AI-14: a new turn re-offers suggestions after an explicit dismissal.
  const [prevTailForChips, setPrevTailForChips] = useState<string | null>(null);
  if (lastMessageId !== prevTailForChips) {
    setPrevTailForChips(lastMessageId);
    if (chipsDismissedFor !== null && chipsDismissedFor !== lastMessageId) {
      setChipsDismissedFor(null);
    }
  }

  return (
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
                onPick={onPickSuggestion}
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
                    onClick={onOpenReview}
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
  );
}
