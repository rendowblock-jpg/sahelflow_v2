"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react";

import { AiActionProposalCard } from "@/components/ai/ai-action-proposal-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";

export function AiReviewEvidence({
  workspace,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
}) {
  const {
    proposals,
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
          {proposals.length > 0 ? (
            <Badge variant="secondary" className="text-xs">
              {proposals.length}
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
                  <AiActionProposalCard
                    key={handle.proposal.id}
                    handle={handle}
                    approving={approvingProposalId === handle.proposal.id}
                    onApprove={approveProposal}
                    rejecting={rejectingProposalId === handle.proposal.id}
                    onReject={rejectProposal}
                  />
                ))}
              </div>
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
                  <Link href="/settings">
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
