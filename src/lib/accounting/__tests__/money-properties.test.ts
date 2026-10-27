import { describe, expect, it } from "vitest";

import { totalExpensesOf, sumMonthlyTotals, type ExpenseComponents } from "@/lib/accounting/expense-totals";
import { computeCodPositionDiscrepancy, isDisputedCodPosition } from "@/lib/accounting/canonical-cod-projections";

import { forAll, type SeededRandom } from "../../__tests__/helpers/seeded-random";

/**
 * Property tests for the accounting figures a seller reads (area 10, money).
 * Amounts are whole dinars, up to 10 million per component.
 */

const KEYS = ["cogs", "courierFees", "inventoryLosses", "operatingExpenses", "settlementAdjustments"] as const;

function generateComponents(rng: SeededRandom): ExpenseComponents {
  return {
    cogs: rng.int(0, 10_000_000),
    courierFees: rng.int(0, 10_000_000),
    inventoryLosses: rng.int(0, 10_000_000),
    operatingExpenses: rng.int(0, 10_000_000),
    settlementAdjustments: rng.int(0, 10_000_000),
  };
}

describe("expenses on the accounting page", () => {
  it("count nothing when nothing is recorded, and treat a missing component as zero (300 cases)", () => {
    const ran = forAll("empty and partial components", { seed: 0xacc001, runs: 300 }, generateComponents, (full) => {
      expect(totalExpensesOf(null)).toBe(0);
      expect(totalExpensesOf(undefined)).toBe(0);
      expect(totalExpensesOf({})).toBe(0);
      for (const key of KEYS) {
        const only = totalExpensesOf({ [key]: full[key] });
        expect(only).toBe(key === "settlementAdjustments" ? -full[key] : full[key]);
      }
    });
    expect(ran).toBe(300);
  });

  it("add a cost by exactly its amount and subtract a settlement adjustment by exactly its amount", () => {
    const ran = forAll(
      "expenses move by the exact delta",
      { seed: 0xacc002, runs: 400 },
      (rng) => ({ base: generateComponents(rng), delta: rng.int(1, 1_000_000), key: rng.pick(KEYS) }),
      ({ base, delta, key }) => {
        const before = totalExpensesOf(base);
        const after = totalExpensesOf({ ...base, [key]: base[key] + delta });
        expect(after - before).toBe(key === "settlementAdjustments" ? -delta : delta);
        expect(Number.isInteger(after)).toBe(true);
      },
    );
    expect(ran).toBe(400);
  });

  it("are additive: two shops' components add up to the total of the combined components", () => {
    const ran = forAll("expenses are linear", { seed: 0xacc003, runs: 300 }, (rng) => ({ left: generateComponents(rng), right: generateComponents(rng) }), ({ left, right }) => {
      const combined = Object.fromEntries(KEYS.map((key) => [key, left[key] + right[key]])) as unknown as ExpenseComponents;
      expect(totalExpensesOf(combined)).toBe(totalExpensesOf(left) + totalExpensesOf(right));
    });
    expect(ran).toBe(300);
  });

  it("monthly totals ignore month order and split cleanly; revenue minus expenses is the sum of the monthly profits", () => {
    const ran = forAll(
      "monthly totals",
      { seed: 0xacc004, runs: 400 },
      (rng) => ({ months: Array.from({ length: rng.int(0, 24) }, () => ({ revenue: rng.int(0, 50_000_000), expenses: rng.int(0, 50_000_000) })), cut: rng.int(0, 24) }),
      ({ months, cut }, rng) => {
        const whole = sumMonthlyTotals(months);
        expect(sumMonthlyTotals(rng.shuffle(months))).toEqual(whole);
        const left = sumMonthlyTotals(months.slice(0, cut));
        const right = sumMonthlyTotals(months.slice(cut));
        expect(whole).toEqual({ revenue: left.revenue + right.revenue, expenses: left.expenses + right.expenses });
        expect(whole.revenue - whole.expenses).toBe(months.reduce((sum, month) => sum + month.revenue - month.expenses, 0));
      },
    );
    expect(ran).toBe(400);
  });
});

describe("cash-on-delivery position", () => {
  const position = (rng: SeededRandom) => ({
    expectedReceivable: rng.int(0, 2_000_000),
    effectiveCollected: rng.int(0, 2_000_000),
    settlementDiscrepancy: rng.chance(0.5) ? 0 : rng.int(-5_000, 5_000),
    hasCollection: rng.chance(0.6),
    hasSettlementLines: rng.chance(0.4),
  });

  it("shows no gap for an order nobody has touched yet (it is outstanding, not disputed)", () => {
    const ran = forAll("untouched order has no discrepancy", { seed: 0xacc005, runs: 300 }, position, (input) => {
      const gap = computeCodPositionDiscrepancy({ ...input, hasCollection: false, hasSettlementLines: false });
      expect(gap).toBe(0);
      expect(isDisputedCodPosition({ codState: "receivable", discrepancy: gap })).toBe(false);
    });
    expect(ran).toBe(300);
  });

  it("shows no gap when the collected cash is exactly what was expected and the courier settled it cleanly", () => {
    const ran = forAll("exact collection is not a discrepancy", { seed: 0xacc006, runs: 300 }, position, (input) => {
      const gap = computeCodPositionDiscrepancy({ ...input, effectiveCollected: input.expectedReceivable, settlementDiscrepancy: 0, hasCollection: true });
      expect(gap).toBe(0);
    });
    expect(ran).toBe(300);
  });

  it("moves one dinar for one dinar: collecting d more raises the gap by exactly d, a settlement shortfall lowers it by exactly its size", () => {
    const ran = forAll("gap is exact", { seed: 0xacc007, runs: 400 }, (rng) => ({ ...position(rng), hasCollection: true, extra: rng.int(1, 100_000) }), ({ extra, ...input }) => {
      const base = computeCodPositionDiscrepancy(input);
      expect(Number.isInteger(base)).toBe(true);
      expect(computeCodPositionDiscrepancy({ ...input, effectiveCollected: input.effectiveCollected + extra })).toBe(base + extra);
      expect(computeCodPositionDiscrepancy({ ...input, settlementDiscrepancy: input.settlementDiscrepancy - extra })).toBe(base - extra);
      expect(isDisputedCodPosition({ codState: "collected", discrepancy: base })).toBe(base !== 0);
      expect(isDisputedCodPosition({ codState: "disputed", discrepancy: 0 })).toBe(true);
    });
    expect(ran).toBe(400);
  });
});
