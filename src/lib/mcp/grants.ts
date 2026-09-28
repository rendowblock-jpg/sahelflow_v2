/**
 * MCP agent grants (FD-063, MCP-12).
 *
 * Slice 1 let any holder of the transport token act with the forwarded person
 * session's full ceiling. A grant closes that gap:
 *
 *   - every MCP session must present a grant secret, so an agent is always a
 *     named, listed, revocable thing rather than "whoever has the token";
 *   - the grant narrows the agent to an explicit tool list. It can only
 *     narrow: the person session is still the ceiling, and registration-time
 *     hiding still applies on top of the grant;
 *   - revocation is instant because it is checked on every request, not
 *     cached in a long-lived session;
 *   - only a domain-separated SHA-256 of the secret is stored. The secret is
 *     returned exactly once, at creation, and never persisted or logged.
 */
import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { DbClient } from "@/lib/db";
import { SahelFlowError } from "@/types/errors";

export const MCP_GRANT_SECRET_PREFIX = "sfa_";
export const MCP_GRANT_LABEL_MAX = 64;
export const MCP_GRANT_ACTIVE_LIMIT = 20;
/** `lastUsedAt` is refreshed at most this often, so reads stay cheap. */
const TOUCH_INTERVAL_MS = 60_000;

const SECRET_PATTERN = /^sfa_[A-Za-z0-9_-]{43}$/;

export interface McpAgentGrantView {
  id: string;
  label: string;
  secretHint: string;
  tools: string[];
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  lastClientName: string | null;
  lastClientVersion: string | null;
  revokedAt: string | null;
  status: "active" | "revoked";
}

/** What an authenticated MCP request carries forward into its session. */
export interface McpAgentGrantBinding {
  id: string;
  label: string;
  tools: ReadonlySet<string>;
}

interface GrantRow {
  id: string;
  label: string;
  secretHint: string;
  toolsJson: string;
  createdBy: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  lastClientName: string | null;
  lastClientVersion: string | null;
  revokedAt: Date | null;
}

export function hashMcpGrantSecret(secret: string): string {
  return createHash("sha256")
    .update("sahelflow.mcp.agent-grant.v1\0", "utf8")
    .update(secret, "utf8")
    .digest("hex");
}

function parseTools(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    // A corrupt tool list grants nothing rather than everything.
    return [];
  }
}

function toView(row: GrantRow): McpAgentGrantView {
  return {
    id: row.id,
    label: row.label,
    secretHint: row.secretHint,
    tools: parseTools(row.toolsJson),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    lastClientName: row.lastClientName,
    lastClientVersion: row.lastClientVersion,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    status: row.revokedAt ? "revoked" : "active",
  };
}

function invalid(message: string, code: string): SahelFlowError {
  return new SahelFlowError(message, code, 400);
}

/**
 * Validate a requested label and tool list against the tools the creating
 * person may grant. A grant can never name a tool its creator could not use.
 */
export function normalizeGrantRequest(
  input: { label?: unknown; tools?: unknown },
  grantableTools: ReadonlySet<string>,
): { label: string; tools: string[] } {
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!label || label.length > MCP_GRANT_LABEL_MAX) {
    throw invalid("Name the agent in 1 to 64 characters", "MCP_GRANT_LABEL_INVALID");
  }
  if (!Array.isArray(input.tools) || input.tools.length === 0) {
    throw invalid("Grant at least one tool", "MCP_GRANT_TOOLS_REQUIRED");
  }
  const tools = new Set<string>();
  for (const entry of input.tools) {
    if (typeof entry !== "string" || !grantableTools.has(entry)) {
      throw invalid(
        "The grant names a tool you cannot grant",
        "MCP_GRANT_TOOL_NOT_GRANTABLE",
      );
    }
    tools.add(entry);
  }
  return { label, tools: [...tools].sort() };
}

export async function listMcpAgentGrants(db: DbClient): Promise<McpAgentGrantView[]> {
  const rows = await db.mcpAgentGrant.findMany({
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
  return rows.map(toView);
}

export async function createMcpAgentGrant(
  db: DbClient,
  input: {
    label: string;
    tools: readonly string[];
    createdBy: string;
    /**
     * Bind the new grant's durable identity (MCP-11). A grant whose identity
     * cannot be bound is deleted again: an unbound grant could never act.
     */
    bindIdentity: (grantId: string) => Promise<unknown>;
  },
): Promise<{ grant: McpAgentGrantView; secret: string }> {
  const active = await db.mcpAgentGrant.count({ where: { revokedAt: null } });
  if (active >= MCP_GRANT_ACTIVE_LIMIT) {
    throw new SahelFlowError(
      "Revoke an agent before connecting another",
      "MCP_GRANT_LIMIT_REACHED",
      409,
    );
  }
  const secret = `${MCP_GRANT_SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;
  const row = await db.mcpAgentGrant.create({
    data: {
      label: input.label,
      secretHash: hashMcpGrantSecret(secret),
      secretHint: secret.slice(-4),
      toolsJson: JSON.stringify([...input.tools]),
      createdBy: input.createdBy,
    },
  });
  try {
    await input.bindIdentity(row.id);
  } catch (error) {
    await db.mcpAgentGrant.delete({ where: { id: row.id } }).catch(() => undefined);
    throw error;
  }
  return { grant: toView(row), secret };
}

export async function revokeMcpAgentGrant(
  db: DbClient,
  id: string,
  revokedBy: string,
  /** Revoke the grant's durable identity binding as well (MCP-11). */
  revokeIdentity: (grantId: string) => Promise<unknown>,
): Promise<McpAgentGrantView> {
  const existing = await db.mcpAgentGrant.findUnique({ where: { id } });
  if (!existing) {
    throw new SahelFlowError("Agent not found", "MCP_GRANT_NOT_FOUND", 404);
  }
  // The row is revoked first: ingress checks it on every request, so access
  // ends even if the identity write below is interrupted, and a retry of this
  // idempotent call finishes the binding revocation.
  const row = existing.revokedAt
    ? existing
    : await db.mcpAgentGrant.update({
        where: { id },
        data: { revokedAt: new Date(), revokedBy },
      });
  await revokeIdentity(id);
  return toView(row);
}

/**
 * Resolve the grant an MCP request presents. Fails closed: a missing,
 * malformed, unknown or revoked secret opens no session.
 */
export async function resolveMcpAgentGrant(
  db: DbClient,
  secret: string | null,
  client: { name: string | null; version: string | null },
): Promise<McpAgentGrantBinding> {
  const presented = secret?.trim() ?? "";
  if (!SECRET_PATTERN.test(presented)) {
    throw new SahelFlowError(
      "This agent has no SahelFlow grant",
      "MCP_AGENT_GRANT_REQUIRED",
      401,
    );
  }
  const row = await db.mcpAgentGrant.findUnique({
    where: { secretHash: hashMcpGrantSecret(presented) },
  });
  if (!row || row.revokedAt) {
    throw new SahelFlowError(
      "This agent's grant is not active",
      "MCP_AGENT_GRANT_INACTIVE",
      401,
    );
  }

  const now = Date.now();
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.mcpAgentGrant
      .update({
        where: { id: row.id },
        data: {
          lastUsedAt: new Date(now),
          lastClientName: client.name,
          lastClientVersion: client.version,
        },
      })
      .catch(() => {
        /* last-used is informational; it never decides authority */
      });
  }

  return { id: row.id, label: row.label, tools: new Set(parseTools(row.toolsJson)) };
}
