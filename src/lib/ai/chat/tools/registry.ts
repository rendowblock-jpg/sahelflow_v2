/**
 * AI chat tool framework.
 *
 * Tool registration is fail-closed through the Task 5 execution policy. Read
 * tools may execute in the agent loop, but only for an actor who holds the
 * grants their data needs (see `read-access.ts`): the check runs here, before
 * the tool body, against the actor of the current session. Sensitive tools may
 * only create one persisted proposal through the request-scoped proposal
 * runtime. Blocked or unclassified tools are never sent to Gemini and cannot
 * execute. A refusal is a structured tool result, never a thrown error.
 */

import type { z } from "zod";

import {
  AI_GOVERNED_CONFIRMATION_REFUSAL,
  getAiToolPolicy,
  isGovernedOrderConfirmation,
  parseSensitiveAiToolArgs,
} from "@/lib/ai/actions/contracts";
import type { AiActionExecutionAuthority } from "@/lib/ai/actions/execution-authority";
import { currentAiActionProposalRuntime } from "@/lib/ai/actions/proposal-runtime";
import type { Phase2Action } from "@/lib/identity/permissions";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import { resolveChatReadAccess, withholdPaths } from "./read-access";
import { aiToolRefusalResult, type AiToolRefusal } from "./tool-refusal";

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
  /**
   * Server-minted actor of the current chat session. The chat routes always
   * set it; read tools are then limited to what this actor may open in the
   * normal UI. Callers that authorize on their own before executing (the MCP
   * surface resolves scopes per tool first) may omit it.
   */
  actor?: TrustedActorContext;
  /** Legacy sealed authority retained for source compatibility only. */
  aiActionExecution?: AiActionExecutionAuthority;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /**
   * Set only by the registry gate: the call was refused or the proposal could
   * not be created. The agent turns it into a model-readable tool result.
   */
  refusal?: AiToolRefusal;
}

export interface ChatTool {
  definition: ToolDefinition;
  execute: (
    params: Record<string, unknown>,
    ctx: ToolContext,
  ) => Promise<ToolResult>;
}

const registry = new Map<string, ChatTool>();

const REMOTE_CONVERSATION_MESSAGES_DESCRIPTION =
  "Read privacy-safe context signals for recent conversation messages. Returns direction, timestamps, extraction flags, and bounded semantic tags/attributes. Verbatim message body text stays local and is not exposed to the remote model; use this for coarse context only, not exact-message summarization or drafting that requires the customer's original wording.";

function legacyVitestHarness(): boolean {
  return (
    (process.env.NODE_ENV === "test" || process.env.VITEST === "true") &&
    process.env.SF_AI_ACTION_POLICY_TEST !== "true"
  );
}

function refused(refusal: AiToolRefusal): ToolResult {
  return {
    success: false,
    error: aiToolRefusalResult(refusal).error,
    refusal,
  };
}

/**
 * Permission probe for one actor. Anything other than a plain "yes" is a "no":
 * an invalid policy or an untrusted context must refuse, not throw out of the
 * turn and not allow.
 *
 * The identity module is loaded on first use (it pulls in the session and
 * database authority), so importing this registry stays as light as before for
 * every caller that never passes an actor.
 */
async function permissionProbe(
  actor: TrustedActorContext,
): Promise<(action: Phase2Action) => boolean> {
  const { trustedActionAllowed } = await import(
    "@/lib/identity/authorization"
  );
  const resource = { shopId: actor.shop.shopId };
  return (action) => {
    try {
      return trustedActionAllowed(actor, action, resource);
    } catch {
      return false;
    }
  };
}

/** Grants the proposal service demands before it creates a proposal. */
function proposalPermissions(
  required: readonly Phase2Action[],
): Phase2Action[] {
  return [...new Set<Phase2Action>(["approvals.request", "ai.use", ...required])];
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
      const actor = context.actor;
      if (!actor) return tool.execute(rawParams, context);

      const access = resolveChatReadAccess(
        tool.definition.name,
        await permissionProbe(actor),
      );
      if (!access.allowed) {
        return refused({
          code: "AI_TOOL_NOT_PERMITTED",
          missingPermissions: access.missing,
        });
      }
      const result = await tool.execute(rawParams, context);
      return result.success && access.withheldPaths.length > 0
        ? { ...result, data: withholdPaths(result.data, access.withheldPaths) }
        : result;
    }

    // The body knows `confirmed` and refuses it. Return that refusal before
    // argument parsing so a governed confirmation never becomes a proposal
    // and never throws out of the agent as an internal error.
    if (isGovernedOrderConfirmation(tool.definition.name, rawParams)) {
      return {
        success: false,
        error: AI_GOVERNED_CONFIRMATION_REFUSAL,
      };
    }

    // Malformed arguments keep their coded validation error (the routes map it
    // to a 400), so parse first. Nothing is persisted before the check below.
    const params = parseSensitiveAiToolArgs(tool.definition.name, rawParams);

    // A member who cannot request this action gets a readable refusal before
    // any proposal is created (the proposal service checks the same grants
    // again; this only makes the outcome a tool result).
    const can = context.actor ? await permissionProbe(context.actor) : null;
    if (can) {
      const missing = proposalPermissions(policy.requiredPermissions).filter(
        (action) => !can(action),
      );
      if (missing.length > 0) {
        return refused({
          code: "AI_PROPOSAL_NOT_PERMITTED",
          missingPermissions: missing,
        });
      }
    }

    const runtime = currentAiActionProposalRuntime();
    if (!runtime) {
      throw new SahelFlowError(
        "Sensitive AI actions require an exact persisted request context",
        "AI_ACTION_PROPOSAL_RUNTIME_REQUIRED",
        409,
      );
    }
    let handle: Awaited<ReturnType<typeof runtime.createProposal>>;
    try {
      handle = await runtime.createProposal(tool.definition.name, params);
    } catch (error) {
      // S06a-03: a coded refusal of the proposal service (missing grant, record
      // not found, stale request message, ...) is something the model can
      // explain to the seller. Server faults (5xx) and unexpected errors still
      // propagate as internal errors.
      if (error instanceof SahelFlowError && error.statusCode < 500) {
        if (error.code === "ACTION_FORBIDDEN") {
          return refused({
            code: "AI_PROPOSAL_NOT_PERMITTED",
            missingPermissions: can
              ? proposalPermissions(policy.requiredPermissions).filter(
                  (action) => !can(action),
                )
              : [],
          });
        }
        return refused({ code: "AI_PROPOSAL_REJECTED", reasonCode: error.code });
      }
      throw error;
    }
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
 * Definitions whose local implementation returns privacy-sensitive fields are
 * narrowed here to match the actual remote projection contract.
 */
export function getAllToolDefinitions(): ToolDefinition[] {
  return listTools().flatMap((tool) => {
    const policy = getAiToolPolicy(tool.definition.name);
    if (policy.executionClass === "blocked") return [];
    const { requiresConfirmation: _legacy, ...definition } = tool.definition;
    if (definition.name === "get_conversation_messages") {
      return [
        {
          ...definition,
          description: REMOTE_CONVERSATION_MESSAGES_DESCRIPTION,
        },
      ];
    }
    return [definition];
  });
}

export type ToolParams<T extends z.ZodType> = z.infer<T>;
