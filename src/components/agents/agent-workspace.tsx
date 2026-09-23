"use client";

/**
 * Agent workspace — the main layout for SahelFlow's AI agent surface.
 *
 * Design: three-panel layout (sidebar | canvas | review panel) with glass
 * morphism, gradient accents, and smooth transitions. Responsive: sidebar
 * collapses on narrow widths, review panel opens as a sheet.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { AgentDesignTokens } from "./agent-design-system";
import { AgentComposer } from "./agent-composer";
import { AgentEmptyState } from "./agent-empty-state";
import {
  AgentMessageBubble,
  type AgentMessageView,
} from "./agent-message-bubble";
import { AgentProposalCard, type AgentProposalView } from "./agent-proposal-card";
import {
  AgentSidebar,
  type AgentSessionSummary,
} from "./agent-sidebar";
import { getAgentCopy, type AgentLocale } from "@/lib/i18n/agent-workspace";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentWorkspaceState {
  sessions: AgentSessionSummary[];
  activeSessionId: string | null;
  messages: AgentMessageView[];
  sending: boolean;
  proposals: AgentProposalView[];
}

export interface AgentWorkspaceProps {
  initialState: AgentWorkspaceState;
  onSendMessage: (message: string, sessionId: string | null) => Promise<void>;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onApproveProposal: (proposalId: string) => Promise<void>;
  onRejectProposal: (proposalId: string) => Promise<void>;
  initialPrompt?: string;
  locale?: AgentLocale;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AgentWorkspace({
  initialState,
  onSendMessage,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onApproveProposal,
  onRejectProposal,
  initialPrompt = "",
  locale = "en",
}: AgentWorkspaceProps) {
  const { t } = getAgentCopy(locale);
  const [state, setState] = useState(initialState);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [draft, setDraft] = useState(initialPrompt);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followTailRef = useRef(true);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (followTailRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.messages]);

  // Detect scroll position for "away from tail" indicator
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    followTailRef.current = scrollHeight - scrollTop - clientHeight < 80;
  }, []);

  const handleSend = useCallback(
    async (message: string) => {
      setState((s) => ({ ...s, sending: true }));
      followTailRef.current = true;
      try {
        await onSendMessage(message, state.activeSessionId);
      } finally {
        setState((s) => ({ ...s, sending: false }));
      }
    },
    [onSendMessage, state.activeSessionId],
  );

  const handleStart = useCallback(
    (prompt: string) => {
      setDraft(prompt);
    },
    [],
  );

  // Pending proposals count
  const pendingCount = state.proposals.filter((p) => p.status === "pending").length;

  return (
    <>
      <AgentDesignTokens />
      <div className="flex h-full bg-[var(--agent-surface-0)] text-[var(--agent-text-primary)]">
        {/* Sidebar */}
        <div
          className={`shrink-0 border-r border-[var(--agent-border)] transition-all duration-300 ${
            sidebarOpen ? "w-64" : "w-0 overflow-hidden border-r-0"
          }`}
        >
          <AgentSidebar
            sessions={state.sessions}
            activeSessionId={state.activeSessionId}
            onSelect={onSelectSession}
            onNew={onNewSession}
            onDelete={onDeleteSession}
          />
        </div>

        {/* Main canvas */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--agent-border)] bg-[var(--agent-surface-0)]/80 px-4 py-2.5 backdrop-blur">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="flex h-7 w-7 items-center justify-center rounded-[var(--agent-radius-sm)] text-[var(--agent-text-tertiary)] transition-colors hover:bg-[var(--agent-surface-2)] hover:text-[var(--agent-text-secondary)]"
                title={sidebarOpen ? t("closeSidebar") : t("openSidebar")}
              >
                {sidebarOpen ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4" />
                )}
              </button>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[var(--agent-text-accent)]" />
                <span className="text-sm font-semibold">{t("title")}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Review badge */}
              {pendingCount > 0 && (
                <button
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  className="flex items-center gap-1.5 rounded-full bg-[var(--agent-pending)]/15 px-3 py-1.5 text-xs font-medium text-[var(--agent-pending)] transition-colors hover:bg-[var(--agent-pending)]/25"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t("pendingCount", { count: pendingCount })}
                </button>
              )}
            </div>
          </div>

          {/* Message area */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="agent-scroll flex-1 overflow-y-auto"
          >
            {state.messages.length === 0 ? (
              <AgentEmptyState onStart={handleStart} locale={locale} />
            ) : (
              <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
                {state.messages.map((message) => (
                  <AgentMessageBubble
                    key={message.id}
                    message={message}
                    onApproveProposal={onApproveProposal}
                    onRejectProposal={onRejectProposal}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="shrink-0 px-4 pb-4 pt-2">
            <div className="mx-auto max-w-3xl">
              <AgentComposer
                onSend={handleSend}
                sending={state.sending}
                initialValue={draft}
                placeholder={t("placeholder")}
                locale={locale}
              />
            </div>
          </div>
        </div>

        {/* Review panel (right side) */}
        {pendingCount > 0 && (
          <div
            className={`shrink-0 border-l border-[var(--agent-border)] transition-all duration-300 ${
              reviewOpen ? "w-80" : "w-0 overflow-hidden border-l-0"
            }`}
          >
            <div className="flex h-full flex-col bg-[var(--agent-surface-1)]">
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--agent-border)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[var(--agent-pending)]" />
                  <span className="text-sm font-semibold">{t("pendingApprovals")}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewOpen(false)}
                  className="text-[var(--agent-text-tertiary)] hover:text-[var(--agent-text-secondary)]"
                >
                  ×
                </button>
              </div>
              <div className="agent-scroll flex-1 overflow-y-auto p-3">
                {state.proposals
                  .filter((p) => p.status === "pending")
                  .map((proposal) => (
                    <div key={proposal.proposalId} className="mb-3">
                      <AgentProposalCardInline
                        proposal={proposal}
                        onApprove={onApproveProposal}
                        onReject={onRejectProposal}
                      />
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Inline proposal card for the review panel ───────────────────────────────

function AgentProposalCardInline({
  proposal,
  onApprove,
  onReject,
}: {
  proposal: AgentProposalView;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}) {
  return (
    <AgentProposalCard
      proposal={proposal}
      onApprove={onApprove}
      onReject={onReject}
    />
  );
}
