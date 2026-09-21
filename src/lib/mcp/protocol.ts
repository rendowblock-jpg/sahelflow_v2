/**
 * MCP JSON-RPC 2.0 protocol layer (FD-063).
 *
 * Hand-rolled rather than SDK-backed, deliberately: the installed runtime is a
 * packaged Next.js standalone build behind a pinned lockfile, and the surface
 * SahelFlow needs is small and fully specified — `initialize`, `tools/list`,
 * `tools/call`, `ping`. Stateless per request, no sessions, no resources, no
 * prompts, no elicitation.
 *
 * Notifications (no `id`) are accepted and produce no response body.
 */
import "server-only";

import { SahelFlowError } from "@/types/errors";
import type { McpAgentSession } from "./agent-session";
import {
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_TITLE,
} from "./contracts";
import { callMcpTool } from "./execute";
import { buildMcpToolsForSession } from "./registry";

export const JSON_RPC_PARSE_ERROR = -32700;
export const JSON_RPC_INVALID_REQUEST = -32600;
export const JSON_RPC_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_INVALID_PARAMS = -32602;
export const JSON_RPC_INTERNAL_ERROR = -32603;

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

function jsonRpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function parseJsonRpcRequest(value: unknown): JsonRpcRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.jsonrpc !== "2.0") return null;
  if (typeof record.method !== "string" || !record.method) return null;
  const id = record.id;
  if (
    id !== undefined &&
    id !== null &&
    typeof id !== "string" &&
    typeof id !== "number"
  ) {
    return null;
  }
  const params =
    record.params && typeof record.params === "object" && !Array.isArray(record.params)
      ? (record.params as Record<string, unknown>)
      : undefined;
  return {
    jsonrpc: "2.0",
    id: (id ?? null) as JsonRpcId,
    method: record.method,
    params,
  };
}

function isNotification(request: JsonRpcRequest, raw: unknown): boolean {
  return (
    !!raw &&
    typeof raw === "object" &&
    !("id" in (raw as Record<string, unknown>)) &&
    request.method.startsWith("notifications/")
  );
}

/**
 * Dispatch one JSON-RPC message. Returns `null` for notifications.
 */
export async function handleMcpRequest(
  session: McpAgentSession,
  raw: unknown,
): Promise<JsonRpcResponse | null> {
  const request = parseJsonRpcRequest(raw);
  if (!request) {
    return jsonRpcError(null, JSON_RPC_INVALID_REQUEST, "Invalid request");
  }
  if (isNotification(request, raw)) return null;

  try {
    switch (request.method) {
      case "initialize":
        return jsonRpcResult(request.id ?? null, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: MCP_SERVER_NAME,
            title: MCP_SERVER_TITLE,
            version: process.env.npm_package_version ?? "0.0.0",
          },
          instructions:
            "SahelFlow exposes read tools directly. Every state-changing tool returns a pending approval proposal instead of executing; a human approves it in the SahelFlow Agents workspace. You cannot approve your own proposals.",
        });

      case "ping":
        return jsonRpcResult(request.id ?? null, {});

      case "tools/list": {
        const tools = await buildMcpToolsForSession(session);
        return jsonRpcResult(request.id ?? null, { tools });
      }

      case "tools/call": {
        const name = request.params?.name;
        if (typeof name !== "string" || !name) {
          return jsonRpcError(
            request.id ?? null,
            JSON_RPC_INVALID_PARAMS,
            "A tool name is required",
          );
        }
        const rawArguments = request.params?.arguments;
        const args =
          rawArguments && typeof rawArguments === "object" && !Array.isArray(rawArguments)
            ? (rawArguments as Record<string, unknown>)
            : {};
        const outcome = await callMcpTool(session, name, args);
        return jsonRpcResult(request.id ?? null, {
          content: [{ type: "text", text: outcome.text }],
          ...(outcome.structuredContent
            ? { structuredContent: outcome.structuredContent }
            : {}),
          isError: outcome.isError,
        });
      }

      default:
        return jsonRpcError(
          request.id ?? null,
          JSON_RPC_METHOD_NOT_FOUND,
          `Method not found: ${request.method}`,
        );
    }
  } catch (error) {
    if (error instanceof SahelFlowError) {
      return jsonRpcError(request.id ?? null, JSON_RPC_INVALID_PARAMS, error.message, {
        code: error.code,
      });
    }
    return jsonRpcError(
      request.id ?? null,
      JSON_RPC_INTERNAL_ERROR,
      "Internal error",
    );
  }
}
