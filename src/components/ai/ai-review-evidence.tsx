"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Inbox,
  KeyRound,
  Loader2,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react";

import { AiActionProposalCard } from "@/components/ai/ai-action-proposal-card";
import { TechnicalValue } from "@/components/i18n/technical-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";
import { getAiToolLabel } from "@/lib/i18n/ai-tool-labels";

function decisionClock(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB",
    { dateStyle: "short", timeStyle: "short" },
  ).format(date);
}

/**
 * Ledger AI-20: the review surface shows REAL state only — session-scoped
 * proposals, the shop-wide cross-session pending inbox (AI-19), and the
 * recent approve/deny/execution timeline derived from proposal rows. Slices
 * with no data render truthful empty states, never placeholders.
 */
export function AiReviewEvidence({
  workspace,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
}) {
  const {
    proposals,
    inbox,
    inboxDecisions,
    inboxLoading,
    inboxError,
    refreshInbox,
    actionHistoryError,
    setup,
    setupError,
    approvingProposalId,
    approveProposal,
    rejectingProposalId,
    rejectProposal,
    retry,
    locale,
  } = workspace;
  const setupReady = setup?.ready === true;

  // The session-scoped list already renders the current session's proposals;
  // the cross-session inbox adds every OTHER still-approvable proposal.
  const elsewhere = inbox.filter(
    (entry) => !proposals.some((p) => p.proposal.id === entry.proposal.id),
  );

  return (
    <aside
      data-ai-review-evidence="true"
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <div className="border-b px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">
              {getAiDecisionCopy(locale, "reviewEvidence")}
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {getAiDecisionCopy(locale, "reviewEvidenceDescription")}
            </p>
          </div>
          {proposals.length + elsewhere.length > 0 ? (
            <Badge variant="secondary" className="text-xs">
              {proposals.length + elsewhere.length}
            </Badge>
          ) : null}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          <section aria-labelledby="ai-review-actions-title">
            <div className="mb-2">
              <h3 id="ai-review-actions-title" className="text-sm font-semibold">
                {workspace.copy("actions")}
              </h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {getAiDecisionCopy(locale, "proposedChangesDescription")}
              </p>
            </div>

            {actionHistoryError ? (
              <div className="rounded-xl border border-warning/25 bg-warning/5 p-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-warning"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {getAiDecisionCopy(locale, "actionHistoryIssue")}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {getAiDecisionCopy(locale, "actionHistoryIssueDescription")}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={() => void retry()}
                    >
                      <RefreshCw className="size-4" aria-hidden="true" />
                      {workspace.copy("retry")}
                    </Button>
                  </div>
                </div>
              </div>
            ) : proposals.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-center">
                <CheckCircle2
                  className="mx-auto size-5 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="mt-2 text-sm font-semibold">
                  {getAiDecisionCopy(locale, "noReviewItems")}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {getAiDecisionCopy(locale, "noReviewItemsDescription")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {proposals.map((handle) => (
                  <div
                    key={handle.proposal.id}
                    data-ai-proposal-id={handle.proposal.id}
                  >
                    <AiActionProposalCard
                      handle={handle}
                      approving={approvingProposalId === handle.proposal.id}
                      onApprove={approveProposal}
                      rejecting={rejectingProposalId === handle.proposal.id}
                      onReject={rejectProposal}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section
            className="border-t pt-4"
            aria-labelledby="ai-review-elsewhere-title"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Inbox className="size-4 text-primary" aria-hidden="true" />
                <h3
                  id="ai-review-elsewhere-title"
                  className="text-sm font-semibold"
                >
                  {workspace.copy("pendingElsewhere")}
                </h3>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={workspace.copy("retry")}
                disabled={inboxLoading}
                onClick={() => void refreshInbox()}
              >
                {inboxLoading ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                )}
              </Button>
            </div>
            <p className="mb-3 text-xs leading-5 text-muted-foreground">
              {workspace.copy("pendingElsewhereDescription")}
            </p>

            {inboxError ? (
              <div className="rounded-xl border border-warning/25 bg-warning/5 p-3">
                <p className="text-sm font-semibold">
                  {workspace.copy("crossSessionUnavailable")}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => void refreshInbox()}
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  {workspace.copy("retry")}
                </Button>
              </div>
            ) : elsewhere.length === 0 ? (
              <p className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">
                {inboxLoading
                  ? getAiDecisionCopy(locale, "setupChecking")
                  : getAiDecisionCopy(locale, "noReviewItemsDescription")}
              </p>
            ) : (
              <div className="space-y-3">
                {elsewhere.map((entry) => (
                  <div
                    key={entry.proposal.id}
                    data-ai-proposal-id={entry.proposal.id}
                  >
                    <AiActionProposalCard
                      handle={entry}
                      approving={approvingProposalId === entry.proposal.id}
                      onApprove={approveProposal}
                      rejecting={rejectingProposalId === entry.proposal.id}
                      onReject={rejectProposal}
                    />
                    <p className="mt-1 flex items-center gap-1.5 px-1 text-2xs text-muted-foreground">
                      <Clock3 className="size-3" aria-hidden="true" />
                      <span className="truncate">
                        {entry.sessionTitle ||
                          `${workspace.copy("sessionLabel")} · ${entry.sessionId.slice(-6)}`}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section
            className="border-t pt-4"
            aria-labelledby="ai-review-decisions-title"
          >
            <div className="mb-2">
              <h3
                id="ai-review-decisions-title"
                className="text-sm font-semibold"
              >
                {workspace.copy("recentDecisions")}
              </h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {workspace.copy("recentDecisionsDescription")}
              </p>
            </div>

            {inboxDecisions.length === 0 ? (
              <p className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">
                {workspace.copy("noRecentDecisions")}
              </p>
            ) : (
              <ol className="space-y-1.5">
                {inboxDecisions.map((decision) => {
                  const settled =
                    decision.status === "succeeded" ||
                    decision.status === "approved";
                  const denied =
                    decision.status === "rejected" ||
                    decision.status === "expired" ||
                    decision.status === "conflict";
                  return (
                    <li
                      key={decision.id}
                      className="flex items-start gap-2.5 rounded-lg border bg-card/60 px-3 py-2"
                    >
                      {settled ? (
                        <CheckCircle2
                          className="mt-0.5 size-3.5 shrink-0 text-success"
                          aria-hidden="true"
                        />
                      ) : denied ? (
                        <AlertTriangle
                          className="mt-0.5 size-3.5 shrink-0 text-warning"
                          aria-hidden="true"
                        />
                      ) : (
                        <Loader2
                          className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-medium">
                            {getAiToolLabel(locale, decision.toolName)}
                          </span>
                          <TechnicalValue>
                            {decision.status}
                          </TechnicalValue>
                        </p>
                        <p className="mt-0.5 truncate text-2xs text-muted-foreground">
                          {[
                            decisionClock(decision.decidedAt, locale),
                            decision.sessionTitle ||
                              `${workspace.copy("sessionLabel")} · ${decision.sessionId.slice(-6)}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="border-t pt-4" aria-labelledby="ai-provider-title">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BrainCircuit className="size-4 text-primary" aria-hidden="true" />
                <h3 id="ai-provider-title" className="text-sm font-semibold">
                  {getAiDecisionCopy(locale, "providerPrivacy")}
                </h3>
              </div>
              {setupReady ? (
                <Badge variant="outline" className="text-xs">
                  {getAiDecisionCopy(locale, "providerReady")}
                </Badge>
              ) : null}
            </div>

            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <ShieldCheck className="size-3.5" aria-hidden="true" />
                  {workspace.copy("consent")}
                </dt>
                <dd className="font-medium">
                  {setup
                    ? setup.consentAccepted
                      ? workspace.copy("accepted")
                      : workspace.copy("missing")
                    : workspace.copy("unknown")}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <KeyRound className="size-3.5" aria-hidden="true" />
                  {workspace.copy("gemini")}
                </dt>
                <dd className="font-medium">
                  {setup
                    ? setup.keyConfigured
                      ? workspace.copy("configured")
                      : workspace.copy("notConfigured")
                    : workspace.copy("unknown")}
                </dd>
              </div>
            </dl>

            {setupError || !setupReady ? (
              <div className="mt-3 rounded-lg bg-muted/45 px-3 py-2.5">
                <p className="text-xs leading-5 text-muted-foreground">
                  {setupError
                    ? workspace.copy("setupUnavailableDescription")
                    : getAiDecisionCopy(locale, "savedHistoryAvailable")}
                </p>
                <Button asChild variant="ghost" size="sm" className="mt-1 px-0">
                  <Link href="/settings?group=intelligence">
                    <Settings2 className="size-4" aria-hidden="true" />
                    {workspace.copy("openSettings")}
                  </Link>
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
}
