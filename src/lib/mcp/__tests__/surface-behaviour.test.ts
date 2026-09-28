/**
 * Behaviour of the MCP agentic surface (FD-063): session identity, registry
 * scope hiding, the JSON-RPC dispatcher, loopback transport authorization and
 * proposal-bound execution, against the sandbox database.
 *
 * The golden pins in `surface-contract.test.ts` fix the vocabulary and limits;
 * these tests prove the runtime actually enforces them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/trusted-actor")>();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

import { db, shopContext } from "@/lib/db";
import { PHASE2_ACTIONS, type Phase2Action } from "@/lib/identity/permissions";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import {
  assertMcpNeverApprover,
  openMcpAgentSession,
  type McpAgentSession,
} from "@/lib/mcp/agent-session";
import { callMcpTool } from "@/lib/mcp/execute";
import {
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_METHOD_NOT_FOUND,
  handleMcpRequest,
  parseJsonRpcRequest,
} from "@/lib/mcp/protocol";
import { MCP_PROTOCOL_VERSION, MCP_RATE_LIMIT_MAX_CALLS } from "@/lib/mcp/contracts";
import { resetMcpRateLimit } from "@/lib/mcp/rate-limit";
import { buildMcpToolsForSession, resolveMcpToolForSession } from "@/lib/mcp/registry";
import { mcpTranscriptSessionId, recordMcpToolRequest } from "@/lib/mcp/transcript";
import { authorizeMcpTransport, resetMcpTransportToken } from "@/lib/mcp/transport-auth";
import type { McpAgentGrantBinding } from "@/lib/mcp/grants";
import { EXPECTED_AI_TOOL_NAMES } from "@/lib/ai/actions/contracts";

const EVERYTHING = PHASE2_ACTIONS.filter((action) => action !== "approvals.approve");

function actorContext(
  permissions: readonly Phase2Action[],
  kind: "person" | "device" = "person",
): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind,
      personId: "1".repeat(32),
      workspaceMemberId: "2".repeat(32),
      deviceId: "3".repeat(32),
      sessionId: "session-1",
      role: "owner",
      permissions,
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: shopContext,
  } as unknown as TrustedActorContext;
}

function grant(id = "grant-1", tools: readonly string[] = EXPECTED_AI_TOOL_NAMES): McpAgentGrantBinding {
  return { id, label: "Claude Desktop", tools: new Set(tools) };
}

function session(
  permissions: readonly Phase2Action[] = EVERYTHING,
  binding: McpAgentGrantBinding = grant(),
): McpAgentSession {
  return openMcpAgentSession({
    actorContext: actorContext(permissions),
    client: { name: "claude-ai", version: "0.12.4" },
    grant: binding,
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe("agent session identity", () => {
  it("gives each grant one stable non-person identity bound to the person session", () => {
    const first = session();
    const again = session();
    expect(first.agentId).toBe(again.agentId);
    expect(first.agentActor).toBe(`agent:${first.agentId}`);
    expect(first.onBehalfOf).not.toBe(first.agentActor);
    expect(session(EVERYTHING, grant("grant-2")).agentId).not.toBe(first.agentId);
  });

  it("refuses anything but a durable person session", () => {
    expect(() =>
      openMcpAgentSession({
        actorContext: actorContext(EVERYTHING, "device"),
        grant: grant(),
      }),
    ).toThrow(expect.objectContaining({ code: "MCP_DURABLE_PERSON_REQUIRED" }));
  });

  it("drops unsafe or oversized client labels", () => {
    const labelled = openMcpAgentSession({
      actorContext: actorContext(EVERYTHING),
      client: { name: "<script>", version: "x".repeat(40) },
      grant: grant(),
    });
    expect(labelled.client).toEqual({ name: null, version: null });
  });

  it("never lets a requirement include approval authority", () => {
    expect(() => assertMcpNeverApprover(["orders.read", "approvals.approve"])).toThrow(
      expect.objectContaining({ code: "MCP_AGENT_NEVER_APPROVER" }),
    );
    expect(() => assertMcpNeverApprover(["orders.read"])).not.toThrow();
  });
});

describe("registry scope hiding", () => {
  it("advertises read and sensitive tools to an owner and never the blocked one", async () => {
    const tools = (await buildMcpToolsForSession(session())).map((tool) => tool.name);
    expect(tools).toContain("search_orders");
    expect(tools).toContain("create_order");
    expect(tools).not.toContain("assign_order_to_delivery");
    for (const tool of await buildMcpToolsForSession(session())) {
      expect(tool.annotations).toBeDefined();
      expect(tool.outputSchema).toBeDefined();
    }
  });

  it("narrows an owner to exactly the tools the grant names", async () => {
    const narrowGrant = session(EVERYTHING, grant("grant-read", ["search_orders"]));
    expect((await buildMcpToolsForSession(narrowGrant)).map((tool) => tool.name)).toEqual([
      "search_orders",
    ]);
    expect(await codeOf(resolveMcpToolForSession(narrowGrant, "create_order"))).toBe(
      "MCP_TOOL_NOT_FOUND",
    );
  });

  it("hides every tool the person cannot use and reports hidden calls as unknown", async () => {
    const narrow = session(["ai.use"]);
    expect(await buildMcpToolsForSession(narrow)).toEqual([]);
    expect(await codeOf(resolveMcpToolForSession(narrow, "search_orders"))).toBe(
      "MCP_TOOL_NOT_FOUND",
    );
    expect(await codeOf(resolveMcpToolForSession(session(), "assign_order_to_delivery"))).toBe(
      "MCP_TOOL_NOT_FOUND",
    );
  });
});

describe("JSON-RPC dispatcher", () => {
  it("parses only well-formed requests", () => {
    expect(parseJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "ping" })).toMatchObject({
      id: 1,
      method: "ping",
    });
    expect(parseJsonRpcRequest({ jsonrpc: "1.0", id: 1, method: "ping" })).toBeNull();
    expect(parseJsonRpcRequest({ jsonrpc: "2.0", id: {}, method: "ping" })).toBeNull();
    expect(parseJsonRpcRequest([])).toBeNull();
  });

  it("answers initialize, ping and unknown methods", async () => {
    const agent = session();
    const init = await handleMcpRequest(agent, { jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(init?.result).toMatchObject({ protocolVersion: MCP_PROTOCOL_VERSION });
    expect(await handleMcpRequest(agent, { jsonrpc: "2.0", id: 2, method: "ping" })).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: {},
    });
    const unknown = await handleMcpRequest(agent, { jsonrpc: "2.0", id: 3, method: "resources/list" });
    expect(unknown?.error?.code).toBe(JSON_RPC_METHOD_NOT_FOUND);
  });

  it("rejects malformed requests and stays silent for notifications", async () => {
    const agent = session();
    expect((await handleMcpRequest(agent, { method: "ping" }))?.error?.code).toBe(
      JSON_RPC_INVALID_REQUEST,
    );
    expect(
      await handleMcpRequest(agent, { jsonrpc: "2.0", method: "notifications/initialized" }),
    ).toBeNull();
  });

  it("lists tools and reports a hidden tool call as invalid params", async () => {
    const agent = session();
    const listed = await handleMcpRequest(agent, { jsonrpc: "2.0", id: 4, method: "tools/list" });
    expect((listed?.result as { tools: unknown[] }).tools.length).toBeGreaterThan(0);

    const missing = await handleMcpRequest(agent, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {},
    });
    expect(missing?.error?.code).toBe(JSON_RPC_INVALID_PARAMS);

    const hidden = await handleMcpRequest(session(["ai.use"]), {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "search_orders", arguments: {} },
    });
    expect(hidden?.error).toMatchObject({
      code: JSON_RPC_INVALID_PARAMS,
      data: { code: "MCP_TOOL_NOT_FOUND" },
    });
  });
});

describe("loopback transport authorization", () => {
  const request = (headers: Record<string, string>) =>
    new Request("http://127.0.0.1:3000/api/mcp", { method: "POST", headers });

  beforeEach(() => {
    resetMcpTransportToken();
    vi.stubEnv("MCP_SIDECAR_TOKEN", "launch-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetMcpTransportToken();
  });

  it("accepts the launch token on loopback and returns the connection label", async () => {
    await expect(
      authorizeMcpTransport(
        request({
          host: "127.0.0.1:3000",
          authorization: "Bearer launch-token",
          "x-sahelflow-mcp-connection": "claude",
        }),
      ),
    ).resolves.toEqual({ connectionId: "claude" });
  });

  it("refuses non-loopback, proxied, unauthenticated and unprovisioned requests", async () => {
    expect(
      await codeOf(authorizeMcpTransport(request({ host: "shop.example.com", authorization: "Bearer launch-token" }))),
    ).toBe("MCP_TRANSPORT_NOT_LOOPBACK");
    expect(
      await codeOf(
        authorizeMcpTransport(
          request({ host: "localhost", "x-forwarded-for": "1.2.3.4", authorization: "Bearer launch-token" }),
        ),
      ),
    ).toBe("MCP_TRANSPORT_PROXIED");
    expect(
      await codeOf(authorizeMcpTransport(request({ host: "localhost", authorization: "Bearer wrong" }))),
    ).toBe("MCP_TRANSPORT_UNAUTHORIZED");

    vi.stubEnv("MCP_SIDECAR_TOKEN", "");
    resetMcpTransportToken();
    expect(await codeOf(authorizeMcpTransport(request({ host: "localhost" })))).toBe(
      "MCP_TRANSPORT_TOKEN_UNAVAILABLE",
    );
  });
});

describe("execution", () => {
  beforeEach(async () => {
    resetMcpRateLimit();
    await db.auditLog.deleteMany({ where: { action: "mcp.tool_called.v1" } });
  });

  it("runs a read tool and audits it under the agent identity", async () => {
    const agent = session();
    const outcome = await callMcpTool(agent, "get_stats", {});
    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toMatchObject({ success: true });

    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "mcp.tool_called.v1", entityId: "get_stats" },
    });
    expect(audit.actor).toBe(agent.agentActor);
    expect(JSON.parse(audit.metadata ?? "{}")).toMatchObject({
      via: "mcp",
      outcome: "succeeded",
      onBehalfOf: agent.onBehalfOf,
      grantId: "grant-1",
    });
  });

  it("never executes a sensitive verb directly", async () => {
    // The tool registry keeps a Vitest-only legacy harness that runs tool
    // bodies directly; policy tests opt into the production boundary.
    vi.stubEnv("SF_AI_ACTION_POLICY_TEST", "true");
    const before = await db.customer.count();
    const outcome = await callMcpTool(session(), "create_customer", {
      name: "Agent Created",
      phone: "0555000111",
    });
    expect(await db.customer.count()).toBe(before);

    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "mcp.tool_called.v1", entityId: "create_customer" },
    });
    const outcomeRecorded = JSON.parse(audit.metadata ?? "{}").outcome;
    // Either a proposal was persisted or the proposal gate refused; a direct
    // write is the one outcome that must never occur.
    expect(["proposed", "failed"]).toContain(outcomeRecorded);
    if (outcomeRecorded === "failed") expect(outcome.isError).toBe(true);
    vi.unstubAllEnvs();
  });

  it("rate-limits each agent and audits the refusal", async () => {
    const agent = session();
    const { consumeMcpRateLimit } = await import("@/lib/mcp/rate-limit");
    for (let index = 0; index < MCP_RATE_LIMIT_MAX_CALLS; index += 1) {
      consumeMcpRateLimit(agent.rateLimitSubject);
    }
    const outcome = await callMcpTool(agent, "get_stats", {});
    expect(outcome.isError).toBe(true);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "mcp.tool_called.v1", entityId: "get_stats" },
    });
    expect(JSON.parse(audit.metadata ?? "{}").outcome).toBe("rate_limited");
  });
});

describe("transcript", () => {
  it("records a redacted request line in the agent's own session", async () => {
    const agent = session();
    const request = await recordMcpToolRequest(db, agent, "create_order", {
      customerPhone: "0555123456",
    });
    expect(request.sessionId).toBe(mcpTranscriptSessionId(agent));
    const message = await db.aiChatMessage.findUniqueOrThrow({
      where: { id: request.requestMessageId },
    });
    expect(message.content).toContain('"via":"mcp"');
    expect(message.content).not.toContain("0555123456");
  });
});
