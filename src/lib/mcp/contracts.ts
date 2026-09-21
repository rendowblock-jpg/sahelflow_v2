/**
 * MCP agentic surface contracts (FD-063, EX-5 conversion).
 *
 * SahelFlow adopts CodFlow's MCP *surface* conventions and keeps its own
 * authority model:
 *
 *   - one permission vocabulary (`Phase2Action`), never a parallel `mcp:*`
 *     scope space, so there is zero drift between the app and the agent;
 *   - registration-time scope hiding: a tool the caller may not invoke is not
 *     advertised at all, rather than advertised and refused;
 *   - every tool declares an output schema, and `tools/list` advertises exactly
 *     what `tools/call` validates;
 *   - annotations are *derived* from membership sets, never hand-written, and
 *     are UX framing only. The real human gate is the server-side proposal;
 *   - `approvals.approve` may never appear in an MCP requirement. The agent is
 *     a structural never-approver.
 *
 * This module is pure contract data plus derivation. It performs no IO.
 */
import "server-only";

import { z } from "zod";

import {
  EXPECTED_AI_TOOL_NAMES,
  getAiToolPolicy,
  type AiToolExecutionClass,
} from "@/lib/ai/actions/contracts";
import type { Phase2Action } from "@/lib/identity/permissions";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const MCP_SERVER_NAME = "sahelflow-local";
export const MCP_SERVER_TITLE = "SahelFlow (local)";

/** CodFlow parity: 200 calls per 60 seconds per subject, deliberately fail-open. */
export const MCP_RATE_LIMIT_MAX_CALLS = 200;
export const MCP_RATE_LIMIT_WINDOW_MS = 60_000;

/** CodFlow parity: audit argument redaction bounds. */
export const MCP_AUDIT_STRING_LIMIT = 1024;
export const MCP_AUDIT_MAX_DEPTH = 8;

/** CodFlow parity: list pagination bounds. */
export const MCP_PAGE_LIMIT_DEFAULT = 100;
export const MCP_PAGE_LIMIT_MAX = 200;

/** Every MCP invocation is an AI use of the shop. */
export const MCP_BASE_PERMISSIONS = Object.freeze([
  "ai.use",
] as const satisfies readonly Phase2Action[]);

/**
 * A sensitive verb over MCP only ever *requests* an approval, so the caller
 * must hold `approvals.request`. It must never hold approval authority through
 * this surface.
 */
export const MCP_SENSITIVE_PERMISSIONS = Object.freeze([
  "approvals.request",
] as const satisfies readonly Phase2Action[]);

/**
 * Permissions that may never be required — and therefore never exercised — by
 * the MCP surface. Approval is person-held in the dashboard, full stop.
 */
export const MCP_FORBIDDEN_PERMISSIONS = Object.freeze([
  "approvals.approve",
] as const satisfies readonly Phase2Action[]);

/**
 * Read scopes for the read/external_read vocabulary.
 *
 * The AI action policy leaves `requiredPermissions` empty for reads because the
 * in-app chat already sits behind `ai.use`. An MCP client is a *different*
 * caller, so each read tool declares the real domain scope it consumes. This is
 * additive hardening in the existing vocabulary, not a new one.
 */
export const MCP_READ_SCOPES: Readonly<
  Record<string, readonly Phase2Action[]>
> = Object.freeze({
  search_products: ["products.read"],
  search_customers: ["customers.read", "customers.contact.read"],
  get_stats: ["analytics.read"],
  get_order_details: ["orders.read"],
  list_recent_orders: ["orders.read"],
  get_customer_details: ["customers.read", "customers.contact.read"],
  get_low_stock_products: ["products.read"],
  get_revenue_report: ["analytics.read", "analytics.financials.read"],
  get_delivery_status: ["deliveries.read"],
  search_conversations: ["conversations.read"],
  get_pending_deliveries: ["deliveries.read"],
  get_top_products: ["products.read", "analytics.read"],
  get_wilaya_risk: ["risk.read"],
  get_product_details: ["products.read"],
  get_customer_orders: ["customers.read", "orders.read"],
  get_returns_summary: ["orders.read"],
  get_sales_by_wilaya: ["analytics.read"],
  get_conversation_messages: ["conversations.read"],
  search_orders: ["orders.read"],
  estimate_delivery_cost: ["deliveries.read"],
  get_delivery_cost_comparison: ["deliveries.read"],
});

