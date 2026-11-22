/**
 * The one place that adds up an order: sum of unitPrice x quantity over the
 * lines, plus the delivery cost. Pure arithmetic on whole dinars, so it can be
 * tested without a database.
 *
 * It does not validate. Callers refuse a total above the ceiling themselves
 * (assertOrderTotalWithinLimit in money-limits.ts, with their own field name),
 * because a sum that left the safe integer range must be caught after the sum.
 * The same goes for a discount: callers check it with assertDiscountWithinItems.
 * The one exception is allocateOrderDiscount, which refuses an impossible
 * discount itself, because shares above a line's value would over-refund.
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
 * cost; it counts as 0, as the lines edit already treated it. An order-level
 * discount (whole dinars, 0 when absent) comes off the items, never off the
 * delivery: totalPrice = itemsTotal - discount + delivery.
 */
export function orderTotalOf(
  lines: readonly OrderTotalLine[],
  deliveryCost: number | null | undefined,
  discountDzd = 0,
): OrderTotal {
  const itemsTotal = sumLineTotals(lines);
  return { itemsTotal, totalPrice: itemsTotal - discountDzd + (deliveryCost ?? 0) };
}

export interface OrderDiscountLine extends OrderTotalLine {
  id: string;
}

/**
 * Splits an order-level discount over the lines in proportion to their value.
 * Each share is floor(discount x lineValue / itemsTotal), computed in BigInt
 * because the product can pass 2^53. The dinars left over (fewer than the
 * number of lines) go one each to the lines of largest value, ties by id, so
 * the result does not depend on the order of the lines. Shares are whole
 * dinars, add up to the discount exactly, and never pass their line's value.
 * Throws RangeError for a discount that is negative, fractional or above the
 * items: shares above a line's value would refund more than was paid.
 */
export function allocateOrderDiscount(
  lines: readonly OrderDiscountLine[],
  discountDzd: number,
): ReadonlyMap<string, number> {
  const itemsTotal = sumLineTotals(lines);
  if (!Number.isSafeInteger(discountDzd) || discountDzd < 0 || discountDzd > itemsTotal) {
    throw new RangeError("The discount must be a whole number of dinars between 0 and the items total");
  }
  const shares = new Map<string, number>();
  const values = new Map<string, number>();
  let given = 0;
  for (const line of lines) {
    const value = lineTotalOf(line.unitPrice, line.quantity);
    const share =
      itemsTotal === 0 ? 0 : Number((BigInt(discountDzd) * BigInt(value)) / BigInt(itemsTotal));
    values.set(line.id, value);
    shares.set(line.id, share);
    given += share;
  }
  let leftover = discountDzd - given;
  const byValue = [...lines].sort(
    (x, y) => (values.get(y.id) ?? 0) - (values.get(x.id) ?? 0) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
  );
  for (const line of byValue) {
    if (leftover === 0) break;
    shares.set(line.id, (shares.get(line.id) ?? 0) + 1);
    leftover -= 1;
  }
  return shares;
}

/** a / b rounded up, for whole numbers below 2^53, without a float quotient that could cross an integer. */
function ceilDiv(a: number, b: number): number {
  const remainder = a % b;
  return (a - remainder) / b + (remainder === 0 ? 0 : 1);
}

/**
 * What returning `requestedQuantity` pieces of a line refunds at most: their
 * plain price minus their pro-rata share of the line's discount, rounded so
 * the share is never undercounted. Refunding the pieces one at a time can
 * therefore never add up to more than the line cost the buyer.
 */
export function refundableItemValue(
  line: OrderTotalLine,
  requestedQuantity: number,
  lineDiscountDzd: number,
): number {
  // A line bought in 0 pieces would divide by zero (NaN), and a NaN maximum makes every "amount above the maximum" check false.
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
    throw new RangeError("A line must have been bought in a whole number of pieces, at least one");
  }
  return (
    lineTotalOf(line.unitPrice, requestedQuantity) -
    ceilDiv(lineDiscountDzd * requestedQuantity, line.quantity)
  );
}

/**
 * Net revenue per order line after deducting its pro-rata share of the order-level
 * discount (F-0067). Uses the exact same BigInt floor + largest-line tie-break as
 * allocateOrderDiscount, so the sum of net line revenues equals
 * sum(line.total) - discountDzd exactly, and equals line.total when discountDzd is 0.
 */
export function netOrderItemRevenues(
  items: ReadonlyArray<{ id?: string; total: number }>,
  discountDzd = 0,
): number[] {
  if (items.length === 0) return [];
  const itemsTotal = items.reduce((sum, item) => sum + item.total, 0);
  const clamped =
    !Number.isSafeInteger(discountDzd) || discountDzd <= 0
      ? 0
      : Math.min(discountDzd, Math.max(0, itemsTotal));
  if (clamped === 0 || itemsTotal <= 0) {
    return items.map((item) => item.total);
  }
  const shares = new Array<number>(items.length).fill(0);
  let given = 0;
  for (let i = 0; i < items.length; i++) {
    const value = Math.max(0, items[i].total);
    const share = Number((BigInt(clamped) * BigInt(value)) / BigInt(itemsTotal));
    shares[i] = share;
    given += share;
  }
  let leftover = clamped - given;
  const order = items
    .map((item, index) => ({
      index,
      value: Math.max(0, item.total),
      id: item.id ?? String(index),
    }))
    .sort((x, y) => y.value - x.value || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  for (const entry of order) {
    if (leftover === 0) break;
    if (shares[entry.index] < entry.value) {
      shares[entry.index] += 1;
      leftover -= 1;
    }
  }
  return items.map((item, i) => item.total - shares[i]);
}
