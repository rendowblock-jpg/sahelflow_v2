/**
 * The three money bases the dashboard, analytics and accounting pages show, and
 * the catalog key that holds the name of each. One name per basis, so the same
 * word never stands for two different numbers.
 *
 * ordersValue      booked value of non-cancelled, non-draft orders created in the period
 * revenueDelivered recognised when the order is delivered, before refunds
 * netRevenue       recognised at delivery, minus customer refunds and returns
 */
export const MONEY_BASES = ["ordersValue", "revenueDelivered", "netRevenue"] as const;

export type MoneyBasis = (typeof MONEY_BASES)[number];

const NAME_KEYS: Record<MoneyBasis, string> = {
  ordersValue: "money.ordersValue",
  revenueDelivered: "money.revenueDelivered",
  netRevenue: "money.netRevenue",
};

/** Runtime-catalog key (src/lib/i18n/money-names-runtime.ts) of the name of a basis. */
export function moneyNameKey(basis: MoneyBasis): string {
  return NAME_KEYS[basis];
}
