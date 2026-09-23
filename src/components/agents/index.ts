/**
 * Agent UI barrel — SahelFlow's MCP-native agent surface.
 */

export { AgentWorkspace, type AgentWorkspaceState, type AgentWorkspaceProps } from "./agent-workspace";
export { AgentSidebar, type AgentSessionSummary } from "./agent-sidebar";
export { AgentEmptyState } from "./agent-empty-state";
export { AgentComposer } from "./agent-composer";
export { AgentMessageBubble, type AgentMessageView } from "./agent-message-bubble";
export { AgentToolCard, AgentToolBadge, type AgentToolCallView } from "./agent-tool-card";
export { AgentProposalCard, type AgentProposalView } from "./agent-proposal-card";
export { AgentDesignTokens, AGENT_DESIGN_TOKENS } from "./agent-design-system";
export { AgentCapabilitiesPanel, type AgentCapabilityGroup, type AgentCapabilityTool } from "./agent-capabilities-panel";
export { AgentErrorBoundary } from "./agent-error-boundary";
