import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/trusted-actor")
  >();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

import { projectSkuPnlForTrustedActor } from "../sku-pnl-projection";
import type { Phase2Action } from "../permissions";
import type { TrustedActorContext } from "../trusted-actor";

/**
 * MNY-20: the Analytics page printed SKU cost, margin and margin % to any
 * member holding analytics.financials.read. Margin = revenue - cost, so a
 * member without products.cost.read could derive product cost. The SKU P&L
 * rows are now projected the same way products are: cost-derived fields are
 * null without products.cost.read, and the row order no longer follows margin.
 */

const ROWS = [
  { sku: "A", revenue: 1_000, cost: 100, margin: 900, marginPct: 90, quantity: 1 },
  { sku: "B", revenue: 5_000, cost: 4_900, margin: 100, marginPct: 2, quantity: 5 },
  { sku: "C", revenue: 3_000, cost: 1_500, margin: 1_500, marginPct: 50, quantity: 3 },
];

function context(permissions: readonly Phase2Action[]): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind: "person",
      personId: "1".repeat(32),
      workspaceMemberId: "2".repeat(32),
      deviceId: "3".repeat(32),
      sessionId: "session-1",
      role: "viewer",
      permissions,
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: { shopId: "shop-a" },
  } as TrustedActorContext;
}

describe("SKU P&L cost projection (MNY-20)", () => {
  it("withholds cost, margin and margin % without products.cost.read", () => {
    const projected = projectSkuPnlForTrustedActor(
      context(["analytics.read", "analytics.financials.read"]),
      ROWS,
    );
    expect(projected.fieldAccess).toEqual({ cost: false });
    for (const row of projected.rows) {
      expect(row.cost).toBeNull();
      expect(row.margin).toBeNull();
      expect(row.marginPct).toBeNull();
    }
    expect(JSON.stringify(projected)).not.toMatch(/4900|1500|"cost":\d/);
  });

  it("keeps revenue and quantity, and orders by revenue so the order cannot reveal margin", () => {
    const projected = projectSkuPnlForTrustedActor(
      context(["analytics.read", "analytics.financials.read"]),
      ROWS,
    );
    expect(projected.rows.map((row) => row.sku)).toEqual(["B", "C", "A"]);
    expect(projected.rows[0]).toMatchObject({ sku: "B", revenue: 5_000, quantity: 5 });
  });

  it("returns the rows unchanged, in their original order, with products.cost.read", () => {
    const projected = projectSkuPnlForTrustedActor(
      context(["analytics.read", "analytics.financials.read", "products.cost.read"]),
      ROWS,
    );
    expect(projected.fieldAccess).toEqual({ cost: true });
    expect(projected.rows).toEqual(ROWS);
  });
});

describe("Analytics page applies the SKU projection (MNY-20)", () => {
  const page =
    readFileSync(join(process.cwd(), "src/app/(dashboard)/analytics/page.tsx"), "utf8") +
    readFileSync(join(process.cwd(), "src/components/analytics/analytics-view.tsx"), "utf8");

  it("projects the SKU rows through the actor-aware helper", () => {
    expect(page).toContain("projectSkuPnlForTrustedActor(actorContext, skuPnl)");
  });

  it("renders cost-derived columns only behind the cost grant", () => {
    const guarded = page.match(/showSkuCost (\?|&&)/g) ?? [];
    // header + cell for each of cost, margin and margin %.
    expect(guarded.length).toBeGreaterThanOrEqual(6);
    expect(page).not.toContain("skuPnl.slice(0, 10)");
  });
});
