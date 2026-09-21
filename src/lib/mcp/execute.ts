/**
 * MCP tool execution (FD-063).
 *
 * Class behaviour, and the reason this surface is safe to expose to a model
 * SahelFlow does not control:
 *
 *   - `read` (19) and `external_read` (2) execute directly, then cross the
 *     remote boundary only through `serializeToolResultForRemoteModel`. That
 *     serializer fails closed: an unclassified tool projects to nothing, so a
 *     future tool cannot leak by default;
 *   - `sensitive` (8) execute **nothing**. The existing registry wrapper routes
 *     them into the request-scoped proposal runtime, which persists one
 *     immutable `AiActionProposal` and returns its digest. A human approves in
 *     the Agents workspace. The MCP client has no approval path at all;
 *   - `blocked` (1) is never advertised and resolves as unknown.
 *
 * Every invocation is rate-limited (fail-open) and audited (best-effort).
 */
import "server-only";

import { createAiActionProposal } from "@/lib/ai/actions/service";
import { runWithAiActionProposalRuntime } from "@/lib/ai/actions/proposal-runtime";
import { serializeToolResultForRemoteModel } from "@/lib/ai/redact";
import { getTool } from "@/lib/ai/chat/tools/registry";
import { db, shopContext } from "@/lib/db";
import { SahelFlowError } from "@/types/errors";
import { writeMcpInvocationAudit } from "./audit";
import { assertMcpNeverApprover, type McpAgentSession } from "./agent-session";
import { mcpToolOutputSchema, type McpToolOutput } from "./contracts";
import { consumeMcpRateLimit } from "./rate-limit";
import { resolveMcpToolForSession } from "./registry";
import { recordMcpToolRequest } from "./transcript";

export interface McpCallOutcome {
  /** Safe-parsed structured content, omitted when the result drifted. */
  structuredContent: McpToolOutput | null;
  /** Always present: the JSON text block. */
  text: string;
  isError: boolean;
}

function envelope(output: McpToolOutput): McpCallOutcome {
  const parsed = mcpToolOutputSchema.safeParse(output);
  return {
    structuredContent: parsed.success ? parsed.data : null,
    text: JSON.stringify(output),
    isError: output.success === false,
  };
}

function failure(error: string): McpCallOutcome {
  return envelope({ success: false, error });
}

function errorCodeOf(error: unknown): string {
  if (error instanceof SahelFlowError) return error.code;
  if (error instanceof Error && error.name) return error.name;
  return "MCP_TOOL_FAILED";
}

function proposalIdOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const proposal = (value as Record<string, unknown>).proposal;
  if (!proposal || typeof proposal !== "object") return null;
  const id = (proposal as Record<string, unknown>).id;
  return typeof id === "string" ? id : null;
}

/**
 * Execute one `tools/call`.
 *
 * Never throws for ordinary tool failure: MCP reports that as a result with
 * `isError: true` so the model can recover. Authority failures still surface as
 * coded errors to the protocol layer.
 */
export async function callMcpTool(
  session: McpAgentSession,
  toolName: string,
  rawArgs: Record<string, unknown>,
): Promise<McpCallOutcome> {
  const startedAt = Date.now();
  const entry = await resolveMcpToolForSession(session, toolName);
  assertMcpNeverApprover(entry.requires);

  const limit = consumeMcpRateLimit(session.rateLimitSubject);
  if (!limit.allowed) {
    await writeMcpInvocationAudit(db, {
      toolName,
      executionClass: entry.executionClass,
      agentActor: session.agentActor,
      onBehalfOf: session.onBehalfOf,
      clientName: session.client.name,
      clientVersion: session.client.version,
      outcome: "rate_limited",
      errorCode: "MCP_RATE_LIMITED",
      proposalId: null,
      durationMs: Date.now() - startedAt,
      args: rawArgs,
    });
    return failure(
      `Rate limit exceeded; retry after ${new Date(limit.resetAt).toISOString()}`,
    );
  }

  const tool = getTool(toolName);
  if (!tool) {
    throw new SahelFlowError(
      `Unknown tool: ${toolName}`,
      "MCP_TOOL_NOT_FOUND",
      404,
    );
  }

  const context = { db, shop: shopContext };
  let outcome: McpCallOutcome;
  let auditOutcome: "succeeded" | "failed" | "proposed" = "succeeded";
  let errorCode: string | null = null;
  let proposalId: string | null = null;

  try {
    let result;
    if (entry.executionClass === "sensitive") {
      // The sensitive verb never runs. The registry wrapper validates the
      // arguments and converts the call into exactly one persisted proposal.
      const request = await recordMcpToolRequest(db, session, toolName, rawArgs);
      result = await runWithAiActionProposalRuntime(
        {
          createProposal: (proposedTool, args) =>
            createAiActionProposal({
              context: { prisma: db, shop: shopContext },
              requester: session.actorContext,
              sessionId: request.sessionId,
              requestMessageId: request.requestMessageId,
              toolName: proposedTool,
              rawArgs: args,
            }),
        },
        () => tool.execute(rawArgs, context),
      );
      auditOutcome = "proposed";
    } else {
      result = await tool.execute(rawArgs, context);
    }

    if (!result.success) {
      auditOutcome = "failed";
      errorCode = "MCP_TOOL_RETURNED_FAILURE";
      outcome = failure(result.error ?? "Tool failed");
    } else {
      const projected = serializeToolResultForRemoteModel(toolName, result.data);
      if (projected === null && result.data !== null) {
        // Fail closed: the remote projection has no reviewed contract for this
        // tool, so nothing crosses the boundary.
        auditOutcome = "failed";
        errorCode = "MCP_REMOTE_PROJECTION_UNAVAILABLE";
        outcome = failure(
          "This tool has no reviewed remote projection and cannot return data to an agent",
        );
      } else {
        proposalId = proposalIdOf(result.data);
        outcome = envelope({ success: true, data: projected });
      }
    }
  } catch (error) {
    auditOutcome = "failed";
    errorCode = errorCodeOf(error);
    outcome = failure(
      error instanceof SahelFlowError ? error.message : "Tool failed",
    );
  }

  await writeMcpInvocationAudit(db, {
    toolName,
    executionClass: entry.executionClass,
    agentActor: session.agentActor,
    onBehalfOf: session.onBehalfOf,
    clientName: session.client.name,
    clientVersion: session.client.version,
    outcome: auditOutcome,
    errorCode,
    proposalId,
    durationMs: Date.now() - startedAt,
    args: rawArgs,
  });

  return outcome;
}
