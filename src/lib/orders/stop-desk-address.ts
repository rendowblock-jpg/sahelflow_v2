/**
 * STORE-DESK-ADDRESS: a buyer who collects at a courier's stop-desk has no street address to give.
 *
 * Order.address is a required column and every consumer (list, export, courier booking, search) reads
 * it as text, so a desk order without an address is stored with this fixed, human-readable text instead
 * of an empty string. The structured fact that the order is a stop-desk one is NOT this text: the order
 * keeps the delivery mode in its source details (`hostedDeliveryMode`). A buyer who did type something
 * (a desk name, a landmark) keeps what they typed.
 *
 * Home delivery is unchanged: no address, no order.
 */
export const STOP_DESK_ADDRESS = "Stop desk";

export type DeliveryMode = "home" | "desk";

/**
 * The address to store on the order, or null when the order cannot be placed (home delivery with no
 * address). Pure: no I/O, no clock.
 */
export function orderAddressFor(
  address: string | null | undefined,
  deliveryMode: DeliveryMode,
): string | null {
  const typed = (address ?? "").trim();
  if (typed.length > 0) return typed;
  return deliveryMode === "desk" ? STOP_DESK_ADDRESS : null;
}

/**
 * True when the order's address is only the placeholder above (any case, any spacing). Such an order has no
 * street to deliver to: it must not be booked as a home delivery. An address the buyer actually typed
 * (even one that contains the words "stop desk") is NOT the placeholder.
 */
export function isStopDeskPlaceholder(address: string | null | undefined): boolean {
  const normalised = (address ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return normalised === STOP_DESK_ADDRESS.toLowerCase();
}

/** Stable code the UI can branch on (CODED + ENGLISH-VERBATIM strategy, see translate-server-error.ts). */
export const STOP_DESK_NOT_BOOKABLE_CODE = "STOP_DESK_ORDER_NOT_BOOKABLE";

/** The English text is matched by a rule in translate-server-error.ts: keep the two byte-identical. */
export const STOP_DESK_NOT_BOOKABLE_MESSAGE =
  "This order is for stop-desk pickup and has no delivery address, so SahelFlow cannot book it with a courier. Book it in your courier's own dashboard.";
