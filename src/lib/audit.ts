/**
 * Entity-level audit logging (Phase 0 foundation).
 *
 * `logAudit()` records a mutation on an entity to the AuditLog table, with
 * before/after snapshots for diffing. Powers:
 *   - the order detail timeline (Phase 4)
 *   - the customer activity feed
 *   - the settings danger-zone history (Phase 9)
 *   - the inbox activity messages (Phase 5)
 *
 * The legacy `auditLog()` in auth/server.ts (action + ip + metadata only)
 * remains for auth events; it delegates here with no entity context.
 *
 * Fire-and-forget: never throws, never blocks the caller. Returns void.
 *
 * A swallowed write failure is NOT silent: it leaves one structured, secret-free
 * log line (`audit.write_failed`: action label, failure code, running count; never
 * the error message, the payload, identifiers or the actor) and bumps a counter.
 * Backup, restore and erase deliberately do not depend on the audit table being
 * writable, so the audit is a signal, not a gate.
 */
import "server-only";
import type { ServiceContext } from "@/lib/data/service-base";
import { logger } from "@/lib/logger";
import { redactPii } from "@/lib/redact-pii";

export interface AuditEntry {
  /** Dotted action, e.g. "order.status.changed", "customer.blacklisted". */
  action: string;
  /** Entity type, e.g. "order", "customer", "product". Omit for auth/system events. */
  entity?: string;
  /** The entity's id. */
  entityId?: string;
  /** Who performed it: "system" | "user" | automation id | session id. */
  actor?: string;
  /** Entity state before the mutation (will be JSON-stringified). */
  before?: Record<string, unknown> | null;
  /** Entity state after the mutation (will be JSON-stringified). */
  after?: Record<string, unknown> | null;
  /** Request IP (for security audit). */
  ip?: string | null;
  /** Extra context (reason, from→to, etc.). */
  metadata?: Record<string, unknown> | null;
}

const SAFE_ACTION_LABEL = /^[A-Za-z0-9_.:-]{1,80}$/;
const SAFE_FAILURE_CODE = /^[A-Za-z0-9_]{1,40}$/;
/** Log the first failures, then every 50th, so a long outage stays visible but cheap. */
const LOG_FIRST_FAILURES = 5;
const LOG_EVERY_NTH_FAILURE = 50;

let auditWriteFailures = 0;

/** Number of audit writes swallowed since this process started. */
export function getAuditWriteFailureCount(): number {
  return auditWriteFailures;
}

export function resetAuditWriteFailureCountForTests(): void {
  auditWriteFailures = 0;
}

function auditFailureCode(error: unknown): string {
  if (error && typeof error === "object") {
    const { code, name } = error as { code?: unknown; name?: unknown };
    if (typeof code === "string" && SAFE_FAILURE_CODE.test(code)) return code;
    if (typeof name === "string" && SAFE_FAILURE_CODE.test(name)) return name;
  }
  return "UNKNOWN";
}

function reportSwallowedAuditFailure(action: string, error: unknown): void {
  auditWriteFailures += 1;
  if (
    auditWriteFailures > LOG_FIRST_FAILURES &&
    auditWriteFailures % LOG_EVERY_NTH_FAILURE !== 0
  ) {
    return;
  }
  try {
    logger.warn("audit.write_failed", {
      action: SAFE_ACTION_LABEL.test(action) ? action : "invalid",
      code: auditFailureCode(error),
      failures: auditWriteFailures,
    });
  } catch {
    // Reporting must never break the operation being audited either.
  }
}

/**
 * Record an audit entry. Best-effort: failures are swallowed (an audit log
 * must never break the business operation it's recording) but are counted and
 * reported as a code-only log line.
 *
 * @example
 * await logAudit(context, {
 *   action: "order.status.changed",
 *   entity: "order",
 *   entityId: order.id,
 *   actor: "user",
 *   before: { status: "pending" },
 *   after: { status: "confirmed" },
 *   metadata: { reason: "bulk confirm" },
 * });
 */
export async function logAudit(context: ServiceContext, entry: AuditEntry): Promise<void> {
  try {
    await context.prisma.auditLog.create({
      data: {
        action: entry.action,
        entity: entry.entity ?? null,
        entityId: entry.entityId ?? null,
        actor: entry.actor ?? null,
        // Session 30 (AUDIT-4 D6): redact PII before persisting JSON snapshots
        before: entry.before ? JSON.stringify(redactPii(entry.before)) : null,
        after: entry.after ? JSON.stringify(redactPii(entry.after)) : null,
        ip: entry.ip ?? null,
        metadata: entry.metadata ? JSON.stringify(redactPii(entry.metadata)) : null,
      },
    });
  } catch (error) {
    // Best-effort: never throw. An audit-log failure must not break the
    // business operation it is recording.
    reportSwallowedAuditFailure(entry.action, error);
  }
}

/**
 * Fire-and-forget variant — for use in non-awaited call sites.
 * `void logAudit(...)` works too, but this makes intent explicit.
 */
export function logAuditAsync(context: ServiceContext, entry: AuditEntry): void {
  void logAudit(context, entry);
}

/**
 * Fetch the audit timeline for an entity (used by order/customer detail pages).
 */
export async function getEntityTimeline(
  context: ServiceContext,
  entity: string,
  entityId: string,
  limit = 50,
): Promise<AuditLogRow[]> {
  try {
    return await context.prisma.auditLog.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
  } catch {
    return [];
  }
}

/** Prisma row type (avoids importing the generated type name). */
export type AuditLogRow = {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  actor: string | null;
  before: string | null;
  after: string | null;
  ip: string | null;
  metadata: string | null;
  createdAt: Date;
};
