/**
 * Active-orders stat computation — extracted from the orders page so it can be
 * unit-tested with a realistic DB seed.
 *
 * Why this exists: the orders page previously computed the "active orders" KPI
 * by filtering `allOrders` (fetched with `take: 200`). Shops with >200 orders
 * silently undercounted. The fix is to compute from the uncapped `groupBy`
 * result instead (DATA_INTEGRITY_PLAN.md Phase 1 bug 1.5).
 */
export type StatusGroup = { status: string; _count: { _all: number } };

/** Sum of pending + confirmed + shipped counts from an uncapped status groupBy. */
export function computeActiveOrderCount(statusGroups: StatusGroup[]): number {
  const counts: Record<string, number> = {};
  for (const g of statusGroups) {
    counts[g.status] = g._count._all;
  }
  return (
    (counts["pending"] ?? 0) +
    (counts["confirmed"] ?? 0) +
    (counts["shipped"] ?? 0)
  );
}
