import "server-only";

import type { DbClient } from "@/lib/db";

/**
 * Product stock-adjustment history (R3-c).
 *
 * There is no StockEvent/StockMovement model yet (adding one requires a Prisma
 * migration, deliberately out of scope). What DOES exist is the AuditLog
 * table: explicit stock mutations already record append-only rows —
 *
 *   - "product.stock.adjusted"          — AI chat tool (actor "ai_assistant"),
 *                                         before/after {stock}, metadata.reason
 *   - "ai.product.stock_adjusted.v1"    — governed AI action (command kernel),
 *                                         before/after {stock, variantStock}
 *
 * Order-driven movements (productService.deductStock / restoreStock) and plain
 * manual product edits do NOT write audit rows today, so the history below is
 * explicitly partial — the product page says so next to the table. A proper
 * movement ledger (source: order/manual/AI, actor, delta, reason) needs a
 * schema addition and is deferred.
 */

/** Who/what produced the audit row that changed stock. */
export type StockEventSource =
  | "ai_assistant"
  | "ai_action"
  | "manual"
  | "other";

export interface StockAuditRow {
  id: string;
  action: string;
  actor: string | null;
  before: string | null;
  after: string | null;
  metadata: string | null;
  createdAt: Date;
}

export interface ProductStockEvent {
  id: string;
  createdAt: Date;
  /** after.stock - before.stock; null when either snapshot is missing. */
  delta: number | null;
  fromStock: number | null;
  toStock: number | null;
  /** Free-text reason from the audit metadata, when recorded. */
  reason: string | null;
  source: StockEventSource;
  /** Raw audit actor identity (e.g. "ai_assistant", "person:...", "system:..."). */
  actor: string | null;
  action: string;
}

function parseJsonField(value: string | null): Record<string, unknown> | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function parseStockValue(snapshot: Record<string, unknown> | null): number | null {
  const stock = snapshot?.stock;
  if (typeof stock === "number" && Number.isFinite(stock)) return stock;
  return null;
}

function parseReason(metadata: Record<string, unknown> | null): string | null {
  const reason = metadata?.reason;
  if (typeof reason === "string" && reason.trim().length > 0) {
    return reason.trim();
  }
  return null;
}

function classifySource(action: string, actor: string | null): StockEventSource {
  if (action === "ai.product.stock_adjusted.v1") return "ai_action";
  if (action === "product.stock.adjusted") {
    return actor === "ai_assistant" ? "ai_assistant" : "manual";
  }
  return "other";
}

/**
 * Pure derivation: turn product-scoped audit rows into stock events.
 * A row qualifies when its action mentions stock OR its before/after
 * snapshots carry a numeric "stock" that actually changed.
 */
export function deriveStockEventsFromAuditRows(
  rows: readonly StockAuditRow[],
): ProductStockEvent[] {
  const events: ProductStockEvent[] = [];
  for (const row of rows) {
    const before = parseJsonField(row.before);
    const after = parseJsonField(row.after);
    const fromStock = parseStockValue(before);
    const toStock = parseStockValue(after);
    const mentionsStock = row.action.toLowerCase().includes("stock");
    const stockChanged =
      fromStock !== null && toStock !== null && fromStock !== toStock;
    if (!mentionsStock && !stockChanged) continue;

    events.push({
      id: row.id,
      createdAt: row.createdAt,
      fromStock,
      toStock,
      delta: stockChanged ? toStock - fromStock : null,
      reason: parseReason(parseJsonField(row.metadata)),
      source: classifySource(row.action, row.actor),
      actor: row.actor,
      action: row.action,
    });
  }
  return events;
}

/** How many audit rows to scan so the latest-20 derivation stays cheap. */
const AUDIT_SCAN_LIMIT = 120;
const DEFAULT_HISTORY_LIMIT = 20;

/**
 * Load the latest stock adjustments for a product from the audit trail.
 * Best-effort like the rest of the audit layer: any failure degrades to an
 * empty history rather than breaking the product page.
 */
export async function getProductStockHistory(
  prisma: DbClient,
  productId: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
): Promise<ProductStockEvent[]> {
  try {
    const rows = await prisma.auditLog.findMany({
      where: { entity: "product", entityId: productId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: AUDIT_SCAN_LIMIT,
      select: {
        id: true,
        action: true,
        actor: true,
        before: true,
        after: true,
        metadata: true,
        createdAt: true,
      },
    });
    return deriveStockEventsFromAuditRows(rows).slice(
      0,
      Math.max(1, Math.min(limit, AUDIT_SCAN_LIMIT)),
    );
  } catch {
    return [];
  }
}
