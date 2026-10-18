import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sumMonthlyTotals, totalExpensesOf } from "@/lib/accounting/expense-totals";

/**
 * MNY-06: on the Accounting page the "Expenses" card left COGS out, the chart's
 * "Expenses" bars put COGS in, and the chart caption reused the card's
 * rolling-30-day number under a six-month chart. One label, one definition:
 * "Expenses" is every cost that is subtracted from net revenue to reach net
 * profit (COGS, courier fees, inventory losses, operating expenses, less
 * settlement adjustments), and the caption totals what the chart plots.
 */

describe("totalExpensesOf (MNY-06)", () => {
  it("includes COGS together with every other cost term, net of settlement adjustments", () => {
    expect(
      totalExpensesOf({
        cogs: 4_000,
        courierFees: 500,
        inventoryLosses: 200,
        operatingExpenses: 1_000,
        settlementAdjustments: 100,
      }),
    ).toBe(5_600);
  });

  it("closes the page arithmetic: net revenue minus Expenses is net profit", () => {
    const projection = {
      netRevenue: 10_000,
      cogs: 4_000,
      courierFees: 500,
      inventoryLosses: 200,
      operatingExpenses: 1_000,
      settlementAdjustments: 100,
    };
    // Same terms as profitability.ts: grossProfit - courierFees +
    // settlementAdjustments - inventoryLosses - operatingExpenses.
    const netProfit =
      projection.netRevenue -
      projection.cogs -
      projection.courierFees +
      projection.settlementAdjustments -
      projection.inventoryLosses -
      projection.operatingExpenses;
    expect(projection.netRevenue - totalExpensesOf(projection)).toBe(netProfit);
  });

  it("treats a missing month or missing terms as zero", () => {
    expect(totalExpensesOf(undefined)).toBe(0);
    expect(totalExpensesOf(null)).toBe(0);
    expect(totalExpensesOf({ cogs: 700 })).toBe(700);
  });
});

describe("sumMonthlyTotals (MNY-06)", () => {
  it("totals exactly the months the chart plots", () => {
    expect(
      sumMonthlyTotals([
        { revenue: 1_000, expenses: 400 },
        { revenue: 0, expenses: 0 },
        { revenue: 2_500, expenses: 1_100 },
      ]),
    ).toEqual({ revenue: 3_500, expenses: 1_500 });
    expect(sumMonthlyTotals([])).toEqual({ revenue: 0, expenses: 0 });
  });
});

describe("Accounting page uses one Expenses definition (MNY-06)", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/(dashboard)/accounting/page.tsx"),
    "utf8",
  );

  it("builds the card and every chart bar from the shared helper", () => {
    expect(page).toContain("totalExpensesOf(profitability)");
    expect(page).toContain("totalExpensesOf(month)");
  });

  it("no longer carries its own inline Expenses arithmetic", () => {
    expect(page).not.toMatch(/profitability\.courierFees\s*\+\s*profitability\.inventoryLosses/);
    expect(page).not.toMatch(/\(month\?\.cogs \?\? 0\)/);
  });

  it("captions the chart with the totals of the months it plots, not the card value", () => {
    expect(page).toContain("sumMonthlyTotals(monthlyData)");
    expect(page).toMatch(
      /summary=\{`[^`]*chartTotals\.revenue[^`]*chartTotals\.expenses[^`]*`\}/,
    );
    expect(page).not.toMatch(/summary=\{`[^`]*totalExpenses/);
  });
});
