"use client";

/**
 * Agent tool call card — visualizes tool execution with status, timing,
 * expandable arguments and results. Premium dark UI with status indicators.
 */

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  Lock,
  ShieldAlert,
  Wrench,
  XCircle,
} from "lucide-react";

import { getAgentCopy, type AgentLocale } from "@/lib/i18n/agent-workspace";
import type { McpToolResult } from "@/lib/mcp/types";

export interface AgentToolCallView {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: McpToolResult;
  state: "running" | "complete" | "failed" | "proposal";
  durationMs?: number;
}

export function AgentToolCard({ call, locale = "en" }: { call: AgentToolCallView; locale?: AgentLocale }) {
  const { t } = getAgentCopy(locale);
  const [expanded, setExpanded] = useState(false);

  const statusIcon = {
    running: <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--agent-info)]" />,
    complete: <CheckCircle2 className="h-3.5 w-3.5 text-[var(--agent-success)]" />,
    failed: <XCircle className="h-3.5 w-3.5 text-[var(--agent-error)]" />,
    proposal: <ShieldAlert className="h-3.5 w-3.5 text-[var(--agent-pending)]" />,
  }[call.state];

  const statusLabel = {
    running: t("running"),
    complete: t("done"),
    failed: t("failed"),
    proposal: t("awaitingApproval"),
  }[call.state];

  const borderColor = {
    running: "border-[var(--agent-info)]/30",
    complete: "border-[var(--agent-success)]/20",
    failed: "border-[var(--agent-error)]/30",
    proposal: "border-[var(--agent-pending)]/30",
  }[call.state];

  return (
    <div
      className={`agent-fade-in overflow-hidden rounded-[var(--agent-radius-md)] border ${borderColor} bg-[var(--agent-surface-2)] transition-colors`}
    >
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--agent-surface-3)]"
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--agent-radius-sm)] bg-[var(--agent-surface-4)]">
          <Wrench className="h-3 w-3 text-[var(--agent-text-tertiary)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-xs font-medium text-[var(--agent-text-primary)]">
              {call.name}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[10px] text-[var(--agent-text-tertiary)]">
              {statusIcon}
              {statusLabel}
            </span>
          </div>
          {call.durationMs != null && call.state !== "running" && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--agent-text-tertiary)]">
              <Clock className="h-2.5 w-2.5" />
              {call.durationMs < 1000
                ? `${call.durationMs}ms`
                : `${(call.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--agent-text-tertiary)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--agent-text-tertiary)]" />
        )}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="agent-fade-in space-y-2 border-t border-[var(--agent-border)] px-3 py-2.5">
          {/* Arguments */}
          {Object.keys(call.args).length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--agent-text-tertiary)]">
                Arguments
              </div>
              <pre className="overflow-x-auto rounded-[var(--agent-radius-sm)] bg-[var(--agent-surface-1)] p-2 text-[11px] leading-relaxed text-[var(--agent-text-secondary)]">
                {JSON.stringify(call.args, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
          {call.result && (
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--agent-text-tertiary)]">
                Result
              </div>
              <pre className="overflow-x-auto rounded-[var(--agent-radius-sm)] bg-[var(--agent-surface-1)] p-2 text-[11px] leading-relaxed text-[var(--agent-text-secondary)]">
                {call.result.text}
              </pre>
            </div>
          )}

          {/* Running state */}
          {call.state === "running" && (
            <div className="flex items-center gap-2 py-1">
              <div className="agent-shimmer h-2 w-32 rounded-full" />
              <div className="agent-shimmer h-2 w-16 rounded-full" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline tool badge for collapsed display in message flow.
 */
export function AgentToolBadge({ call }: { call: AgentToolCallView }) {
  const icon = {
    running: <Loader2 className="h-3 w-3 animate-spin" />,
    complete: <CheckCircle2 className="h-3 w-3" />,
    failed: <XCircle className="h-3 w-3" />,
    proposal: <ShieldAlert className="h-3 w-3" />,
  }[call.state];

  const color = {
    running: "text-[var(--agent-info)] bg-[var(--agent-info)]/10",
    complete: "text-[var(--agent-success)] bg-[var(--agent-success)]/10",
    failed: "text-[var(--agent-error)] bg-[var(--agent-error)]/10",
    proposal: "text-[var(--agent-pending)] bg-[var(--agent-pending)]/10",
  }[call.state];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${color}`}
    >
      {icon}
      <span className="font-mono">{call.name}</span>
    </span>
  );
}
