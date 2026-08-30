import { describe, expect, it } from "vitest";

import {
  deriveStockEventsFromAuditRows,
  getProductStockHistory,
  type StockAuditRow,
} from "../product-stock-history";

function row(overrides: Partial<StockAuditRow> & { id: string }): StockAuditRow {
  return {
    action: "product.stock.adjusted",
    actor: "ai_assistant",
    before: null,
    after: null,
    metadata: null,
    createdAt: new Date("2026-09-01T10:00:00Z"),
    ...overrides,
  };
}

describe("product stock history derivation (R3-c)", () => {
  it("derives delta, new stock, reason and source from AI chat adjustments", () => {
    const events = deriveStockEventsFromAuditRows([
      row({
        id: "a1",
        before: JSON.stringify({ stock: 10 }),
        after: JSON.stringify({ stock: 7 }),
        metadata: JSON.stringify({ reason: "Casse pendant le transport", sku: "T-01" }),
      }),
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "a1",
      delta: -3,
      fromStock: 10,
      toStock: 7,
      reason: "Casse pendant le transport",
      source: "ai_assistant",
      actor: "ai_assistant",
    });
  });

  it("classifies governed AI action rows and tolerates hash-only reasons", () => {
    const events = deriveStockEventsFromAuditRows([
      row({
        id: "a2",
        action: "ai.product.stock_adjusted.v1",
        actor: "person:abc",
        before: JSON.stringify({ stock: 5, variantStock: null }),
        after: JSON.stringify({ stock: 9, variantStock: 9 }),
        metadata: JSON.stringify({
          reasonProvided: true,
          reasonHash: "sha256:deadbeef",
        }),
      }),
    ]);

    expect(events[0]).toMatchObject({
      source: "ai_action",
      delta: 4,
      toStock: 9,
      reason: null,
    });
  });

  it("includes non-stock-named actions only when the stock snapshot changed", () => {
    const events = deriveStockEventsFromAuditRows([
      // Same stock → not a movement, and action does not mention stock.
      row({
        id: "skip-1",
        action: "product.updated",
        before: JSON.stringify({ stock: 5, price: 100 }),
        after: JSON.stringify({ stock: 5, price: 120 }),
      }),
      // Different stock → qualifies even though the action name is generic.
      row({
        id: "keep-1",
        action: "product.updated",
        actor: "person:def",
        before: JSON.stringify({ stock: 5 }),
        after: JSON.stringify({ stock: 8 }),
      }),
      // Delete snapshot only → no after-stock, no stock word → excluded.
      row({
        id: "skip-2",
        action: "product.deleted",
        before: JSON.stringify({ stock: 4 }),
      }),
    ]);

    expect(events.map((event) => event.id)).toEqual(["keep-1"]);
    expect(events[0]).toMatchObject({ delta: 3, source: "other" });
  });

  it("keeps stock-named rows with unusable snapshots but no fake delta", () => {
    const events = deriveStockEventsFromAuditRows([
      row({ id: "a3", before: "not-json", after: JSON.stringify({ stock: 2 }) }),
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ delta: null, toStock: 2, fromStock: null });
  });

  it("preserves audit order (newest first) for the page's latest-20 slice", () => {
    const events = deriveStockEventsFromAuditRows([
      row({ id: "new", createdAt: new Date("2026-09-02T00:00:00Z") }),
      row({ id: "old", createdAt: new Date("2026-08-01T00:00:00Z") }),
    ]);

    expect(events.map((event) => event.id)).toEqual(["new", "old"]);
  });
});

describe("product stock history loader", () => {
  it("scopes the audit query to the product and slices the derived events", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const rows = Array.from({ length: 30 }, (_, index) =>
      row({
        id: `r${index}`,
        before: JSON.stringify({ stock: index + 1 }),
        after: JSON.stringify({ stock: index }),
      }),
    );
    const prisma = {
      auditLog: {
        findMany: async (args: Record<string, unknown>) => {
          seen.push(args);
          return rows;
        },
      },
    };

    const events = await getProductStockHistory(prisma as never, "prod-1", 20);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      where: { entity: "product", entityId: "prod-1" },
    });
    expect(events).toHaveLength(20);
    expect(events[0]).toMatchObject({ id: "r0", delta: -1 });
  });

  it("degrades to an empty history when the audit trail read fails", async () => {
    const prisma = {
      auditLog: {
        findMany: async () => {
          throw new Error("audit unavailable");
        },
      },
    };

    expect(await getProductStockHistory(prisma as never, "prod-2")).toEqual([]);
  });
});
