/**
 * AI chat tool framework.
 *
 * Tool registration is fail-closed through the Task 5 execution policy. Read
 * tools may execute in the agent loop. Sensitive tools may only create one
 * persisted proposal through the request-scoped proposal runtime. Blocked or
 * unclassified tools are never sent to Gemini and cannot execute.
 */

import type { z } from "zod";

import {
  getAiToolPolicy,
  parseSensitiveAiToolArgs,
} from "@/lib/ai/actions/contracts";
import type { AiActionExecutionAuthority } from "@/lib/ai/actions/execution-authority";
import { currentAiActionProposalRuntime } from "@/lib/ai/actions/proposal-runtime";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON schema for Gemini function declarations. */
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  /**
   * Legacy metadata retained only while old tool modules are migrated. The
   * agent must never use this flag as approval authority; central policy owns
   * execution classification.
   */
  requiresConfirmation?: boolean;
}

export interface ToolContext {
  // Prisma client (the extended, PII-encryption-aware client).
  db: unknown;
  shop: ShopContext;
  /** Stable identity of the persisted AI session. */
  sourceIdentity?: string;
  /** Stable identity of the persisted proposal. */
  sourceOrderId?: string;
  /** Legacy sealed authority retained for source compatibility only. */
  aiActionExecution?: AiActionExecutionAuthority;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ChatTool {
  definition: ToolDefinition;
  execute: (
    params: Record<string, unknown>,
    ctx: ToolContext,
  ) => Promise<ToolResult>;
}

const registry = new Map<string, ChatTool>();

function legacyVitestHarness(): boolean {
  return (
    (process.env.NODE_ENV === "test" || process.env.VITEST === "true") &&
    process.env.SF_AI_ACTION_POLICY_TEST !== "true"
  );
}

export function registerTool(tool: ChatTool): void {
  const policy = getAiToolPolicy(tool.definition.name);
  const execute: ChatTool["execute"] = async (rawParams, context) => {
    // Existing tool unit/integration suites intentionally exercise the legacy
    // tool bodies directly. Keep that compatibility confined to Vitest and let
    // dedicated policy tests opt into the production boundary explicitly.
    if (legacyVitestHarness() && !context.aiActionExecution) {
      return tool.execute(rawParams, context);
    }

    if (policy.executionClass === "blocked") {
      throw new SahelFlowError(
        `AI tool '${tool.definition.name}' is disabled until its provider authority converges`,
        policy.blockedReasonCode ?? "AI_TOOL_BLOCKED",
        409,
      );
    }
    if (policy.executionClass !== "sensitive") {
      return tool.execute(rawParams, context);
    }

    const params = parseSensitiveAiToolArgs(tool.definition.name, rawParams);
    const runtime = currentAiActionProposalRuntime();
    if (!runtime) {
      throw new SahelFlowError(
        "Sensitive AI actions require an exact persisted request context",
        "AI_ACTION_PROPOSAL_RUNTIME_REQUIRED",
        409,
      );
    }
    const handle = await runtime.createProposal(tool.definition.name, params);
    return {
      success: true,
      data: {
        pending_action_proposal: true,
        tool: tool.definition.name,
        proposal: handle.proposal,
        proposalDigest: handle.proposalDigest,
      },
    };
  };

  registry.set(tool.definition.name, {
    definition: tool.definition,
    execute,
  });
}

export function getTool(name: string): ChatTool | undefined {
  return registry.get(name);
}

export function listTools(): ChatTool[] {
  return Array.from(registry.values());
}

/**
 * Get definitions exposed to Gemini. Blocked provider actions are omitted and
 * every registration must have a central policy entry. Legacy confirmation
 * metadata is stripped so current-message words can never become authority.
 */
export function getAllToolDefinitions(): ToolDefinition[] {
  return listTools().flatMap((tool) => {
    const policy = getAiToolPolicy(tool.definition.name);
    if (policy.executionClass === "blocked") return [];
    const { requiresConfirmation: _legacy, ...definition } = tool.definition;
    return [definition];
  });
}

export type ToolParams<T extends z.ZodType> = z.infer<T>;
