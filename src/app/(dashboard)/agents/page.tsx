"use client";

/**
 * Agents page — the MCP-native agent workspace entry point.
 *
 * Replaces the legacy AI decision canvas with a modern, MCP-powered agent
 * surface. Tool-first architecture, proposal-bound safety, premium UI.
 */

import { AgentWorkspace } from "@/components/agents/agent-workspace";
import { AgentErrorBoundary } from "@/components/agents/agent-error-boundary";
import { useAgentWorkspace } from "@/hooks/use-agent-workspace";
import { useI18n } from "@/hooks/use-i18n";

export default function AgentsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const workspace = useAgentWorkspace(searchParams?.q ?? "");
  const { locale } = useI18n();

  return (
    <AgentErrorBoundary>
      <AgentWorkspace
        initialState={{
          sessions: workspace.sessions,
          activeSessionId: workspace.activeSessionId,
          messages: workspace.messages,
          sending: workspace.sending,
          proposals: workspace.proposals,
        }}
        onSendMessage={workspace.sendMessage}
        onSelectSession={workspace.selectSession}
        onNewSession={workspace.newSession}
        onDeleteSession={workspace.deleteSession}
        onApproveProposal={workspace.approveProposal}
        onRejectProposal={workspace.rejectProposal}
        initialPrompt={workspace.initialPrompt}
        locale={locale}
      />
    </AgentErrorBoundary>
  );
}
