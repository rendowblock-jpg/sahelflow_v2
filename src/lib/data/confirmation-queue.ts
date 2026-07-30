/**
 * 2-hour confirmation call queue (Phase 8 — R-1 market research).
 *
 * The #1 lever for reducing COD return rate (cuts refusals 25-35%).
 * Sellers need a queue of unconfirmed orders < 2h old, with WhatsApp
 * template + call script, auto-flagging older orders as "stale".
 *
 * This service provides:
 *   - getConfirmationQueue: orders pending confirmation, sorted by age
 *   - markConfirmed: move order out of the queue
 *   - getStaleOrders: unconfirmed orders > 2h old (need follow-up)
 */
import "server-only";
import { db } from "@/lib/db";

const STALE_THRESHOLD_HOURS = 2;

export async function getConfirmationQueue() {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000);

  const orders = await db.order.findMany({
    where: {
      status: "pending",
      deletedAt: null,
    },
    select: {
      id: true,
      orderNumber: true,
      totalPrice: true,
      wilaya: true,
      phone: true,
      createdAt: true,
      source: true,
      sourceMetadata: true,
      version: true,
      customer: { select: { name: true, phone: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  return orders.map((o) => {
    const ageMinutes = Math.floor((now.getTime() - new Date(o.createdAt).getTime()) / 60000);
    return {
      ...o,
      ageMinutes,
      isStale: new Date(o.createdAt) < staleThreshold,
      ageLabel: formatAge(ageMinutes),
    };
  });
}

export async function getStaleOrderCount(): Promise<number> {
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000);
  return db.order.count({
    where: {
      status: "pending",
      deletedAt: null,
      createdAt: { lt: staleThreshold },
    },
  });
}

function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}