/**
 * Idempotent membership set. A repeat call with identical arguments converges
 * on the same state. `update_customer_notes` is deliberately absent: its
 * `append` mode accumulates.
 */
export const MCP_IDEMPOTENT_TOOLS = Object.freeze([
  "update_order_status",
  "update_product_stock",
  "update_product_price",
]);

/** Open-world membership set: tools that reach a third-party provider. */
export const MCP_OPEN_WORLD_TOOLS = Object.freeze([
  "estimate_delivery_cost",
  "get_delivery_cost_comparison",
]);

export interface McpToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface McpJsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: McpJsonSchema;
  outputSchema: Record<string, unknown>;
  annotations: McpToolAnnotations;
}

/**
 * Derive annotations from membership sets. Never hand-written per tool.
 *
 * `destructiveHint` is set for every sensitive verb purely so a client can
 * frame the call for its user. It is *not* the gate: a sensitive verb executes
 * nothing and returns a pending proposal regardless of what the client does
 * with the hint.
 */
export function deriveMcpAnnotations(
  toolName: string,
  executionClass: AiToolExecutionClass,
): McpToolAnnotations {
  const readOnly =
    executionClass === "read" || executionClass === "external_read";
  return {
    readOnlyHint: readOnly,
    destructiveHint: executionClass === "sensitive",
    idempotentHint: MCP_IDEMPOTENT_TOOLS.includes(toolName),
    openWorldHint: MCP_OPEN_WORLD_TOOLS.includes(toolName),
  };
}

/**
 * The success/failure union every MCP tool declares and every MCP tool result
 * is safe-parsed against. The success payload is intentionally loose: the
 * privacy projection, not this schema, decides what may leave the machine.
 */
export const mcpToolOutputSchema = z.union([
  z.object({ success: z.literal(true), data: z.unknown() }),
  z.object({ success: z.literal(false), error: z.string() }),
]);

export type McpToolOutput = z.infer<typeof mcpToolOutputSchema>;

/**
 * JSON Schema mirror of `mcpToolOutputSchema`, advertised on every tool.
 * Hand-built and deterministic so it can be golden-pinned in CI without
 * pulling a schema-conversion dependency into the runtime.
 */
export function toolOutputJsonSchema(): Record<string, unknown> {
  return {
    oneOf: [
      {
        type: "object",
        properties: {
          success: { const: true },
          data: {},
        },
        required: ["success"],
      },
      {
        type: "object",
        properties: {
          success: { const: false },
          error: { type: "string" },
        },
        required: ["success", "error"],
      },
    ],
  };
}

/**
 * Resolve the full permission requirement for one tool over MCP.
 *
 * `requires` is AND-ed. The result is sorted and de-duplicated so it is stable
 * enough to golden-pin.
 */
export function resolveMcpToolRequirements(
  toolName: string,
): readonly Phase2Action[] {
  const policy = getAiToolPolicy(toolName);
  const required = new Set<Phase2Action>(MCP_BASE_PERMISSIONS);
  for (const action of MCP_READ_SCOPES[toolName] ?? []) required.add(action);
  for (const action of policy.requiredPermissions) required.add(action);
  if (policy.executionClass === "sensitive") {
    for (const action of MCP_SENSITIVE_PERMISSIONS) required.add(action);
  }
  for (const forbidden of MCP_FORBIDDEN_PERMISSIONS) {
    required.delete(forbidden);
  }
  return Object.freeze([...required].sort() as Phase2Action[]);
}

/** The exact tool vocabulary the MCP surface may ever consider. */
export const MCP_CANDIDATE_TOOL_NAMES = EXPECTED_AI_TOOL_NAMES;
