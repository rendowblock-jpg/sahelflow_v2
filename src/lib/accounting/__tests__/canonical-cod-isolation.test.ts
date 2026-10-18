import { describe, expect, it } from "vitest";

import {
  getCanonicalCodOrderPosition,
  getCanonicalCodWorkspaceSummary,
} from "@/lib/accounting/canonical-cod-projections";
import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import { trustedManualOrderSourceMetadata } from "@/lib/orders/manual-order-authority";

/**
 * MNY-03: one delivered order whose receivable record is inconsistent used to
 * make the whole COD workspace and every per-order position throw. A single
 * bad order must now be reported as one flagged item while the rest of the
 * shop keeps rendering.
 *
 * MNY-01: the order read is capped (5,000 newest delivered orders) and the
 * settlement read is capped (100 newest). The cap used to be silent; the
 * summary must now say so, and a single-order position must not depend on the
 * order being inside the newest-5,000 window.
 *
 * Like canonical-cod-discrepancy.test.ts, this runs the real projection
 * against an in-memory stand-in for the Prisma reads it makes (no database).
 * Unlike that file, the stand-in honours `where.id` and `take`, because those
 * two arguments are exactly what these findings are about.
 */

interface Fixture {
  id: string;
  /** Amounts of the cod_receivable_created movements written for the order. */
  receivables: number[];
}

interface Scenario {
  orders: Fixture[];
  settlementCount?: number;
}

function good(id: string, amount = 10_000): Fixture {
  return { id, receivables: [amount] };
}

function context(scenario: Scenario): BusinessPrincipalContext {
  const { orders: fixtures } = scenario;
  const orders = fixtures.map((entry, index) => ({
    id: entry.id,
    orderNumber: `SF-${index + 1}`,
    version: 1,
    source: "manual",
    sourceMetadata: trustedManualOrderSourceMetadata(),
    customer: { name: `Customer ${index + 1}` },
  }));
  const settlements = Array.from(
    { length: scenario.settlementCount ?? 0 },
    (_, index) => ({
      id: `settlement-${index + 1}`,
      provider: "yalidine",
      externalReference: `REM-${index + 1}`,
      receivedAt: new Date(Date.UTC(2026, 6, 30, 12, 0, 0) - index * 1000),
      lines: [],
    }),
  );
  const prisma = {
    order: {
      findMany: async (args: { where?: { id?: string }; take?: number }) => {
        const scoped = args.where?.id
          ? orders.filter((entry) => entry.id === args.where?.id)
          : orders;
        return args.take === undefined ? scoped : scoped.slice(0, args.take);
      },
    },
    financialMovement: {
      findMany: async (args: { where: { orderId: { in: string[] } } }) => {
        const wanted = new Set(args.where.orderId.in);
        return fixtures.flatMap((entry) =>
          wanted.has(entry.id)
            ? entry.receivables.map((amount) => ({ orderId: entry.id, amount }))
            : [],
        );
      },
    },
    codCollection: { findMany: async () => [] },
    canonicalRefund: { findMany: async () => [] },
    codSettlementLine: { findMany: async () => [] },
    codSettlement: {
      findMany: async (args: { take?: number }) =>
        args.take === undefined ? settlements : settlements.slice(0, args.take),
    },
  };
  return { prisma } as unknown as BusinessPrincipalContext;
}

describe("COD workspace isolates one inconsistent order (MNY-03)", () => {
  it("flags a delivered order with no receivable and keeps the other orders", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(
      context({
        orders: [good("ok-1", 10_000), { id: "bad", receivables: [] }, good("ok-2", 5_000)],
      }),
    );
    expect(summary.counts.receivable).toBe(2);
    expect(summary.totals.expectedReceivable).toBe(15_000);
    expect(summary.flaggedOrders).toEqual([
      { orderId: "bad", orderNumber: "SF-2", reason: "receivable_missing" },
    ]);
    expect(summary.counts.flagged).toBe(1);
  });

  it("flags a duplicated receivable and a non-positive receivable with distinct reasons", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(
      context({
        orders: [
          good("ok"),
          { id: "twice", receivables: [10_000, 10_000] },
          { id: "zero", receivables: [0] },
        ],
      }),
    );
    expect(summary.counts.receivable).toBe(1);
    expect(summary.flaggedOrders.map((entry) => [entry.orderId, entry.reason])).toEqual([
      ["twice", "receivable_duplicated"],
      ["zero", "receivable_not_positive"],
    ]);
  });

  it("reports only ids, order numbers and a reason code (no names, no amounts)", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(
      context({ orders: [good("ok"), { id: "bad", receivables: [7_777] , }, { id: "bad2", receivables: [] }] }),
    );
    const serialized = JSON.stringify(summary.flaggedOrders);
    expect(serialized).not.toContain("Customer");
    expect(serialized).not.toContain("7777");
    expect(Object.keys(summary.flaggedOrders[0] ?? {}).sort()).toEqual([
      "orderId",
      "orderNumber",
      "reason",
    ]);
  });

  it("still returns the position of a good order while another order is inconsistent", async () => {
    const ctx = context({ orders: [good("ok", 12_000), { id: "bad", receivables: [] }] });
    await expect(getCanonicalCodOrderPosition(ctx, "ok")).resolves.toMatchObject({
      orderId: "ok",
      expectedReceivable: 12_000,
    });
  });

  it("still fails closed for the inconsistent order itself", async () => {
    const ctx = context({ orders: [good("ok"), { id: "bad", receivables: [] }] });
    await expect(getCanonicalCodOrderPosition(ctx, "bad")).rejects.toThrow(
      /exactly one positive delivered receivable/,
    );
  });

  it("still reports an unknown order as not found", async () => {
    const ctx = context({ orders: [good("ok")] });
    await expect(getCanonicalCodOrderPosition(ctx, "nope")).rejects.toThrow(/not found/i);
  });
});

describe("COD reconciliation says when it is truncated (MNY-01)", () => {
  const many = (count: number): Fixture[] =>
    Array.from({ length: count }, (_, index) => good(`o-${index}`, 1_000));

  it("does not claim truncation at exactly 5,000 delivered orders", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(context({ orders: many(5_000) }));
    expect(summary.counts.receivable).toBe(5_000);
    expect(summary.truncated).toEqual({ orders: false, settlements: false });
  });

  it("flags truncation when more than 5,000 delivered orders exist", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(context({ orders: many(5_001) }));
    expect(summary.counts.receivable).toBe(5_000);
    expect(summary.truncated.orders).toBe(true);
    expect(summary.truncated.settlements).toBe(false);
  });

  it("flags truncation when more than 100 settlements exist", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(
      context({ orders: [good("ok")], settlementCount: 101 }),
    );
    expect(summary.recentSettlements).toHaveLength(100);
    expect(summary.truncated.settlements).toBe(true);
    expect(summary.truncated.orders).toBe(false);
  });

  it("finds the position of an old order that is outside the newest-5,000 window", async () => {
    const orders = many(5_001);
    const oldest = orders[5_000];
    expect(oldest?.id).toBe("o-5000");
    await expect(getCanonicalCodOrderPosition(context({ orders }), "o-5000")).resolves.toMatchObject({
      orderId: "o-5000",
      expectedReceivable: 1_000,
    });
  });
});
