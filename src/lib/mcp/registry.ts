/**
 * MCP tool registry (FD-063).
 *
 * CodFlow-shaped `{ requires, build }` entries over SahelFlow's existing AI
 * tool implementations. There is exactly one tool vocabulary in the product:
 * this module projects it onto MCP, it never forks it.
 *
 * Registration-time scope hiding is the whole point. `buildMcpToolsForSession`
 * evaluates every requirement against the server-minted actor and omits the
 * entry entirely when any requirement is missing, so an MCP client cannot see
 * — let alone call — a tool it is not authorized for. `blocked` tools are never
 * advertised under any authority.
 */
import "server-only";

import {
  getAiToolPolicy,
  type AiToolExecutionClass,
} from "@/lib/ai/actions/contracts";
import {
  getAllToolDefinitions,
  getTool,
  type ToolDefinition,
} from "@/lib/ai/chat/tools/registry";
import { trustedActionAllowed } from "@/lib/identity/authorization";
import type { Phase2Action } from "@/lib/identity/permissions";
import { SahelFlowError } from "@/types/errors";
import { assertMcpNeverApprover, type McpAgentSession } from "./agent-session";
import {
  deriveMcpAnnotations,
  resolveMcpToolRequirements,
  toolOutputJsonSchema,
  type McpToolDescriptor,
} from "./contracts";

export interface McpRegistryEntry {
  name: string;
  executionClass: AiToolExecutionClass;
  /** AND-ed `Phase2Action` requirements. */
  requires: readonly Phase2Action[];
  build: (definition: ToolDefinition) => McpToolDescriptor;
}

let toolModulesLoaded = false;

/**
 * The legacy tool modules register themselves on import. The agent loop does
 * the same thing; MCP must not depend on the chat loop having run first.
 */
export async function ensureMcpToolsRegistered(): Promise<void> {
  if (toolModulesLoaded) return;
  await Promise.all([
    import("@/lib/ai/chat/tools/core-tools"),
    import("@/lib/ai/chat/tools/extended-tools"),
    import("@/lib/ai/chat/tools/advanced-tools"),
  ]);
  toolModulesLoaded = true;
}

function describe(
  definition: ToolDefinition,
  executionClass: AiToolExecutionClass,
): McpToolDescriptor {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.parameters,
    outputSchema: toolOutputJsonSchema(),
    annotations: deriveMcpAnnotations(definition.name, executionClass),
  };
}

/**
 * Build the registry from the live tool definitions.
 *
 * `getAllToolDefinitions()` already drops blocked tools and applies the remote
 * privacy narrowing for `get_conversation_messages`, so MCP inherits both
 * behaviours instead of re-implementing them.
 */
export async function buildMcpRegistry(): Promise<McpRegistryEntry[]> {
  await ensureMcpToolsRegistered();
  return getAllToolDefinitions().map((definition) => {
    const policy = getAiToolPolicy(definition.name);
    const requires = resolveMcpToolRequirements(definition.name);
    assertMcpNeverApprover(requires);
    return {
      name: definition.name,
      executionClass: policy.executionClass,
      requires,
      build: (current: ToolDefinition) =>
        describe(current, policy.executionClass),
    };
  });
}

/**
 * Project the registry for one agent session, hiding everything the caller is
 * not authorized for: a tool must be both inside the agent's grant (MCP-12)
 * and inside the person session's authority.
 */
export async function buildMcpToolsForSession(
  session: McpAgentSession,
): Promise<McpToolDescriptor[]> {
  const registry = await buildMcpRegistry();
  const shopId = session.actorContext.shop.shopId;
  return registry.flatMap((entry) => {
    const permitted =
      session.grant.tools.has(entry.name) &&
      entry.requires.every((action) =>
        trustedActionAllowed(session.actorContext, action, { shopId }),
      );
    if (!permitted) return [];
    const tool = getTool(entry.name);
    if (!tool) return [];
    return [entry.build(tool.definition)];
  });
}

/**
 * Resolve one entry for execution, re-checking authority. A hidden tool that is
 * called anyway is reported as unknown, never as forbidden: the client was never
 * told it exists and must not learn otherwise.
 */
export async function resolveMcpToolForSession(
  session: McpAgentSession,
  toolName: string,
): Promise<McpRegistryEntry> {
  const registry = await buildMcpRegistry();
  const entry = registry.find((candidate) => candidate.name === toolName);
  const shopId = session.actorContext.shop.shopId;
  if (
    !entry ||
    !session.grant.tools.has(entry.name) ||
    !entry.requires.every((action) =>
      trustedActionAllowed(session.actorContext, action, { shopId }),
    )
  ) {
    throw new SahelFlowError(
      `Unknown tool: ${toolName}`,
      "MCP_TOOL_NOT_FOUND",
      404,
    );
  }
  assertMcpNeverApprover(entry.requires);
  return entry;
}
