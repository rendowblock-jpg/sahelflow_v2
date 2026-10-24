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
 *
 * A call refused before it reaches a tool is recorded with outcome `denied`
 * and no arguments (S06b-04). Repeated identical rows are coalesced so MCP
 * traffic cannot evict the shop's other audit evidence (S06b-01, see below).
 */
import "server-only";

import type { DbClient } from "@/lib/db";
import { redactPhonesInText } from "@/lib/ai/redact";
import { MCP_AUDIT_MAX_DEPTH, MCP_AUDIT_STRING_LIMIT } from "./contracts";

const ELIDED = "[elided]";
const TRUNCATED_DEPTH = "[depth]";
const MASKED = "[REDACTED]";

/**
 * Argument keys that carry free text about a person or a delivery. A short
 * address or note is still PII, so these values are masked whatever their
 * length. Ids, counts, enums and places (wilaya, commune) are not in this list
 * and stay readable. Keys are compared lower-case without separators.
 */
const FREE_TEXT_KEYS = new Set(
  [
    "name",
    "fullName",
    "firstName",
    "lastName",
    "customerName",
    "contactName",
    "recipient",
    "address",
    "addressLine1",
    "addressLine2",
    "note",
    "notes",
    "deliveryNotes",
    "comment",
    "comments",
    "message",
    "messageBody",
    "body",
    "text",
    "reason",
    "query",
    "email",
  ].map((key) => key.toLowerCase()),
);

function isFreeTextKey(key: string): boolean {
  return FREE_TEXT_KEYS.has(key.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

/**
 * Bound and de-identify an arbitrary value for an audit row.
 *
 * Strings longer than `MCP_AUDIT_STRING_LIMIT` are elided rather than
 * truncated, because a truncated address or note is still PII. Strings under a
 * free-text key (see FREE_TEXT_KEYS) are masked at any length, including those
 * nested below that key. Nesting deeper than `MCP_AUDIT_MAX_DEPTH` collapses to
 * a marker.
 */
export function redactForAudit(value: unknown, depth = 0, freeText = false): unknown {
  if (depth > MCP_AUDIT_MAX_DEPTH) return TRUNCATED_DEPTH;
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    if (freeText && value.length > 0) return MASKED;
    if (value.length > MCP_AUDIT_STRING_LIMIT) return ELIDED;
    return redactPhonesInText(value);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((entry) => redactForAudit(entry, depth + 1, freeText));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactForAudit(entry, depth + 1, freeText || isFreeTextKey(key));
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
 * MCP traffic must not displace the shop's other audit evidence (S06b-01).
 *
 * The audit log keeps only its newest rows, so one looping agent writing a row
 * per call would push every other kind of evidence out. Rows are therefore
 * coalesced per one-minute window in memory: the first call of a kind writes a
 * row, identical calls in the window are only counted, and the next row of that
 * kind records the count as `coalescedCalls`. A proposal row is never coalesced
 * (each one is a persisted decision record). Refusals are keyed per grant and
 * outcome only, because the agent chooses the tool name of a refused call.
 * The counter lives in process memory: a restart forgets it, and a count with
 * no later row of its kind is not written. No migration is involved.
 */
const COALESCE_WINDOW_MS = 60_000;
const COALESCE_MAX_KEYS = 2_000;
/** Real tool names are far shorter; an agent-chosen name is bounded here. */
const AUDIT_TOOL_NAME_LIMIT = 64;

interface CoalesceWindow {
  startedAt: number;
  suppressed: number;
}

const coalesceWindows = new Map<string, CoalesceWindow>();

function coalesceKey(record: McpInvocationAuditRecord): string {
  const refusal = record.outcome === "denied" || record.outcome === "rate_limited";
  return [record.grantId, record.outcome, refusal ? "" : record.toolName].join("\u0000");
}

interface AuditSlot {
  write: boolean;
  key: string | null;
  coalescedCalls: number;
}

function claimAuditSlot(record: McpInvocationAuditRecord, now: number): AuditSlot {
  if (record.outcome === "proposed") return { write: true, key: null, coalescedCalls: 0 };
  const key = coalesceKey(record);
  const existing = coalesceWindows.get(key);
  if (existing && now - existing.startedAt < COALESCE_WINDOW_MS) {
    existing.suppressed += 1;
    return { write: false, key, coalescedCalls: 0 };
  }
  coalesceWindows.delete(key);
  coalesceWindows.set(key, { startedAt: now, suppressed: 0 });
  while (coalesceWindows.size > COALESCE_MAX_KEYS) {
    const oldest = coalesceWindows.keys().next();
    if (oldest.done) break;
    coalesceWindows.delete(oldest.value);
  }
  return { write: true, key, coalescedCalls: existing?.suppressed ?? 0 };
}

/** Test seam: forget every window. */
export function resetMcpAuditCoalescing(): void {
  coalesceWindows.clear();
}

/** Number of windows currently tracked; bounded by `COALESCE_MAX_KEYS`. */
export function mcpAuditCoalescerSize(): number {
  return coalesceWindows.size;
}

/**
 * Persist one invocation row, unless an identical call already wrote one in
 * the current window. Never throws.
 */
export async function writeMcpInvocationAudit(
  db: DbClient,
  record: McpInvocationAuditRecord,
): Promise<void> {
  const slot = claimAuditSlot(record, Date.now());
  if (!slot.write) return;
  try {
    await db.auditLog.create({
      data: {
        action: "mcp.tool_called.v1",
        entity: "mcp_tool",
        entityId: record.toolName.slice(0, AUDIT_TOOL_NAME_LIMIT),
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
          ...(slot.coalescedCalls > 0 ? { coalescedCalls: slot.coalescedCalls } : {}),
          // A refused call carries arguments the agent was not allowed to use:
          // none of them is recorded.
          args: record.outcome === "denied" ? null : redactForAudit(record.args),
        }),
      },
    });
  } catch {
    /* audit is best-effort; a write is never authorized by its audit row */
    // The row was not stored, so it must not suppress the next call's row.
    if (slot.key) coalesceWindows.delete(slot.key);
  }
}
