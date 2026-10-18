import { describe, expect, it } from "vitest";

import {
  computeCodPositionDiscrepancy,
  getCanonicalCodWorkspaceSummary,
  isDisputedCodPosition,
} from "@/lib/accounting/canonical-cod-projections";
import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import { trustedManualOrderSourceMetadata } from "@/lib/orders/manual-order-authority";

/**
 * MNY-02: a delivered order that has simply not been collected yet used to
 * show `discrepancy = -expectedReceivable`, which put it in the "disputed"
 * bucket and subtracted its whole value from the discrepancy total. The
 * state machine (deriveCodState) already calls such an order "receivable".
 *
 * These tests run the real projection against an in-memory stand-in for the
 * handful of Prisma reads it makes, so no database is needed.
 */

interface Scenario {
  id: string;
  expected: number;
  collection?: { amount: number; corrections?: number[] };
  line?: { gross: number; discrepancy?: number };
}

function context(scenarios: Scenario[]): BusinessPrincipalContext {
  const orders = scenarios.map((entry, index) => ({
    id: entry.id,
    orderNumber: `SF-${index + 1}`,
    version: 5,
    source: "manual",
    sourceMetadata: trustedManualOrderSourceMetadata(),
    customer: { name: `Customer ${index + 1}` },
  }));
  const lines = scenarios.flatMap((entry) =>
    entry.line
      ? [
          {
            id: `line-${entry.id}`,
            orderId: entry.id,
            grossRemittedAmount: entry.line.gross,
            feeAmount: 0,
            adjustmentAmount: 0,
            discrepancyAmount: entry.line.discrepancy ?? 0,
            providerLineReference: null,
            corrections: [],
            match: null,
            settlement: {
              id: "settlement-1",
              provider: "yalidine",
              externalReference: "REM-1",
              receivedAt: new Date("2026-07-30T12:00:00.000Z"),
            },
          },
        ]
      : [],
  );
  const prisma = {
    order: { findMany: async () => orders },
    financialMovement: {
      findMany: async () =>
        scenarios.map((entry) => ({ orderId: entry.id, amount: entry.expected })),
    },
    codCollection: {
      findMany: async () =>
        scenarios.flatMap((entry) =>
          entry.collection
            ? [
                {
                  id: `collection-${entry.id}`,
                  orderId: entry.id,
                  provider: "yalidine",
                  amount: entry.collection.amount,
                  reference: null,
                  collectedAt: new Date("2026-07-29T12:00:00.000Z"),
                  corrections: (entry.collection.corrections ?? []).map(
                    (amountDelta) => ({ amountDelta }),
                  ),
                },
              ]
            : [],
        ),
    },
    canonicalRefund: { findMany: async () => [] },
    codSettlementLine: { findMany: async () => lines },
    codSettlement: {
      findMany: async () =>
        lines.length
          ? [
              {
                id: "settlement-1",
                provider: "yalidine",
                externalReference: "REM-1",
                receivedAt: new Date("2026-07-30T12:00:00.000Z"),
                lines,
              },
            ]
          : [],
    },
  };
  return { prisma } as unknown as BusinessPrincipalContext;
}

