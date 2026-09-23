/**
 * MCP protocol handler — JSON-RPC 2.0 subset for SahelFlow's agent surface.
 *
 * Supports the three core MCP methods:
 * - `initialize` → server capabilities and protocol version
 * - `tools/list` → scope-filtered tool catalog
 * - `tools/call` → execute a tool with two-layer validation and output contracts
 *
 * The protocol is transport-agnostic: the same handler serves the internal
 * agent orchestrator and (if ever authorized) an external MCP client.
 */

import { z } from "zod";

import { executeMcpTool, getVisibleTools } from "./registry";
import { TOOL_TITLES } from "./tool-titles";
import type { McpToolContext, McpToolResult } from "./types";

// ─── JSON-RPC types ──────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ─── MCP constants ───────────────────────────────────────────────────────────

const PROTOCOL_VERSION = "2024-11-05";

const SERVER_INFO = {
  name: "sahelflow-agents",
  version: "1.0.0",
} as const;

// ─── Request schemas ─────────────────────────────────────────────────────────

const initializeParams = z.object({
  protocolVersion: z.string().optional(),
  clientInfo: z
    .object({ name: z.string().optional(), version: z.string().optional() })
    .optional(),
  capabilities: z.record(z.unknown()).optional(),
});

const toolsListParams = z.object({
  cursor: z.string().optional(),
});

const toolsCallParams = z.object({
  name: z.string().min(1),
  arguments: z.record(z.unknown()).default({}),
});

// ─── Protocol handler ────────────────────────────────────────────────────────

/**
 * Handle a single MCP JSON-RPC request.
 *
 * Returns a JSON-RPC response. The handler is stateless — all state (registry,
 * permissions) lives in the context and registry modules.
 */
export async function handleMcpRequest(
  request: JsonRpcRequest,
  ctx: McpToolContext,
): Promise<JsonRpcResponse> {
  const id = request.id ?? null;

  try {
    switch (request.method) {
      case "initialize":
        return handleInitialize(id, request.params);
      case "tools/list":
        return handleToolsList(id, request.params, ctx);
      case "tools/call":
        return handleToolsCall(id, request.params, ctx);
      case "ping":
        return { jsonrpc: "2.0", id, result: {} };
      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${request.method}` },
        };
    }
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "Internal error",
      },
    };
  }
}

function handleInitialize(
  id: string | number | null,
  params: unknown,
): JsonRpcResponse {
  initializeParams.parse(params ?? {});
  return {
    jsonrpc: "2.0",
    id,
    result: {
      protocolVersion: PROTOCOL_VERSION,
      serverInfo: SERVER_INFO,
      capabilities: {
        tools: { listChanged: false },
      },
    },
  };
}

function handleToolsList(
  id: string | number | null,
  params: unknown,
  ctx: McpToolContext,
): JsonRpcResponse {
  toolsListParams.parse(params ?? {});
  const visibility = getVisibleTools(ctx.actor.permissions);

  return {
    jsonrpc: "2.0",
    id,
    result: {
      tools: visibility.visibleTools.map((tool) => ({
        name: tool.name,
        title: TOOL_TITLES[tool.name] ?? tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      })),
    },
  };
}

async function handleToolsCall(
  id: string | number | null,
  params: unknown,
  ctx: McpToolContext,
): Promise<JsonRpcResponse> {
  const parsed = toolsCallParams.parse(params);
  const result: McpToolResult = await executeMcpTool(
    parsed.name,
    parsed.arguments,
    ctx,
  );

  // MCP tools/call response shape
  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [
        {
          type: "text",
          text: result.text,
        },
      ],
      ...(result.structuredContent
        ? { structuredContent: result.structuredContent }
        : {}),
      ...(result.isError ? { isError: true } : {}),
    },
  };
}

// ─── Batch handler (for the internal orchestrator) ───────────────────────────

/**
 * Handle multiple MCP requests in sequence (JSON-RPC batch).
 * Each request is processed independently; failures don't abort the batch.
 */
export async function handleMcpBatch(
  requests: JsonRpcRequest[],
  ctx: McpToolContext,
): Promise<JsonRpcResponse[]> {
  const responses: JsonRpcResponse[] = [];
  for (const request of requests) {
    responses.push(await handleMcpRequest(request, ctx));
  }
  return responses;
}
