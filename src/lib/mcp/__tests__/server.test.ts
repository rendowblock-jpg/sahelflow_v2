/**
 * MCP server protocol tests — verify JSON-RPC 2.0 handling.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { z } from "zod";

import { handleMcpRequest, handleMcpBatch } from "../server";
import { clearMcpRegistry, registerMcpTool } from "../registry";
import { toolOutput } from "../tool-output";

const mockCtx = {
  db: {},
  shop: { shopId: "test-shop" },
  actor: {
    memberId: "test-member",
    role: "owner",
    permissions: ["orders.read"] as const,
  },
};

beforeEach(() => {
  clearMcpRegistry();
});

describe("handleMcpRequest", () => {
  it("handles initialize", async () => {
    const response = await handleMcpRequest(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
      mockCtx,
    );
    expect(response.jsonrpc).toBe("2.0");
    expect(response.id).toBe(1);
    expect(response.result).toHaveProperty("protocolVersion");
    expect(response.result).toHaveProperty("serverInfo");
  });

  it("handles tools/list", async () => {
    registerMcpTool({
      name: "searchOrders",
      description: "Search orders",
      inputZod: z.object({}).strict(),
      group: "orders",
      executionClass: "read",
      requiredPermissions: ["orders.read"],
      execute: async () => ({}),
    });

    const response = await handleMcpRequest(
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      mockCtx,
    );
    expect(response.result).toHaveProperty("tools");
    const tools = (response.result as { tools: unknown[] }).tools;
    expect(tools).toHaveLength(1);
  });

  it("handles tools/call", async () => {
    registerMcpTool({
      name: "searchOrders",
      description: "Search orders",
      inputZod: z.object({ query: z.string() }).strict(),
      outputSchema: toolOutput(z.object({ success: z.literal(true), data: z.string() })),
      group: "orders",
      executionClass: "read",
      requiredPermissions: ["orders.read"],
      execute: async (params) => ({ data: `found: ${params.query}` }),
    });

    const response = await handleMcpRequest(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "searchOrders", arguments: { query: "test" } } },
      mockCtx,
    );
    expect(response.result).toHaveProperty("content");
  });

  it("handles ping", async () => {
    const response = await handleMcpRequest(
      { jsonrpc: "2.0", id: 4, method: "ping" },
      mockCtx,
    );
    expect(response.result).toEqual({});
  });

  it("returns error for unknown method", async () => {
    const response = await handleMcpRequest(
      { jsonrpc: "2.0", id: 5, method: "unknown/method" },
      mockCtx,
    );
    expect(response.error).toHaveProperty("code", -32601);
  });
});

describe("handleMcpBatch", () => {
  it("handles multiple requests", async () => {
    const responses = await handleMcpBatch(
      [
        { jsonrpc: "2.0", id: 1, method: "initialize" },
        { jsonrpc: "2.0", id: 2, method: "ping" },
      ],
      mockCtx,
    );
    expect(responses).toHaveLength(2);
    expect(responses[0].id).toBe(1);
    expect(responses[1].id).toBe(2);
  });
});
