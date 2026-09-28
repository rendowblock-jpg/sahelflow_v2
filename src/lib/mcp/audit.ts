/**
 * MCP invocation audit (FD-063).
 *
 * One `mcp.tool_called.v1` audit row per invocation, with arguments passed
 * through `redactForAudit`: CodFlow parity bounds of 1024 characters per string
 * and a nesting depth of 8, plus SahelFlow's own phone redaction so an audit
 * row can never become a PII sink.
 *
 * Audit is best-effort by design. A failed audit write must not roll back a
 * completed read, and must never silently convert into a successful *write*:
 * every write still flows through the kernel, which owns its own atomic audit.
 */
import "server-only";

import type { DbClient } from "@/lib/db";
import { redactPhonesInText } from "@/lib/ai/redact";
import { MCP_AUDIT_MAX_DEPTH, MCP_AUDIT_STRING_LIMIT } from "./contracts";

const ELIDED = "[elided]";
const TRUNCATED_DEPTH = "[depth]";

/**
 * Bound and de-identify an arbitrary value for an audit row.
 *
 * Strings longer than `MCP_AUDIT_STRING_LIMIT` are elided rather than
 * truncated, because a truncated address or note is still PII. Nesting deeper
 * than `MCP_AUDIT_MAX_DEPTH` collapses to a marker.
 */
export function redactForAudit(value: unknown, depth = 0): unknown {
  if (depth > MCP_AUDIT_MAX_DEPTH) return TRUNCATED_DEPTH;
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    if (value.length > MCP_AUDIT_STRING_LIMIT) return ELIDED;
    return redactPhonesInText(value);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((entry) => redactForAudit(entry, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactForAudit(entry, depth + 1);
    }
    return out;
  }
  return ELIDED;
}

export interface McpInvocationAuditRecord {
  toolName: string;
  executionClass: string;
  /** Non-person agent audit identity, e.g. `agent:<agentId>`. */
  agentActor: string;
  /** Person audit identity whose session authorized the agent. */
  onBehalfOf: string;
  /** The MCP-12 grant the agent's session opened under. */
  grantId: string;
  clientName: string | null;
  clientVersion: string | null;
  outcome: "succeeded" | "failed" | "proposed" | "denied" | "rate_limited";
  errorCode: string | null;
  proposalId: string | null;
  durationMs: number;
  args: unknown;
}

/**
 * Persist one invocation row. Never throws.
 */
export async function writeMcpInvocationAudit(
  db: DbClient,
  record: McpInvocationAuditRecord,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action: "mcp.tool_called.v1",
        entity: "mcp_tool",
        entityId: record.toolName,
        actor: record.agentActor,
        metadata: JSON.stringify({
          via: "mcp",
          executionClass: record.executionClass,
          onBehalfOf: record.onBehalfOf,
          grantId: record.grantId,
          client: {
            name: record.clientName,
            version: record.clientVersion,
          },
          outcome: record.outcome,
          errorCode: record.errorCode,
          proposalId: record.proposalId,
          durationMs: record.durationMs,
          args: redactForAudit(record.args),
        }),
      },
    });
  } catch {
    /* audit is best-effort; a write is never authorized by its audit row */
  }
}
