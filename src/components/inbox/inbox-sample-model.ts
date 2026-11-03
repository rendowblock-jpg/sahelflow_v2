import { isDemoId } from "@/lib/demo/demo-tag";

/**
 * F-0030: pure helpers that tell the inbox which rows are sample data and keep
 * them below the seller's real conversations. The tag is the `demo-` id prefix
 * the demo lifecycle already deletes by (`@/lib/demo/demo-tag`).
 */
export function isSampleChat(chat: { conversationId: string }): boolean {
  return isDemoId(chat.conversationId);
}

/**
 * Stable partition: real rows first, sample rows after. The relative order
 * inside each group is untouched, so a shop without sample data gets back
 * exactly the order it had. Never mutates its input.
 */
export function sampleRowsLast<T extends { conversationId: string }>(
  rows: readonly T[],
): T[] {
  const real: T[] = [];
  const sample: T[] = [];
  for (const row of rows) (isSampleChat(row) ? sample : real).push(row);
  return sample.length === 0 ? real : [...real, ...sample];
}

/**
 * The queue order: real before sample, then (INB-12) pinned first inside each
 * group. `Array.prototype.sort` is stable, so the server's recency order
 * survives inside every group. A pinned sample row never outranks a real one.
 */
export function compareQueueRows(
  a: { conversationId: string; pinned: boolean },
  b: { conversationId: string; pinned: boolean },
): number {
  return (
    Number(isSampleChat(a)) - Number(isSampleChat(b)) ||
    Number(b.pinned) - Number(a.pinned)
  );
}

export function orderQueueRows<
  T extends { conversationId: string; pinned: boolean },
>(rows: readonly T[]): T[] {
  return [...rows].sort(compareQueueRows);
}
