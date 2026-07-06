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
 */
import "server-only";
import { db } from "@/lib/db";
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

/**
 * Record an audit entry. Best-effort: failures are swallowed (an audit log
 * must never break the business operation it's recording).
 *
 * @example
 * await logAudit({
 *   action: "order.status.changed",
 *   entity: "order",
 *   entityId: order.id,
 *   actor: "user",
 *   before: { status: "pending" },
 *   after: { status: "confirmed" },
 *   metadata: { reason: "bulk confirm" },
 * });
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
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
  } catch {
    // Best-effort: never throw. An audit-log failure must not break the
    // business operation it is recording.
  }
}

/**
 * Fire-and-forget variant — for use in non-awaited call sites.
 * `void logAudit(...)` works too, but this makes intent explicit.
 */
export function logAuditAsync(entry: AuditEntry): void {
  void logAudit(entry);
}

/**
 * Fetch the audit timeline for an entity (used by order/customer detail pages).
 */
export async function getEntityTimeline(
  entity: string,
  entityId: string,
  limit = 50,
): Promise<AuditLogRow[]> {
  try {
    return await db.auditLog.findMany({
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
