import type { DbClient } from "@/lib/db";
import { emitNotificationEvent, type NotificationEmitClient } from "./emit";
import { TO_CONFIRM_AFTER_MS, TO_CONFIRM_ALERT_EVERY_MS } from "./event-kinds";
import { isInQuietHours, type QuietWindow } from "./quiet-hours";

export type ToConfirmClient = Pick<DbClient, "order"> & NotificationEmitClient;

/**
 * Time sweep for "N orders wait for your confirmation". Run at the top of synchronizeNotifications, which the
 * seller's app calls on every poll. An order counts after TO_CONFIRM_AFTER_MS in `pending` (drafts, cancelled,
 * confirmed and deleted orders are other states and never count). One grouped alert per TO_CONFIRM_ALERT_EVERY_MS
 * (the hour bucket is the variant of the event key), nothing inside the quiet window (the module's own
 * isInQuietHours), nothing when no order is waiting. The number in the sentence is counted live when the list is read.
 */
export async function sweepOrdersToConfirm(
  client: ToConfirmClient,
  input: { now: Date; window: QuietWindow; shopId?: string },
): Promise<{ emitted: boolean; waiting: number }> {
  if (isInQuietHours(input.window, input.now)) return { emitted: false, waiting: 0 };
  const waiting = await client.order.count({
    where: { status: "pending", deletedAt: null, createdAt: { lte: new Date(input.now.getTime() - TO_CONFIRM_AFTER_MS) } },
  });
  if (waiting === 0) return { emitted: false, waiting };
  const variant = `h${Math.floor(input.now.getTime() / TO_CONFIRM_ALERT_EVERY_MS)}`;
  const result = await emitNotificationEvent(client, { kind: "orders.toConfirm", shopId: input.shopId, at: input.now, subject: "orders", variant });
  return { emitted: result.emitted, waiting };
}
