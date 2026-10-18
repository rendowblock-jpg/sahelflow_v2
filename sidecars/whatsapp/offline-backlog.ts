/**
 * What WhatsApp says it held for this device while it was away.
 *
 * On login the provider sends an `offline_preview` (how many messages,
 * notifications and receipts are waiting) and, when it has delivered them, an
 * `offline` marker with the number it handled. Baileys acts on both but does
 * not report the numbers. Recording them (counts only, never an identity or a
 * body) lets the diagnostics tell apart "the provider had nothing for us" from
 * "the provider had N and fewer reached the inbox": compare `offline.preview`
 * and `offline.done` with `inbound.upsert`, `inbound.early` and
 * `inbound.spooled`.
 *
 * Pure, so it can be tested without a socket.
 */
const COUNT_NAMES = [
  "total",
  "message",
  "notification",
  "receipt",
  "appdata",
  "call",
  "count",
] as const;

const MAX_COUNT = 9_999_999;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asCount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT ? value : null;
  }
  if (typeof value === "string" && /^\d{1,7}$/.test(value)) return Number(value);
  return null;
}

/**
 * The known numeric attributes of the child `childTag` of a provider `ib`
 * node. Anything else on the node is ignored. Null when the node has no such
 * child.
 */
export function summarizeOfflineNode(
  node: unknown,
  childTag: string,
): Record<string, number> | null {
  if (!isRecord(node) || !Array.isArray(node.content)) return null;
  const child = node.content.find((entry) => isRecord(entry) && entry.tag === childTag);
  if (!isRecord(child)) return null;
  const attrs = isRecord(child.attrs) ? child.attrs : {};
  const counts: Record<string, number> = {};
  for (const name of COUNT_NAMES) {
    const count = asCount(attrs[name]);
    if (count !== null) counts[name] = count;
  }
  return counts;
}
