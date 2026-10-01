import type { RiskAssessmentInput } from "./types";

export interface HistoryOrderRow {
  id?: string;
  status: string;
  totalPrice: number;
  createdAt: Date;
}

type CustomerHistory = NonNullable<RiskAssessmentInput["customerHistory"]>;

/**
 * A customer's history as it stood when `order` was placed: only orders
 * created before it, never the order itself or anything later.
 *
 * Counting the order itself (or its future) made every first-time buyer look
 * like a returning customer ("new customer" never fired), made "ordered again
 * within 24h" fire against the order's own timestamp, and let an order's
 * outcome leak into its own score.
 */
export function customerHistoryBefore(
  rows: readonly HistoryOrderRow[],
  order: { id?: string; createdAt: Date },
  customerId: string,
  isBlacklisted: boolean,
): CustomerHistory {
  const cutoff = order.createdAt.getTime();
  const prior = rows
    .filter((row) => (order.id === undefined || row.id !== order.id) && row.createdAt.getTime() <= cutoff)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  return {
    customerId,
    totalOrders: prior.length,
    deliveredCount: prior.filter((row) => row.status === "delivered").length,
    returnedCount: prior.filter((row) => row.status === "returned").length,
    refusedCount: prior.filter((row) => row.status === "refused").length,
    cancelledCount: prior.filter((row) => row.status === "cancelled").length,
    totalSpent: prior
      .filter((row) => !["cancelled", "draft"].includes(row.status))
      .reduce((sum, row) => sum + row.totalPrice, 0),
    firstOrderDate: prior[0]?.createdAt ?? null,
    lastOrderDate: prior.at(-1)?.createdAt ?? null,
    isBlacklisted,
  };
}
