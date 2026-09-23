/**
 * MCP tool model — SahelFlow's agent surface.
 *
 * Architecture follows the CodFlow MCP study (EX-5, `research/CODFLOW_EXTRACTION.md` §7):
 * registration-time scope hiding, two-layer validation, declared output schemas
 * with structuredContent safe-parse, and derived annotations. The destructive
 * doctrine is SahelFlow's own: sensitive verbs ride the digest-bound person-only
 * proposal gate which *replaces* client-side confirmation.
 *
 * No external agent surface exists without a separate explicit Founder decision.
 * This module is the internal tool-execution layer for the built-in agent workspace.
 */

import type { z } from "zod";

import type { Phase2Action } from "@/lib/identity/permissions";

// ─── Execution classes ───────────────────────────────────────────────────────

/**
 * Four execution classes, matching the existing policy map:
 * - `read`          — safe reads; execute directly in the agent loop.
 * - `external_read` — reads that leave the machine (e.g. provider API); execute
 *                     directly with privacy narrowing applied.
 * - `sensitive`     — mutations; the tool executes nothing and returns a
 *                     `pending_action_proposal` envelope. The human approves in
 *                     the Agents workspace with the digest.
 * - `blocked`       — registered but never advertised, never executable.
 */
export type ToolExecutionClass = "read" | "external_read" | "sensitive" | "blocked";

// ─── Derived annotations ─────────────────────────────────────────────────────

export interface ToolAnnotations {
  /** Tool has no side effects. */
  readOnlyHint: boolean;
  /** Tool may modify data or take external actions. */
  destructiveHint: boolean;
  /** Calling twice with the same args is safe (no duplicate effects). */
  idempotentHint: boolean;
  /** Tool interacts with the external world (network, providers). */
  openWorldHint: boolean;
}

// ─── Tool definitions ────────────────────────────────────────────────────────

/**
 * A tool as advertised to the agent / MCP client.
 *
 * The `inputSchema` is the **exact** Zod shape that `execute()` validates —
 * `tools/list` advertises what `tools/call` enforces; drift is test-impossible.
 */
export interface McpToolDefinition {
  /** Flat camelCase tool name (CodFlow convention: `listOrders`, `createOrder`). */
  name: string;
  /** Human-readable description for the model. */
  description: string;
  /** JSON Schema for tool parameters (derived from Zod via `zodToJsonSchema`). */
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** Zod schema for strict second-layer validation. */
  inputZod: z.ZodType<Record<string, unknown>>;
  /** Declared output schema for safe-parse of tool results. */
  outputSchema?: ToolOutputSchema;
  /** Derived annotations (never hand-written; computed from membership sets). */
  annotations: ToolAnnotations;
  /** Phase2Action permissions required to execute this tool. */
  requiredPermissions: readonly Phase2Action[];
  /** Capability group for UI presentation. */
  group: McpCapabilityGroup;
}

// ─── Capability groups ───────────────────────────────────────────────────────

export type McpCapabilityGroup =
  | "orders"
  | "customers"
  | "products"
  | "delivery"
  | "insights"
  | "conversations"
  | "storefront"
  | "accounting"
  | "automation"
  | "notifications";

// ─── Tool output contracts ───────────────────────────────────────────────────

/**
 * Declared output shape: a Zod union of `{success: true, …payload}` and
 * `{success: false, error}`. Results are safe-parsed against this schema;
 * on success both a JSON `text` block **and** `structuredContent` ship;
 * on drift `structuredContent` is omitted but text still ships.
 */
export interface ToolOutputSchema {
  success: z.ZodType<Record<string, unknown>>;
  failure: z.ZodType<Record<string, unknown>>;
}

export interface McpToolResult {
  /** Always present: human-readable text block. */
  text: string;
  /** Present only when the result passed the declared output schema. */
  structuredContent?: Record<string, unknown>;
  /** True when the tool call failed (handled failure or thrown error). */
  isError?: boolean;
}

// ─── Tool execution context ──────────────────────────────────────────────────

export interface McpToolContext {
  /** Prisma client (the extended, PII-encryption-aware client). */
  db: unknown;
  /** Trusted shop context. */
  shop: { shopId: string; shopName?: string };
  /** Trusted actor context (person identity for proposal creation). */
  actor: {
    memberId: string;
    memberName?: string;
    role: string;
    permissions: readonly Phase2Action[];
  };
  /** Stable identity of the persisted AI session. */
  sessionId?: string;
  /** Request-scoped proposal runtime (set when sensitive tools may fire). */
  proposalRuntime?: McpProposalRuntime;
}

export interface McpProposalRuntime {
  createProposal(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ proposalId: string; proposalDigest: string }>;
}

// ─── Registration-time scope visibility ──────────────────────────────────────

/**
 * CodFlow convention: tools whose `requiredPermissions` the caller lacks are
 * **hidden at registration** — the agent cannot even see them. This is stronger
 * than erroring on call: the model never wastes tokens on tools it cannot use.
 */
export interface McpToolVisibility {
  /** Tools visible to this caller (already scope-filtered). */
  visibleTools: McpToolDefinition[];
  /** Total registered tools (for capability truth). */
  totalRegistered: number;
}