describe("COD workspace discrepancy and disputed bucket (MNY-02)", () => {
  it("does not treat a delivered order that is not collected yet as disputed", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(
      context([{ id: "o1", expected: 10_000 }]),
    );
    expect(summary.awaitingCollection).toHaveLength(1);
    expect(summary.awaitingCollection[0]).toMatchObject({
      codState: "receivable",
      expectedReceivable: 10_000,
      outstandingCollection: 10_000,
      discrepancy: 0,
    });
    expect(summary.disputed).toHaveLength(0);
    expect(summary.counts.disputed).toBe(0);
    expect(summary.counts.awaitingCollection).toBe(1);
    expect(summary.totals.discrepancy).toBe(0);
    // The money still owed is reported where it belongs, not as a discrepancy.
    expect(summary.totals.outstandingCollection).toBe(10_000);
  });

  it("does not flag an order collected for exactly the expected amount", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(
      context([{ id: "o1", expected: 10_000, collection: { amount: 10_000 } }]),
    );
    expect(summary.disputed).toHaveLength(0);
    expect(summary.counts.disputed).toBe(0);
    expect(summary.totals.discrepancy).toBe(0);
    expect(summary.awaitingRemittance[0]).toMatchObject({
      codState: "collected",
      discrepancy: 0,
    });
  });

  it("flags a short collection as disputed with the real shortfall", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(
      context([{ id: "o1", expected: 10_000, collection: { amount: 9_800 } }]),
    );
    expect(summary.disputed).toHaveLength(1);
    expect(summary.disputed[0]).toMatchObject({
      codState: "disputed",
      discrepancy: -200,
    });
    expect(summary.counts.disputed).toBe(1);
    expect(summary.totals.discrepancy).toBe(-200);
  });

  it("flags an over-collection as disputed with the real surplus", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(
      context([{ id: "o1", expected: 10_000, collection: { amount: 10_300 } }]),
    );
    expect(summary.disputed).toHaveLength(1);
    expect(summary.disputed[0]).toMatchObject({
      codState: "disputed",
      discrepancy: 300,
    });
    expect(summary.totals.discrepancy).toBe(300);
  });

  it("flags a settlement line that reports a discrepancy even when the collection is exact", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(
      context([
        {
          id: "o1",
          expected: 10_000,
          collection: { amount: 10_000 },
          line: { gross: 9_900, discrepancy: -100 },
        },
      ]),
    );
    expect(summary.disputed).toHaveLength(1);
    expect(summary.disputed[0]).toMatchObject({
      codState: "disputed",
      discrepancy: -100,
    });
    expect(summary.totals.discrepancy).toBe(-100);
  });

  it("keeps a recorded collection that was corrected down to zero flagged", async () => {
    // A collection fact exists, so the order is not "awaiting collection";
    // dropping it from every bucket would hide a real recorded shortfall.
    const summary = await getCanonicalCodWorkspaceSummary(
      context([
        {
          id: "o1",
          expected: 10_000,
          collection: { amount: 10_000, corrections: [-10_000] },
        },
      ]),
    );
    expect(summary.awaitingCollection).toHaveLength(0);
    expect(summary.disputed).toHaveLength(1);
    expect(summary.disputed[0]).toMatchObject({ discrepancy: -10_000 });
  });

  it("counts only the real problems when uncollected orders sit next to them", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(
      context([
        { id: "uncollected-a", expected: 7_000 },
        { id: "uncollected-b", expected: 4_500 },
        { id: "exact", expected: 3_000, collection: { amount: 3_000 } },
        { id: "short", expected: 10_000, collection: { amount: 9_800 } },
      ]),
    );
    expect(summary.counts.receivable).toBe(4);
    expect(summary.counts.awaitingCollection).toBe(2);
    expect(summary.counts.disputed).toBe(1);
    expect(summary.disputed.map((entry) => entry.orderId)).toEqual(["short"]);
    expect(summary.totals.discrepancy).toBe(-200);
    // Every other total is unchanged by the fix.
    expect(summary.totals.expectedReceivable).toBe(24_500);
    expect(summary.totals.effectiveCollected).toBe(12_800);
    expect(summary.totals.outstandingCollection).toBe(7_000 + 4_500 + 200);
  });
});

describe("computeCodPositionDiscrepancy / isDisputedCodPosition (MNY-02)", () => {
  const base = {
    hasCollection: false,
    hasSettlementLines: false,
    expectedReceivable: 10_000,
    effectiveCollected: 0,
    settlementDiscrepancy: 0,
  };

  it("is zero when there is neither a collection nor a settlement line", () => {
    expect(computeCodPositionDiscrepancy(base)).toBe(0);
  });

  it("is collected minus expected once a collection exists", () => {
    expect(
      computeCodPositionDiscrepancy({
        ...base,
        hasCollection: true,
        effectiveCollected: 10_000,
      }),
    ).toBe(0);
    expect(
      computeCodPositionDiscrepancy({
        ...base,
        hasCollection: true,
        effectiveCollected: 9_800,
      }),
    ).toBe(-200);
    expect(
      computeCodPositionDiscrepancy({
        ...base,
        hasCollection: true,
        effectiveCollected: 10_300,
      }),
    ).toBe(300);
  });

  it("adds the settlement discrepancy once a settlement line exists", () => {
    expect(
      computeCodPositionDiscrepancy({
        ...base,
        hasCollection: true,
        hasSettlementLines: true,
        effectiveCollected: 10_000,
        settlementDiscrepancy: -100,
      }),
    ).toBe(-100);
  });

  it("classifies disputed from the state or a non-zero discrepancy only", () => {
    expect(isDisputedCodPosition({ codState: "receivable", discrepancy: 0 })).toBe(false);
    expect(isDisputedCodPosition({ codState: "collected", discrepancy: 0 })).toBe(false);
    expect(isDisputedCodPosition({ codState: "remitted", discrepancy: 0 })).toBe(false);
    expect(isDisputedCodPosition({ codState: "disputed", discrepancy: 0 })).toBe(true);
    expect(isDisputedCodPosition({ codState: "collected", discrepancy: 5 })).toBe(true);
    expect(isDisputedCodPosition({ codState: "collected", discrepancy: -5 })).toBe(true);
  });
});
