import type { DbClient } from "@/lib/db";
import { HELD_SEND_EFFECT_TYPES } from "@/lib/connected-platform/phone-today-counts";
import { startOfShopDay } from "@/lib/time/shop-day";
import { SEND_GUARD_HOLD_ERROR_CODE } from "@/lib/whatsapp/send-guard";
import {
  KIND_SPECS,
  asSeverity,
  bucketStartMs,
  kindOfEventType,
  toConfirmSeverity,
  type NotificationKind,
  type NotificationSeverity,
} from "./event-kinds";

// Taken from the real (extended) client so `db` and a transaction handle both fit.
export type LiveClient = Pick<DbClient, "order" | "delivery" | "message" | "outboxIntent">;

export interface LiveEventInput {
  eventType: string;
  severity: string;
  occurredAt: Date;
  targetId: string;
}

export interface LiveEventState {
  kind: NotificationKind | null;
  /** null when the sentence has no number (or the kind has no live source yet) */
  count: number | null;
  severity: NotificationSeverity;
  /** the situation the row talks about still exists */
  stillTrue: boolean;
}

export const FAILED_DELIVERY_STATUSES = ["failed", "booking_failed", "dead_letter", "returned"];

/**
 * The number in a sentence is counted when the list is read, never frozen when
 * the marker was written: 40 imported orders are one row that says "40".
 */
export async function resolveLiveEventState(
  client: LiveClient,
  event: LiveEventInput,
  now: Date = new Date(),
): Promise<LiveEventState> {
  const kind = kindOfEventType(event.eventType);
  const base = asSeverity(event.severity);
  if (!kind) return { kind: null, count: null, severity: base, stillTrue: true };
  const bucketMinutes = KIND_SPECS[kind].bucketMinutes;
  const from = new Date(bucketStartMs(event.occurredAt.getTime(), bucketMinutes ?? 1));
  const to = new Date(from.getTime() + (bucketMinutes ?? 1) * 60_000);
  switch (kind) {
    case "order.new": {
      const count = await client.order.count({
        where: { createdAt: { gte: from, lt: to }, deletedAt: null, source: { not: "manual" } },
      });
      return { kind, count, severity: base, stillTrue: count > 0 };
    }
    case "orders.toConfirm": {
      const where = { status: "pending", deletedAt: null };
      const [count, oldest] = await Promise.all([
        client.order.count({ where }),
        client.order.findFirst({ where, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      ]);
      const age = oldest ? now.getTime() - oldest.createdAt.getTime() : 0;
      return { kind, count, severity: toConfirmSeverity(age), stillTrue: count > 0 };
    }
    case "whatsapp.held": {
      // Counted from the rows: Release and Discard take a send out of this state, so the number drops by itself.
      const count = await client.outboxIntent.count({
        where: { status: "failed", outcomeState: "none", lastErrorCode: SEND_GUARD_HOLD_ERROR_CODE, effectType: { in: [...HELD_SEND_EFFECT_TYPES] } },
      });
      return { kind, count, severity: base, stillTrue: count > 0 };
    }
    case "delivery.failed": {
      const count = await client.delivery.count({
        where: {
          status: { in: FAILED_DELIVERY_STATUSES },
          deletedAt: null,
          updatedAt: { gte: startOfShopDay(event.occurredAt) },
        },
      });
      return { kind, count, severity: base, stillTrue: count > 0 };
    }
    case "whatsapp.received": {
      const count = await client.message.count({
        where: { conversationId: event.targetId, direction: "inbound", createdAt: { gte: from, lt: to } },
      });
      return { kind, count, severity: base, stillTrue: count > 0 };
    }
    case "licence.ending": {
      // targetId holds the threshold told ("7", "3", "1" or "expired").
      const days = /^\d{1,2}$/.test(event.targetId) ? Number(event.targetId) : null;
      return { kind, count: days, severity: base, stillTrue: true };
    }
    default:
      return { kind, count: null, severity: base, stillTrue: true };
  }
}
