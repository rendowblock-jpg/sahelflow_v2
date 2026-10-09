/**
 * Seller-facing label for an order-lifecycle state value (fulfillment,
 * delivery, inventory, return, refund, COD). Every state the kernels emit has
 * a key under orders.workspace.fulfillment.state.*; an unknown value is shown
 * with underscores turned into spaces rather than as a raw identifier.
 */
export function orderStateLabel(
  state: string | null | undefined,
  t: (key: string) => string,
): string {
  if (!state) return "—";
  const key = `orders.workspace.fulfillment.state.${state}`;
  const label = t(key);
  return label === key ? state.replace(/_/g, " ") : label;
}
