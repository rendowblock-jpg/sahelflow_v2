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
