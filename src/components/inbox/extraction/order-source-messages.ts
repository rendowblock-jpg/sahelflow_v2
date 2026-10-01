/**
 * Which conversation messages an order is read from.
 *
 * Customers rarely send an order in one message: "salam", "I want 2 black
 * ones", the name, the phone and the address often arrive as separate
 * messages. The order review therefore reads a SET of messages, chosen by
 * the seller, with a sensible default: the customer's burst around the
 * message the seller picked (every consecutive customer text message, up to
 * the seller's previous or next reply).
 */

export interface OrderSourceMessage {
  id: string;
  body: string;
  direction: "inbound" | "outbound" | "system";
  timestamp: number;
  messageType?: string;
}

/** Messages the review lists (most recent window), oldest first. */
export const ORDER_SOURCE_WINDOW = 40;
/** A reading never combines more customer messages than this. */
export const ORDER_SOURCE_MAX_SELECTED = 15;

export function isOrderTextMessage(message: OrderSourceMessage): boolean {
  return (
    (message.messageType === undefined || message.messageType === "text") &&
    message.body.trim().length > 0
  );
}

export function isSelectableOrderMessage(message: OrderSourceMessage): boolean {
  return message.direction === "inbound" && isOrderTextMessage(message);
}

/** The listed window: text messages only, chronological. */
export function orderSourceWindow(messages: OrderSourceMessage[]): OrderSourceMessage[] {
  return [...messages]
    .filter((message) => message.direction !== "system" && isOrderTextMessage(message))
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-ORDER_SOURCE_WINDOW);
}

/**
 * The default selection: the customer burst that contains `anchorId`,
 * bounded by the seller's replies on either side.
 */
export function defaultOrderSelection(
  window: OrderSourceMessage[],
  anchorId: string | null,
): string[] {
  const anchorIndex = window.findIndex((message) => message.id === anchorId);
  if (anchorIndex < 0 || !isSelectableOrderMessage(window[anchorIndex]!)) {
    return anchorId && window.some((message) => message.id === anchorId) ? [anchorId] : [];
  }
  let start = anchorIndex;
  while (start > 0 && isSelectableOrderMessage(window[start - 1]!)) start -= 1;
  let end = anchorIndex;
  while (end < window.length - 1 && isSelectableOrderMessage(window[end + 1]!)) end += 1;
  const burst = window.slice(start, end + 1).map((message) => message.id);
  // Keep the anchor inside the cap by trimming the oldest messages first.
  return burst.slice(-ORDER_SOURCE_MAX_SELECTED);
}

/**
 * The text the extractor reads: the selected messages in the order they were
 * written, one per paragraph. The order is anchored to the LATEST selected
 * message (its source message id).
 */
export function composeOrderSource(
  window: OrderSourceMessage[],
  selectedIds: ReadonlySet<string>,
): { body: string; anchorId: string | null; count: number } {
  const chosen = window.filter((message) => selectedIds.has(message.id));
  return {
    body: chosen.map((message) => message.body.trim()).join("\n\n"),
    anchorId: chosen.at(-1)?.id ?? null,
    count: chosen.length,
  };
}
