/**
 * MCP agent transcript (FD-063).
 *
 * `createAiActionProposal` binds a proposal to an exact persisted user request
 * message and derives the 10-minute TTL from that message's timestamp. That is
 * a deliberate authority rule, not an implementation detail of the chat UI: a
 * proposal must always point at a durable record of what asked for it.
 *
 * An MCP invocation therefore persists its own request record. The transcript
 * is an `AiChatSession` per agent connection plus one `AiChatMessage` per
 * sensitive invocation, so the Agents workspace shows exactly which agent call
 * a pending approval came from.
 *
 * Only the redacted invocation line is persisted here. The real arguments live
 * sealed inside the proposal envelope.
 */
import "server-only";

import type { DbClient } from "@/lib/db";
import { redactForAudit } from "./audit";
import type { McpAgentSession } from "./agent-session";

const TRANSCRIPT_TITLE_PREFIX = "MCP agent";

export function mcpTranscriptSessionId(session: McpAgentSession): string {
  return `mcp_${session.agentId}`;
}

async function ensureTranscriptSession(
  db: DbClient,
  session: McpAgentSession,
): Promise<string> {
  const id = mcpTranscriptSessionId(session);
  const title = `${TRANSCRIPT_TITLE_PREFIX} — ${session.client.name ?? "unknown client"}`;
  await db.aiChatSession.upsert({
    where: { id },
    create: { id, title },
    update: {},
  });
  return id;
}

export interface McpTranscriptRequest {
  sessionId: string;
  requestMessageId: string;
}

/**
 * Persist the request record one sensitive invocation will be bound to.
 */
export async function recordMcpToolRequest(
  db: DbClient,
  session: McpAgentSession,
  toolName: string,
  args: unknown,
): Promise<McpTranscriptRequest> {
  const sessionId = await ensureTranscriptSession(db, session);
  const message = await db.aiChatMessage.create({
    data: {
      sessionId,
      role: "user",
      content: JSON.stringify({
        via: "mcp",
        tool: toolName,
        agent: session.agentActor,
        client: session.client,
        args: redactForAudit(args),
      }),
    },
    select: { id: true },
  });
  return { sessionId, requestMessageId: message.id };
}
