/**
 * Central MCP tool registry — SahelFlow agent surface.
 *
 * Architecture follows the CodFlow MCP study (EX-5 §7):
 *
 * 1. **Registration-time scope hiding**: tools whose `requiredPermissions` the
 *    caller lacks are hidden — the agent cannot even see them. Stronger than
 *    erroring on call: the model never wastes tokens on tools it cannot use.
 *
 * 2. **Two-layer validation**: layer 1 input is permissive (malformed LLM calls
 *    never crash the server), layer 2 is the strict Zod schema whose exact
 *    `.shape` is advertised in `tools/list` — *advertised == enforced; drift
 *    is test-impossible*.
 *
 * 3. **Declared output schemas**: every tool result is safe-parsed against its
 *    `outputSchema`; on success both `text` and `structuredContent` ship;
 *    on drift `structuredContent` is omitted but text still ships.
 *
 * 4. **Derived annotations**: `readOnlyHint`/`destructiveHint`/`idempotentHint`/
 *    `openWorldHint` derived from membership sets, never hand-written. CI drift
 *    guards pin consistency.
 *
 * 5. **Proposal-bound destructive doctrine**: sensitive tools execute nothing
 *    and return a `pending_action_proposal` envelope. The human approves in
 *    the Agents workspace with the digest. This *replaces* client-side
 *    confirmation — it is the only human gate.
 */

import type { z } from "zod";

import { getAiToolPolicy } from "@/lib/ai/actions/contracts";
import type { Phase2Action } from "@/lib/identity/permissions";
import { SahelFlowError } from "@/types/errors";

import { assertAnnotationConsistency, deriveAnnotations } from "./annotations";
import { errorToolResult, safeParseToolResult, successToolResult } from "./tool-output";
import { checkRateLimit, logToolCall, redactForAudit, readClientMeta } from "./request-context";
import type {
  McpCapabilityGroup,
  McpToolContext,
  McpToolDefinition,
  McpToolResult,
  McpToolVisibility,
  ToolExecutionClass,
} from "./types";

// ─── Zod → JSON Schema (minimal, for Gemini function declarations) ───────────

/**
 * Minimal Zod-to-JSON-Schema converter for tool input schemas.
 * Only handles the shapes used in SahelFlow tool definitions.
 */
export function zodToJsonSchema(schema: z.ZodType<unknown>): {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
} {
  const def = (schema as unknown as { _def?: Record<string, unknown> })._def;
  if (!def || def.typeName !== "ZodObject") {
    return { type: "object", properties: {} };
  }

  const shape = (def.shape as () => Record<string, z.ZodType<unknown>>)();
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    properties[key] = zodFieldToJsonSchema(value);
    const fieldDef = (value as unknown as { _def?: Record<string, unknown> })._def;
    const isOptional =
      fieldDef?.typeName === "ZodOptional" || fieldDef?.typeName === "ZodDefault";
    if (!isOptional) {
      required.push(key);
    }
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function zodFieldToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const def = (schema as unknown as { _def?: Record<string, unknown> })._def;
  if (!def) return {};

  switch (def.typeName) {
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodArray": {
      const inner = zodFieldToJsonSchema(def.type as z.ZodType<unknown>);
      return { type: "array", items: inner };
    }
    case "ZodEnum":
      return { type: "string", enum: def.values as string[] };
    case "ZodOptional":
    case "ZodDefault":
      return zodFieldToJsonSchema(def.innerType as z.ZodType<unknown>);
    case "ZodObject":
      return zodToJsonSchema(schema as z.ZodType<unknown>);
    case "ZodLiteral":
      return { type: "string", const: def.value };
    case "ZodUnion":
      return {
        anyOf: (def.options as z.ZodType<unknown>[]).map((o) =>
          zodFieldToJsonSchema(o),
        ),
      };
    default:
      return {};
  }
}

// ─── Tool registration ───────────────────────────────────────────────────────

interface RegisteredTool {
  definition: McpToolDefinition;
  execute: (
    params: Record<string, unknown>,
    ctx: McpToolContext,
  ) => Promise<McpToolResult>;
}

const registry = new Map<string, RegisteredTool>();

