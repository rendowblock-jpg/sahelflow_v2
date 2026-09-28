/**
 * Connected agents surface (FD-063, MCP-13).
 *
 * Pins the product decisions behind the control surface for external MCP
 * agents: where it lives, what it may show and where approval happens.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getConnectedAgentsCopy } from "@/lib/i18n/connected-agents";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Connected agents surface", () => {
  it("opens from a pinned rail entry, not a tab band above the workspace", () => {
    const workspace = read("src/components/ai/ai-decision-workspace.tsx");
    expect(workspace).toContain("<ConnectedAgentsRailEntry");
    expect(workspace).toContain("footer={railFooter}");
    expect(workspace.match(/<ConnectedAgentsSurface/g)).toHaveLength(2);
    // The review column never sits beside the control surface.
    expect(workspace).toContain("!showConnected && wideViewport && aiReviewHasWork(workspace)");
  });

  it("is not offered to people without integrations authority", () => {
    const workspace = read("src/components/ai/ai-decision-workspace.tsx");
    const hook = read("src/hooks/use-connected-agents.ts");
    expect(workspace).toContain("const connectedOffered = !agents.forbidden;");
    expect(hook).toContain("error.status === 401 || error.status === 403");
    // Activity polls only while the surface is open.
    expect(workspace).toContain('useConnectedAgents(view === "connected")');
  });

  it("routes approvals to the one existing approval authority", () => {
    const activity = read("src/components/ai/connected/agent-activity-list.tsx");
    const surface = read("src/components/ai/connected/connected-agents-surface.tsx");
    // A proposed call opens the agent's transcript session in the work history.
    expect(activity).toContain('invocation.outcome === "proposed" ? transcriptSessionFor(invocation) : null');
    expect(activity).toContain("return `mcp_${invocation.agentActor.slice(\"agent:\".length)}`;");
    expect(surface).toContain("onOpenReview={onOpenSession}");
    expect(surface).not.toContain("approveAiActionProposal");
  });

  it("shows a grant secret once and never lists it again", () => {
    const dialog = read("src/components/ai/connected/connect-agent-dialog.tsx");
    const surface = read("src/components/ai/connected/connected-agents-surface.tsx");
    expect(dialog).toContain('data-agent-secret="true"');
    expect(dialog).toContain("reset();");
    expect(surface).not.toMatch(/\.secret(?!Hint)\b/);
    expect(surface).toContain("grant.secretHint");
  });

  it("only offers management to people who can manage", () => {
    const surface = read("src/components/ai/connected/connected-agents-surface.tsx");
    expect(surface.match(/agents\.canManage \?/g)?.length).toBeGreaterThanOrEqual(2);
    expect(surface).toContain("active && canManage");
  });

  it("isolates seller-named agents inside Arabic sentences", () => {
    expect(getConnectedAgentsCopy("ar", "revokeTitle", { name: "Claude Desktop" })).toBe(
      "إلغاء وصول ⁨Claude Desktop⁩؟",
    );
    expect(getConnectedAgentsCopy("en", "revokeTitle", { name: "Claude Desktop" })).toBe(
      "Revoke Claude Desktop?",
    );
  });
});
