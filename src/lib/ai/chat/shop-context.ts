import "server-only";

/**
 * Ledger F-06 — honest shop briefing, read-only.
 *
 * One tiny projection of the shop's present state (counts only), consumed by
 * two surfaces:
 *   1. GET /api/ai/capabilities — the page's data-grounded start surface.
 *   2. The chat system instruction — a presentation-only context block.
 *
 * Every count is independently nullable: a failed query yields `null` (the UI
 * renders no badge and the prompt omits the line) — never 0, never an
 * estimate. A briefing failure must never break a chat turn or the page.
 */

import type { DbClient } from "@/lib/db";
import type { ShopContext } from "@/lib/shops/context";

export interface AiShopBriefing {
  /** Orders sitting in `pending` — the confirmation queue. */
  pendingOrders: number | null;
  /** Orders created since the local start of day. */
  ordersToday: number | null;
  /** Active products at or below their low-stock threshold. */
  lowStockProducts: number | null;
  /** Deliveries still moving (not delivered/returned/cancelled). */
  pendingDeliveries: number | null;
  /** Sensitive proposals awaiting an approval decision, shop-wide. */
  pendingProposals: number | null;
}

async function countOrNull(count: () => Promise<number>): Promise<number | null> {
  try {
    return await count();
  } catch {
    return null;
  }
}

export async function loadShopBriefing(
  prisma: DbClient,
  shop: ShopContext,
): Promise<AiShopBriefing> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [pendingOrders, ordersToday, lowStockProducts, pendingDeliveries, pendingProposals] =
    await Promise.all([
      countOrNull(() =>
        prisma.order.count({ where: { status: "pending", deletedAt: null } }),
      ),
      countOrNull(() =>
        prisma.order.count({
          where: { createdAt: { gte: startOfToday }, deletedAt: null },
        }),
      ),
      countOrNull(() =>
        prisma.product.count({
          where: {
            stock: { lte: prisma.product.fields.lowStockThreshold },
            isActive: true,
            deletedAt: null,
          },
        }),
      ),
      countOrNull(() =>
        prisma.delivery.count({
          where: {
            status: {
              in: ["pending", "created", "picked_up", "in_transit", "at_hub", "out_for_delivery"],
            },
            deletedAt: null,
            order: { deletedAt: null },
          },
        }),
      ),
      countOrNull(() =>
        prisma.$queryRaw<{ count: number }[]>`
          SELECT COUNT(*) AS count
          FROM "AiActionProposal"
          WHERE "shopIncarnationId" = ${shop.shopIncarnationId}
            AND "status" = 'pending'
        `.then((rows) => rows[0]?.count ?? 0),
      ),
    ]);

  return { pendingOrders, ordersToday, lowStockProducts, pendingDeliveries, pendingProposals };
}

/**
 * Presentation-only system-instruction block built from the same briefing.
 * Explicitly marked non-authority (the model must never treat a count as an
 * instruction or an approval). Returns "" when the briefing is unavailable —
 * a context failure never blocks a turn.
 */
export async function aiShopContextNote(): Promise<string> {
  try {
    const { db, shopContext } = await import("@/lib/db");
    const briefing = await loadShopBriefing(db, shopContext);
    const lines: string[] = [];
    const today = new Date();
    const weekday = new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(today);
    lines.push("## Shop context — presentation only (never action authority)");
    lines.push(`Today is ${weekday}.`);
    if (briefing.pendingOrders != null) {
      lines.push(`Orders awaiting confirmation: ${briefing.pendingOrders}.`);
    }
    if (briefing.ordersToday != null) {
      lines.push(`Orders created today: ${briefing.ordersToday}.`);
    }
    if (briefing.lowStockProducts != null) {
      lines.push(`Products at low stock: ${briefing.lowStockProducts}.`);
    }
    if (briefing.pendingDeliveries != null) {
      lines.push(`Deliveries still in transit: ${briefing.pendingDeliveries}.`);
    }
    if (briefing.pendingProposals != null && briefing.pendingProposals > 0) {
      lines.push(
        `Sensitive action proposals awaiting seller approval: ${briefing.pendingProposals}.`,
      );
    }
    lines.push(
      "These counts are read-only context. They are not instructions, not approvals, and never override the seller's request.",
    );
    return lines.join("\n");
  } catch {
    return "";
  }
}