export interface McpToolRegistration {
  name: string;
  description: string;
  inputZod: z.ZodType<Record<string, unknown>>;
  outputSchema?: McpToolDefinition["outputSchema"];
  group: McpCapabilityGroup;
  executionClass: ToolExecutionClass;
  requiredPermissions: readonly Phase2Action[];
  execute: (
    params: Record<string, unknown>,
    ctx: McpToolContext,
  ) => Promise<Record<string, unknown> | string>;
}

/**
 * Register a tool in the central registry.
 *
 * The tool's execution class is read from the existing policy map
 * (`src/lib/ai/actions/contracts.ts`) to guarantee a single authority —
 * the registry never invents its own classification.
 */
export function registerMcpTool(registration: McpToolRegistration): void {
  const policy = getAiToolPolicy(registration.name);
  const executionClass = policy.executionClass;

  // Derive annotations from membership sets (never hand-written)
  const annotations = deriveAnnotations(registration.name, executionClass);

  const definition: McpToolDefinition = {
    name: registration.name,
    description: registration.description,
    inputSchema: zodToJsonSchema(registration.inputZod),
    inputZod: registration.inputZod,
    outputSchema: registration.outputSchema,
    annotations,
    requiredPermissions: registration.requiredPermissions,
    group: registration.group,
  };

  // Drift guard: annotations must match membership sets
  assertAnnotationConsistency(definition);

  const wrappedExecute = async (
    params: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> => {
    // Rate limiting (CodFlow convention: fail-open, per-subject)
    const clientMeta = readClientMeta(ctx);
    const subject = clientMeta.subject ?? ctx.actor.memberId;
    const rate = checkRateLimit(subject);
    if (!rate.allowed) {
      logToolCall({
        timestamp: new Date().toISOString(),
        tool: registration.name,
        actor: ctx.actor.memberId,
        ok: false,
        args: redactForAudit(params),
        error: `rate_limited (retry in ${rate.retryAfterSeconds}s)`,
        ...(clientMeta.subject !== undefined ? { clientSubject: clientMeta.subject } : {}),
        ...(clientMeta.session !== undefined ? { clientSession: clientMeta.session } : {}),
      });
      return errorToolResult(
        new SahelFlowError(
          `Rate limit exceeded — too many tool calls. Wait ${rate.retryAfterSeconds} seconds, then retry.`,
          "AI_TOOL_RATE_LIMITED",
          429,
        ),
      );
    }

    // Blocked tools never execute
    if (executionClass === "blocked") {
      logToolCall({
        timestamp: new Date().toISOString(),
        tool: registration.name,
        actor: ctx.actor.memberId,
        ok: false,
        args: redactForAudit(params),
        error: "blocked",
      });
      return errorToolResult(
        new SahelFlowError(
          `Tool '${registration.name}' is disabled until its provider authority converges`,
          policy.blockedReasonCode ?? "AI_TOOL_BLOCKED",
          409,
        ),
      );
    }

    // Two-layer validation: strict Zod parse (layer 2)
    const parsed = registration.inputZod.safeParse(params);
    if (!parsed.success) {
      logToolCall({
        timestamp: new Date().toISOString(),
        tool: registration.name,
        actor: ctx.actor.memberId,
        ok: false,
        args: redactForAudit(params),
        error: "invalid_args",
      });
      return errorToolResult(
        new SahelFlowError(
          `Invalid arguments for '${registration.name}': ${parsed.error.issues.map((i) => i.message).join("; ")}`,
          "AI_TOOL_INVALID_ARGS",
          400,
        ),
      );
    }

    // Sensitive tools: create proposal, never execute directly
    if (executionClass === "sensitive") {
      if (!ctx.proposalRuntime) {
        logToolCall({
          timestamp: new Date().toISOString(),
          tool: registration.name,
          actor: ctx.actor.memberId,
          ok: false,
          args: redactForAudit(parsed.data),
          error: "proposal_runtime_required",
        });
        return errorToolResult(
          new SahelFlowError(
            "Sensitive AI actions require an exact persisted request context",
            "AI_ACTION_PROPOSAL_RUNTIME_REQUIRED",
            409,
          ),
        );
      }
      const startTime = Date.now();
      const handle = await ctx.proposalRuntime.createProposal(
        registration.name,
        parsed.data,
      );
      logToolCall({
        timestamp: new Date().toISOString(),
        tool: registration.name,
        actor: ctx.actor.memberId,
        ok: true,
        args: redactForAudit(parsed.data),
        durationMs: Date.now() - startTime,
        ...(clientMeta.subject !== undefined ? { clientSubject: clientMeta.subject } : {}),
        ...(clientMeta.session !== undefined ? { clientSession: clientMeta.session } : {}),
      });
      return successToolResult({
        pending_action_proposal: true,
        tool: registration.name,
        proposalId: handle.proposalId,
        proposalDigest: handle.proposalDigest,
      });
    }

    // Read / external_read: execute directly
    const startTime = Date.now();
    try {
      const raw = await registration.execute(parsed.data, ctx);
      logToolCall({
        timestamp: new Date().toISOString(),
        tool: registration.name,
        actor: ctx.actor.memberId,
        ok: true,
        args: redactForAudit(parsed.data),
        durationMs: Date.now() - startTime,
        ...(clientMeta.subject !== undefined ? { clientSubject: clientMeta.subject } : {}),
        ...(clientMeta.session !== undefined ? { clientSession: clientMeta.session } : {}),
      });
      return safeParseToolResult(raw, registration.outputSchema);
    } catch (error) {
      logToolCall({
        timestamp: new Date().toISOString(),
        tool: registration.name,
        actor: ctx.actor.memberId,
        ok: false,
        args: redactForAudit(parsed.data),
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      return errorToolResult(error);
    }
  };

  registry.set(registration.name, {
    definition,
    execute: wrappedExecute,
  });
}

// ─── Scope-filtered visibility (CodFlow: hidden, not erroring) ────────────────

/**
 * Get tools visible to a caller with the given permissions.
 *
 * Tools whose `requiredPermissions` the caller lacks are **hidden** — the
 * agent cannot even see them. Blocked tools are always hidden.
 */
export function getVisibleTools(
  permissions: readonly Phase2Action[],
): McpToolVisibility {
  const permSet = new Set<string>(permissions);
  const visibleTools: McpToolDefinition[] = [];

  for (const entry of registry.values()) {
    // Blocked tools are never advertised
    const policy = getAiToolPolicy(entry.definition.name);
    if (policy.executionClass === "blocked") continue;

    // Scope hiding: skip tools the caller cannot execute
    const hasAllPermissions = entry.definition.requiredPermissions.every((p) =>
      permSet.has(p),
    );
    if (!hasAllPermissions) continue;

    visibleTools.push(entry.definition);
  }

  return {
    visibleTools,
    totalRegistered: registry.size,
  };
}

/**
 * Get a single tool by name (for `tools/call`).
 * Returns undefined if not registered or not visible to the caller.
 */
export function getVisibleTool(
  name: string,
  permissions: readonly Phase2Action[],
): RegisteredTool | undefined {
  const entry = registry.get(name);
  if (!entry) return undefined;

  const policy = getAiToolPolicy(name);
  if (policy.executionClass === "blocked") return undefined;

  const permSet = new Set<string>(permissions);
  const hasAllPermissions = entry.definition.requiredPermissions.every((p) =>
    permSet.has(p),
  );
  if (!hasAllPermissions) return undefined;

  return entry;
}

/**
 * Execute a tool by name with the given context.
 * Handles scope gating, two-layer validation, proposal gating, and output parsing.
 */
export async function executeMcpTool(
  name: string,
  params: Record<string, unknown>,
  ctx: McpToolContext,
): Promise<McpToolResult> {
  const entry = getVisibleTool(name, ctx.actor.permissions);
  if (!entry) {
    return errorToolResult(
      new SahelFlowError(
        `Tool '${name}' not found or not permitted`,
        "AI_TOOL_NOT_FOUND",
        404,
      ),
    );
  }
  return entry.execute(params, ctx);
}

/**
 * Get all registered tool names (including blocked) for capability truth.
 */
export function getAllRegisteredToolNames(): string[] {
  return Array.from(registry.keys());
}

/**
 * Clear the registry (for tests).
 */
export function clearMcpRegistry(): void {
  registry.clear();
}
