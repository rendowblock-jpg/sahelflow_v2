/**
 * MCP control surface read model (FD-063, MCP-12/13).
 *
 * What the Agents workspace shows about external agents: which tools a person
 * may grant, and what granted agents actually did. Both are projections of the
 * same authorities the MCP endpoint enforces, never a parallel list:
 *
 *   - the grant catalog is the registry filtered by the viewer's own
 *     authority, so a person can never grant a tool they could not use;
 *   - the invocation log reads the `mcp.tool_called.v1` audit rows. Arguments
 *     stay in the audit row only; the log carries outcome, timing and the
 *     proposal id a sensitive call produced, never call arguments.
 */
import "server-only";

import { aiCapabilityGroups, type AiCapabilityGroupId } from "@/lib/ai/chat/tools/capability-groups";
import type { DbClient } from "@/lib/db";
import { trustedActionAllowed } from "@/lib/identity/authorization";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import { deriveMcpAnnotations, type McpToolAnnotations } from "./contracts";
import { buildMcpRegistry } from "./registry";

export interface McpGrantCatalogEntry {
  name: string;
  group: AiCapabilityGroupId;
  executionClass: string;
  annotations: McpToolAnnotations;
}

export interface McpInvocationView {
  id: string;
  toolName: string;
  agentActor: string;
  grantId: string | null;
  clientName: string | null;
  outcome: string;
  errorCode: string | null;
  proposalId: string | null;
  durationMs: number | null;
  createdAt: string;
}

export const MCP_INVOCATION_LOG_LIMIT = 50;

export async function buildMcpGrantCatalog(
  actorContext: TrustedActorContext,
): Promise<McpGrantCatalogEntry[]> {
  const [registry, groups] = await Promise.all([
    buildMcpRegistry(),
    aiCapabilityGroups(),
  ]);
  const groupByTool = new Map<string, AiCapabilityGroupId>();
  for (const group of groups) {
    for (const tool of group.tools) groupByTool.set(tool.name, group.id);
  }
  const shopId = actorContext.shop.shopId;
  return registry.flatMap((entry) => {
    const group = groupByTool.get(entry.name);
    if (!group) return [];
    const permitted = entry.requires.every((action) =>
      trustedActionAllowed(actorContext, action, { shopId }),
    );
    if (!permitted) return [];
    return [
      {
        name: entry.name,
        group,
        executionClass: entry.executionClass,
        annotations: deriveMcpAnnotations(entry.name, entry.executionClass),
      },
    ];
  });
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function parseMetadata(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function listMcpInvocations(
  db: DbClient,
  limit = MCP_INVOCATION_LOG_LIMIT,
): Promise<McpInvocationView[]> {
  const rows = await db.auditLog.findMany({
    where: { action: "mcp.tool_called.v1" },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), MCP_INVOCATION_LOG_LIMIT),
    select: { id: true, entityId: true, actor: true, metadata: true, createdAt: true },
  });
  return rows.map((row) => {
    const metadata = parseMetadata(row.metadata);
    const client =
      metadata.client && typeof metadata.client === "object"
        ? (metadata.client as Record<string, unknown>)
        : {};
    return {
      id: row.id,
      toolName: row.entityId ?? "",
      agentActor: row.actor ?? "",
      grantId: readString(metadata.grantId),
      clientName: readString(client.name),
      outcome: readString(metadata.outcome) ?? "failed",
      errorCode: readString(metadata.errorCode),
      proposalId: readString(metadata.proposalId),
      durationMs: typeof metadata.durationMs === "number" ? metadata.durationMs : null,
      createdAt: row.createdAt.toISOString(),
    };
  });
}
