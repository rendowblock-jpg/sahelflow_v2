/**
 * The one place that adds up an order: sum of unitPrice x quantity over the
 * lines, plus the delivery cost. Pure arithmetic on whole dinars, so it can be
 * tested without a database.
 *
 * It does not validate. Callers refuse a total above the ceiling themselves
 * (assertOrderTotalWithinLimit in money-limits.ts, with their own field name),
 * because a sum that left the safe integer range must be caught after the sum.
 */

export interface OrderTotalLine {
  unitPrice: number;
  quantity: number;
}

export interface OrderTotal {
  /** Sum of the line totals, delivery not included. */
  itemsTotal: number;
  /** itemsTotal plus the delivery cost. */
  totalPrice: number;
}

/** One line: unit price x quantity. */
export function lineTotalOf(unitPrice: number, quantity: number): number {
  return unitPrice * quantity;
}

/** Sum of the line totals, in the order the lines are given. */
export function sumLineTotals(lines: readonly OrderTotalLine[]): number {
  return lines.reduce(
    (sum, line) => sum + lineTotalOf(line.unitPrice, line.quantity),
    0,
  );
}

/**
 * Items total and order total. An old order row can carry a null delivery
 * cost; it counts as 0, as the lines edit already treated it.
 */
export function orderTotalOf(
  lines: readonly OrderTotalLine[],
  deliveryCost: number | null | undefined,
): OrderTotal {
  const itemsTotal = sumLineTotals(lines);
  return { itemsTotal, totalPrice: itemsTotal + (deliveryCost ?? 0) };
}
