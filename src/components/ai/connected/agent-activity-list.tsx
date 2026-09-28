"use client";

import { ArrowUpRight } from "lucide-react";

import type { AgentInvocation } from "@/hooks/use-connected-agents";
import {
  getConnectedAgentsCopy,
  type ConnectedAgentsCopyKey,
  type ConnectedAgentsLocale,
} from "@/lib/i18n/connected-agents";
import { getAiToolLabel } from "@/lib/i18n/ai-tool-labels";
import { cn, formatRelative } from "@/lib/utils";

const FAILED = { key: "outcomeFailed", tone: "bg-destructive-subtle text-destructive" } as const;

const OUTCOME: Record<string, { key: ConnectedAgentsCopyKey; tone: string }> = {
  succeeded: { key: "outcomeSucceeded", tone: "bg-success-subtle text-success" },
  proposed: { key: "outcomeProposed", tone: "bg-warning-subtle text-warning" },
  failed: FAILED,
  denied: { key: "outcomeDenied", tone: "bg-destructive-subtle text-destructive" },
  rate_limited: { key: "outcomeRateLimited", tone: "bg-muted text-muted-foreground" },
};

/** The MCP transcript session a sensitive call's proposal is bound to. */
export function transcriptSessionFor(invocation: AgentInvocation): string | null {
  if (!invocation.agentActor.startsWith("agent:")) return null;
  return `mcp_${invocation.agentActor.slice("agent:".length)}`;
}

export function AgentActivityList({
  invocations,
  agentNames,
  locale,
  onOpenReview,
}: {
  invocations: AgentInvocation[];
  agentNames: ReadonlyMap<string, string>;
  locale: ConnectedAgentsLocale;
  onOpenReview: (sessionId: string) => void;
}) {
  const copy = (key: ConnectedAgentsCopyKey, params?: Record<string, string | number>) =>
    getConnectedAgentsCopy(locale, key, params);

  if (invocations.length === 0) {
    return (
      <p className="px-4 py-6 text-body-sm text-muted-foreground">{copy("emptyActivity")}</p>
    );
  }

  return (
    <ol className="divide-y divide-border/70" data-agent-activity="true">
      {invocations.map((invocation) => {
        const outcome = OUTCOME[invocation.outcome] ?? FAILED;
        const agent =
          (invocation.grantId && agentNames.get(invocation.grantId)) || copy("unknownAgent");
        const reviewSession =
          invocation.outcome === "proposed" ? transcriptSessionFor(invocation) : null;
        return (
          <li
            key={invocation.id}
            className="flex min-w-0 items-center gap-3 px-4 py-3"
            data-agent-outcome={invocation.outcome}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-medium text-foreground">
                {getAiToolLabel(locale, invocation.toolName)}
              </p>
              <p className="flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
                <bdi dir="auto" className="truncate">
                  {agent}
                </bdi>
                <span aria-hidden="true">·</span>
                <time dateTime={invocation.createdAt} className="shrink-0">
                  {formatRelative(invocation.createdAt, locale)}
                </time>
                {invocation.durationMs !== null ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span dir="ltr" className="shrink-0 tabular-nums">
                      {copy("durationMs", { ms: invocation.durationMs })}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-caption font-medium",
                outcome.tone,
              )}
            >
              {copy(outcome.key)}
            </span>
            {reviewSession ? (
              <button
                type="button"
                onClick={() => onOpenReview(reviewSession)}
                className="inline-flex shrink-0 items-center gap-1 rounded-control px-2 py-1 text-caption font-medium text-primary outline-none transition-colors hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copy("openReview")}
                <ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
              </button>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
