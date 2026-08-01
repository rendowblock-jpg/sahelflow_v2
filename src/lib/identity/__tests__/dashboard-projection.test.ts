import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/trusted-actor")
  >();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

import {
  projectDashboardForTrustedActor,
  resolveDashboardFieldAccess,
} from "../dashboard-projection";
import type { Phase2Action } from "../permissions";
import type { TrustedActorContext } from "../trusted-actor";

const SHOP = Object.freeze({
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "shop-a",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 1,
  databaseFileId: "shop-a.db",
  migrationSetSha256: "4".repeat(64),
});

function context(
  role: "owner" | "manager" | "operator" | "viewer",
  permissions?: readonly Phase2Action[],
): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind: "person",
      personId: "5".repeat(32),
      workspaceMemberId: "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId: "session-1",
      role,
      policyVersion: 1,
      revocationEpoch: 0,
      ...(permissions ? { permissions } : {}),
    },
    shop: SHOP,
  } as TrustedActorContext;
}

const SOURCE = {
  stats: {
    ordersToday: 4,
    ordersTrend: 20,
    revenueToday: 12_000,
    revenueTrend: 10,
    realizedRevenueToday: 8_000,
    realizedRevenueTrend: 5,
    newCustomers: 2,
    activeConversations: 3,
    pendingDeliveries: 1,
    lowStockProducts: 6,
  },
  recentOrders: [
    {
      id: "order-1",
      orderNumber: "ORD-1",
      status: "pending",
      wilaya: "Alger",
      totalPrice: 3_500,
      items: [{ id: "item-1", unitPrice: 3_500 }],
      customer: { name: "Seller customer" },
    },
  ],
  analytics: {
    revenueSeries: [{ revenue: 12_000, orders: 4 }],
    customerGrowth: [{ newCustomers: 2 }],
    deliveryPerformance: {
      deliveryRate: 80,
      delivered: 8,
      inTransit: 1,
      pending: 1,
      returned: 0,
    },
  },
} as const;

describe("server dashboard projection", () => {
  it("redacts contact and money independently for the viewer preset", () => {
    const access = resolveDashboardFieldAccess(context("viewer"));
    const projected = projectDashboardForTrustedActor(SOURCE, access);

    expect(projected.stats).toMatchObject({
      ordersToday: 4,
      revenueToday: null,
      realizedRevenueToday: null,
      newCustomers: 2,
      pendingDeliveries: 1,
    });
    expect(projected.recentOrders[0]).toMatchObject({
      orderNumber: "ORD-1",
      customerName: null,
      wilaya: null,
      totalPrice: null,
      itemCount: 1,
    });
    expect(projected.analytics.revenueSeries[0]).toEqual({
      orders: 4,
      revenue: null,
    });
  });

  it("turns a shops-only custom policy into a fully redacted dashboard", () => {
    const access = resolveDashboardFieldAccess(
      context("operator", ["shops.read"]),
    );
    const projected = projectDashboardForTrustedActor(SOURCE, access);

    expect(projected.stats).toMatchObject({
      ordersToday: null,
      revenueToday: null,
      newCustomers: null,
      activeConversations: null,
      pendingDeliveries: null,
    });
    expect(projected.recentOrders).toEqual([]);
    expect(projected.analytics.revenueSeries).toEqual([]);
    expect(projected.analytics.deliveryPerformance).toBeNull();
  });

  it("preserves owner contact and financial fields", () => {
    const access = resolveDashboardFieldAccess(context("owner"));
    const projected = projectDashboardForTrustedActor(SOURCE, access);

    expect(projected.stats.revenueToday).toBe(12_000);
    expect(projected.recentOrders[0]).toMatchObject({
      customerName: "Seller customer",
      wilaya: "Alger",
      totalPrice: 3_500,
    });
    expect(projected.analytics.revenueSeries[0]?.revenue).toBe(12_000);
  });

  it("denies an empty custom allowlist before dashboard data access", () => {
    expect(() =>
      resolveDashboardFieldAccess(context("operator", [])),
    ).toThrow(/shops\.read/);
  });
});
