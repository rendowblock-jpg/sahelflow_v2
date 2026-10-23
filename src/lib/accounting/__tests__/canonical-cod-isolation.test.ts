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
  /** Delivery time; by default the order at position i was delivered i seconds before position 0. null = no delivery date. */
  deliveredAt?: Date | null;
  /** Amounts of the cod_receivable_created movements written for the order. */
  receivables: number[];
}

interface Scenario {
  orders: Fixture[];
  settlementCount?: number;
  /** 1-based positions (newest first) of settlements that carry one line with no order: it needs review. */
  unmatchedSettlements?: number[];
}

/** What the projection asked the stand-in for, so the tests can see HOW it read, not only what it got back. */
const reads = { orderPages: [] as Array<{ take?: number; after?: string }>, widestIdList: 0, settlementPages: [] as Array<{ take?: number }> };

function good(id: string, amount = 10_000): Fixture {
  return { id, receivables: [amount] };
}

function context(scenario: Scenario): BusinessPrincipalContext {
  const { orders: fixtures } = scenario;
  const orders = fixtures.map((entry, index) => ({
    id: entry.id,
    orderNumber: `SF-${index + 1}`,
    version: 1,
    deliveredAt: entry.deliveredAt === undefined ? new Date(Date.UTC(2026, 6, 30, 12, 0, 0) - index * 1000) : entry.deliveredAt,
    source: "manual",
    sourceMetadata: trustedManualOrderSourceMetadata(),
    customer: { name: `Customer ${index + 1}` },
  }));
  reads.orderPages = [];
  reads.settlementPages = [];
  reads.widestIdList = 0;
  const unmatched = new Set(scenario.unmatchedSettlements ?? []);
  const settlements = Array.from(
    { length: scenario.settlementCount ?? 0 },
    (_, index) => ({
      id: `settlement-${index + 1}`,
      provider: "yalidine",
      externalReference: `REM-${index + 1}`,
      receivedAt: new Date(Date.UTC(2026, 6, 30, 12, 0, 0) - index * 1000),
      lines: unmatched.has(index + 1)
        ? [{ id: `line-${index + 1}`, orderId: null, grossRemittedAmount: 777, feeAmount: 0, adjustmentAmount: 0, discrepancyAmount: 0, providerLineReference: `P-${index + 1}`, corrections: [], match: null }]
        : [],
    }),
  );
  const byIdDesc = [...orders].sort((left, right) => (left.id < right.id ? 1 : left.id > right.id ? -1 : 0));
  /** The slice a Prisma findMany with take / skip / cursor{id} would return from `rows`, which are already in the order asked for. */
  const page = <T extends { id: string }>(rows: T[], args: { take?: number; skip?: number; cursor?: { id: string } }): T[] => {
    const from = (args.cursor ? rows.findIndex((row) => row.id === args.cursor?.id) : 0) + (args.skip ?? 0);
    return rows.slice(from, args.take === undefined ? undefined : from + args.take);
  };
  const prisma = {
    order: {
      findMany: async (args: { where?: { id?: string | { in: string[] } | { lt: string } }; take?: number }) => {
        const wanted = args.where?.id;
        if (typeof wanted === "object" && "in" in wanted) return orders.filter((entry) => wanted.in.includes(entry.id));
        if (typeof wanted === "string") return orders.filter((entry) => entry.id === wanted).slice(0, args.take);
        const after = typeof wanted === "object" ? wanted.lt : undefined;
        reads.orderPages.push({ take: args.take, after });
        // `orderBy: { id: "desc" }` with the bound `id < after`, as SQLite would answer it
        return byIdDesc.filter((entry) => after === undefined || entry.id < after).slice(0, args.take);
      },
    },
    financialMovement: {
      findMany: async (args: { where: { orderId: { in: string[] } } }) => {
        reads.widestIdList = Math.max(reads.widestIdList, args.where.orderId.in.length);
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
      findMany: async (args: { take?: number; skip?: number; cursor?: { id: string } }) => {
        reads.settlementPages.push({ take: args.take });
        return page(settlements, args);
      },
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

describe("COD reconciliation reads every delivered order and settlement, and says when a hard cap cut it (MNY-01)", () => {
  const many = (count: number): Fixture[] =>
    Array.from({ length: count }, (_, index) => good(`o-${index}`, 1_000));

  it("counts and adds up 5,001 delivered orders: the old newest-5,000 window is gone", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(context({ orders: many(5_001) }));
    expect(summary.counts.receivable).toBe(5_001);
    expect(summary.totals.expectedReceivable).toBe(5_001 * 1_000);
    expect(summary.totals.outstandingCollection).toBe(5_001 * 1_000);
    expect(summary.awaitingCollection).toHaveLength(5_001);
    expect(summary.truncated).toEqual({ orders: false, settlements: false });
  });

  it("reads in pages and never puts more than 1,000 ids in one IN list (SQLite allows 32,766 variables per statement)", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(context({ orders: many(12_345) }));
    expect(summary.counts.receivable).toBe(12_345);
    expect(summary.totals.expectedReceivable).toBe(12_345 * 1_000);
    expect(reads.orderPages).toHaveLength(13);
    for (const read of reads.orderPages) expect(read.take).toBeLessThanOrEqual(1_000);
    expect(reads.orderPages[0]?.after).toBeUndefined();
    expect(reads.orderPages.slice(1).every((read) => read.after !== undefined)).toBe(true);
    expect(reads.widestIdList).toBeLessThanOrEqual(1_000);
  });

  it("does not claim truncation at exactly 100,000 delivered orders, and flags it at 100,001 (the hard cap)", async () => {
    const atCap = await getCanonicalCodWorkspaceSummary(context({ orders: many(100_000) }));
    expect(atCap.counts.receivable).toBe(100_000);
    expect(atCap.truncated.orders).toBe(false);
    const over = await getCanonicalCodWorkspaceSummary(context({ orders: many(100_001) }));
    expect(over.counts.receivable).toBe(100_000);
    expect(over.totals.expectedReceivable).toBe(100_000 * 1_000);
    expect(over.truncated.orders).toBe(true);
    expect(over.truncated.settlements).toBe(false);
  });

  it("keeps an inconsistent order flagged wherever it sits, also in a later page", async () => {
    const orders = [...many(2_500), { id: "bad-late", receivables: [] }, ...many(10).map((entry) => ({ ...entry, id: `tail-${entry.id}` }))];
    const summary = await getCanonicalCodWorkspaceSummary(context({ orders }));
    expect(summary.flaggedOrders.map((entry) => entry.orderId)).toEqual(["bad-late"]);
    expect(summary.counts.receivable).toBe(2_510);
  });

  it("shows the newest 100 settlements but counts review and unmatched money over all of them", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(
      context({ orders: [good("ok")], settlementCount: 250, unmatchedSettlements: [3, 101, 250] }),
    );
    expect(summary.recentSettlements).toHaveLength(100);
    expect(summary.recentSettlements[0]?.settlementId).toBe("settlement-1");
    expect(summary.counts.settlementsNeedingReview).toBe(3);
    expect(summary.totals.unmatched).toBe(3 * 777);
    expect(summary.reviewLines.map((line) => line.settlementId)).toEqual(["settlement-3", "settlement-101", "settlement-250"]);
    expect(summary.truncated).toEqual({ orders: false, settlements: false });
    for (const read of reads.settlementPages) expect(read.take).toBeLessThanOrEqual(100);
  });

  it("flags truncation when more than 2,000 settlements exist (the settlement hard cap)", async () => {
    const atCap = await getCanonicalCodWorkspaceSummary(context({ orders: [good("ok")], settlementCount: 2_000 }));
    expect(atCap.truncated.settlements).toBe(false);
    const over = await getCanonicalCodWorkspaceSummary(context({ orders: [good("ok")], settlementCount: 2_001 }));
    expect(over.truncated.settlements).toBe(true);
    expect(over.truncated.orders).toBe(false);
  });

  it("lists the orders newest delivery first although it reads them by id: o-0 ... o-29 sort differently as text", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(context({ orders: many(30) }));
    expect(summary.awaitingCollection.map((entry) => entry.orderId)).toEqual(Array.from({ length: 30 }, (_, index) => `o-${index}`));
  });

  it("puts an order with no delivery date after every dated one, whatever its id, and keeps the inconsistent ones in the same order", async () => {
    const orders: Fixture[] = [
      { ...good("z-undated"), deliveredAt: null },
      { ...good("a-oldest"), deliveredAt: new Date("2026-01-01T00:00:00Z") },
      { ...good("m-newest"), deliveredAt: new Date("2026-06-01T00:00:00Z") },
      { id: "b-bad-undated", receivables: [], deliveredAt: null },
      { id: "c-bad-newest", receivables: [], deliveredAt: new Date("2026-07-01T00:00:00Z") },
    ];
    const summary = await getCanonicalCodWorkspaceSummary(context({ orders }));
    expect(summary.awaitingCollection.map((entry) => entry.orderId)).toEqual(["m-newest", "a-oldest", "z-undated"]);
    expect(summary.flaggedOrders.map((entry) => entry.orderId)).toEqual(["c-bad-newest", "b-bad-undated"]);
  });

  it("finds the position of any single order through a direct query, however old", async () => {
    const orders = many(12_000);
    await expect(getCanonicalCodOrderPosition(context({ orders }), "o-11999")).resolves.toMatchObject({
      orderId: "o-11999",
      expectedReceivable: 1_000,
    });
    expect(reads.orderPages).toHaveLength(0);
  });
});
