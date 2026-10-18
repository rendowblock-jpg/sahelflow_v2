/**
 * S06b-04: a refused MCP call must leave a bounded `denied` audit row.
 *
 * `callMcpTool` is exercised with its collaborators replaced, so the test needs
 * no database: only the refusal path and the audit it must write are real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  audits: [] as Array<{ data: Record<string, unknown> }>,
  resolve: vi.fn(),
  getTool: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    auditLog: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        h.audits.push(args);
        return args;
      }),
    },
  },
  shopContext: { shopId: "shop-1" },
}));
vi.mock("@/lib/ai/actions/service", () => ({ createAiActionProposal: vi.fn() }));
vi.mock("@/lib/ai/actions/proposal-runtime", () => ({ runWithAiActionProposalRuntime: vi.fn() }));
vi.mock("@/lib/ai/chat/tools/registry", () => ({ getTool: h.getTool }));
vi.mock("@/lib/mcp/registry", () => ({ resolveMcpToolForSession: h.resolve }));
vi.mock("@/lib/mcp/transcript", () => ({ recordMcpToolRequest: vi.fn() }));
vi.mock("@/lib/mcp/agent-session", () => ({ assertMcpNeverApprover: vi.fn() }));

import type { McpAgentSession } from "@/lib/mcp/agent-session";
import * as auditModule from "@/lib/mcp/audit";
import { callMcpTool } from "@/lib/mcp/execute";
import { SahelFlowError } from "@/types/errors";

const session = {
  agentActor: "agent:g1",
  onBehalfOf: "person:owner",
  grant: { id: "g1", label: "Claude", tools: new Set<string>() },
  client: { name: "claude", version: "1.0" },
  rateLimitSubject: "g1",
  actorContext: {},
} as unknown as McpAgentSession;

function metadataOf(index: number): Record<string, unknown> {
  return JSON.parse(String(h.audits[index]?.data.metadata ?? "{}")) as Record<string, unknown>;
}

beforeEach(() => {
  h.audits.length = 0;
  h.resolve.mockReset();
  h.getTool.mockReset();
  (auditModule as { resetMcpAuditCoalescing?: () => void }).resetMcpAuditCoalescing?.();
});

describe("refused MCP calls", () => {
  it("audits an unknown or hidden tool as denied, with no payload content", async () => {
    h.resolve.mockRejectedValue(new SahelFlowError("Unknown tool: nope", "MCP_TOOL_NOT_FOUND", 404));

    await expect(
      callMcpTool(session, "nope", { note: "free text the agent typed", phone: "0555123456" }),
    ).rejects.toMatchObject({ code: "MCP_TOOL_NOT_FOUND" });

    expect(h.audits).toHaveLength(1);
    const data = h.audits[0]!.data;
    expect(data.action).toBe("mcp.tool_called.v1");
    expect(data.entityId).toBe("nope");
    expect(data.actor).toBe("agent:g1");
    const metadata = metadataOf(0);
    expect(metadata.outcome).toBe("denied");
    expect(metadata.errorCode).toBe("MCP_TOOL_NOT_FOUND");
    expect(metadata.grantId).toBe("g1");
    expect(String(data.metadata)).not.toContain("free text the agent typed");
    expect(String(data.metadata)).not.toContain("0555123456");
  });

  it("audits a tool that is registered but not executable as denied", async () => {
    h.resolve.mockResolvedValue({ name: "get_stats", executionClass: "read", requires: [] });
    h.getTool.mockReturnValue(undefined);

    await expect(callMcpTool(session, "get_stats", {})).rejects.toMatchObject({
      code: "MCP_TOOL_NOT_FOUND",
    });

    expect(h.audits).toHaveLength(1);
    expect(metadataOf(0).outcome).toBe("denied");
    expect(metadataOf(0).executionClass).toBe("read");
  });

  it("writes a bounded number of rows for a probe loop", async () => {
    h.resolve.mockRejectedValue(new SahelFlowError("Unknown tool", "MCP_TOOL_NOT_FOUND", 404));
    for (let index = 0; index < 300; index += 1) {
      await callMcpTool(session, `probe_${index}`, {}).catch(() => undefined);
    }
    expect(h.audits.length).toBeGreaterThan(0);
    expect(h.audits.length).toBeLessThanOrEqual(2);
  });

  it("does not call an unexpected internal failure a denial", async () => {
    h.resolve.mockRejectedValue(new Error("registry unavailable"));

    await expect(callMcpTool(session, "get_stats", {})).rejects.toThrow("registry unavailable");

    expect(h.audits).toHaveLength(1);
    expect(metadataOf(0).outcome).toBe("failed");
    expect(String(h.audits[0]!.data.metadata)).not.toContain("registry unavailable");
  });
});
