/**
 * One definition of "Expenses" for the Accounting page (MNY-06).
 *
 * Expenses are every cost that is subtracted from net revenue to reach net
 * profit: cost of goods sold, courier fees, inventory losses and operating
 * expenses, less settlement adjustments (which are income that offsets cost).
 * That matches profitability.ts (`grossProfit - courierFees +
 * settlementAdjustments - inventoryLosses - operatingExpenses`), so net revenue
 * minus Expenses is net profit.
 */
export interface ExpenseComponents {
  cogs: number;
  courierFees: number;
  inventoryLosses: number;
  operatingExpenses: number;
  settlementAdjustments: number;
}

export function totalExpensesOf(
  components: Partial<ExpenseComponents> | null | undefined,
): number {
  if (!components) return 0;
  return (
    (components.cogs ?? 0) +
    (components.courierFees ?? 0) +
    (components.inventoryLosses ?? 0) +
    (components.operatingExpenses ?? 0) -
    (components.settlementAdjustments ?? 0)
  );
}

/** Totals of exactly the months a revenue-vs-expenses chart plots. */
export function sumMonthlyTotals(
  months: ReadonlyArray<{ revenue: number; expenses: number }>,
): { revenue: number; expenses: number } {
  let revenue = 0;
  let expenses = 0;
  for (const month of months) {
    revenue += month.revenue;
    expenses += month.expenses;
  }
  return { revenue, expenses };
}
