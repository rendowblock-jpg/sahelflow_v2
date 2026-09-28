/**
 * MCP agent session identity (FD-063).
 *
 * The EX-5 study named the missing component: ingress that gives an external
 * agent a durable identity without giving it *person* authority. This is that
 * boundary.
 *
 * Slice 1 shape:
 *
 *   - the local sidecar holds a launch-scoped bearer token (loopback only) and
 *     forwards the desktop's authenticated session, so the agent always acts
 *     inside an exact Founder-authorized session. No cookie, no tools;
 *   - the agent gets its own **non-person** audit identity (`agent:<id>`). That
 *     identity is what lands in every `mcp.tool_called.v1` row, so agent work
 *     is never indistinguishable from a human click in the audit trail;
 *   - permission decisions still run against the server-minted person context,
 *     because a `TrustedActorContext` may only be minted by the identity layer
 *     and an agent must never widen a human's ceiling;
 *   - `assertMcpNeverApprover()` is the structural rule: this surface may not
 *     even consider approval authority.
 *
 * MCP-12 adds the durable `McpAgentGrant`: a session opens only for a named,
 * unrevoked grant, its agent identity is derived from that grant (so one agent
 * keeps one audit identity across reconnects), and the grant's tool list
 * narrows what the session can see and call. It changes who may open a
 * session and how far it reaches, never the gate itself.
 */
import "server-only";

import { createHash } from "node:crypto";

import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import type { Phase2Action } from "@/lib/identity/permissions";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import { SahelFlowError } from "@/types/errors";
import { MCP_FORBIDDEN_PERMISSIONS } from "./contracts";
import type { McpAgentGrantBinding } from "./grants";

export interface McpClientIdentity {
  name: string | null;
  version: string | null;
}

export interface McpAgentSession {
  /** Stable, non-reversible identity of this agent connection. */
  agentId: string;
  /** Non-person audit identity. */
  agentActor: string;
  /** Person audit identity whose session authorized the agent. */
  onBehalfOf: string;
  client: McpClientIdentity;
  /** Server-minted person context used for every permission decision. */
  actorContext: TrustedActorContext;
  /** Rate-limit subject. */
  rateLimitSubject: string;
  /** The grant this session opened under; its tools bound what it may reach. */
  grant: McpAgentGrantBinding;
}

function boundedLabel(value: unknown, max = 64): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return /^[\w .:@+/-]+$/.test(trimmed) ? trimmed : null;
}

/** Bound and sanitize the client's self-declared name and version. */
export function normalizeMcpClient(
  client: { name?: unknown; version?: unknown } | undefined,
): McpClientIdentity {
  return {
    name: boundedLabel(client?.name),
    version: boundedLabel(client?.version, 32),
  };
}

/**
 * An MCP requirement may never include approval authority. Called at
 * registration time and again before execution, so a future edit to the scope
 * tables cannot quietly make the agent an approver.
 */
export function assertMcpNeverApprover(
  requires: readonly Phase2Action[],
): void {
  for (const forbidden of MCP_FORBIDDEN_PERMISSIONS) {
    if (requires.includes(forbidden)) {
      throw new SahelFlowError(
        "The MCP agent surface may never require approval authority",
        "MCP_AGENT_NEVER_APPROVER",
        500,
      );
    }
  }
}

/**
 * Open an agent session on top of an authenticated person context.
 *
 * The person context must already have been minted by the identity layer; this
 * function never invents authority, it only labels the agent that is borrowing
 * it and pins the audit identity.
 */
export function openMcpAgentSession(input: {
  actorContext: TrustedActorContext;
  client?: { name?: unknown; version?: unknown };
  grant: McpAgentGrantBinding;
}): McpAgentSession {
  if (input.actorContext.actor.kind !== "person") {
    throw new SahelFlowError(
      "The MCP agent surface requires a durable person session",
      "MCP_DURABLE_PERSON_REQUIRED",
      403,
    );
  }
  const client = normalizeMcpClient(input.client);
  const agentId = createHash("sha256")
    .update("sahelflow.mcp.agent-session.v1\0", "utf8")
    .update(input.actorContext.shop.shopIncarnationId, "utf8")
    .update("\0", "utf8")
    .update(input.grant.id, "utf8")
    .digest("hex")
    .slice(0, 32);

  return {
    agentId,
    agentActor: `agent:${agentId}`,
    onBehalfOf: trustedActorAuditIdentity(input.actorContext.actor),
    client,
    actorContext: input.actorContext,
    rateLimitSubject: `mcp:${agentId}`,
    grant: input.grant,
  };
}
