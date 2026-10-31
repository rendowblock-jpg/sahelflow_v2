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
    revenueSeries: [{ date: "2026-09-28", revenue: 12_000, orders: 4 }],
    customerGrowth: [{ date: "2026-09-28", newCustomers: 2 }],
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
    // The day survives (chart read-out metadata); money is still redacted.
    expect(projected.analytics.revenueSeries[0]).toEqual({
      date: "2026-09-28",
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

describe("phone today counts in the projection", () => {
  const COUNTS = { ordersWaiting: 7, whatsappHeld: 2, codToCollectDzd: 45_000 };
  const TODAY_KEYS = ["ordersWaiting", "whatsappHeld", "codToCollectDzd"];
  const todayKeys = (stats: object) =>
    Object.keys(stats).filter((key) => TODAY_KEYS.includes(key));

  it("gives the owner all three exact numbers", () => {
    const access = resolveDashboardFieldAccess(context("owner"));
    const { stats } = projectDashboardForTrustedActor(
      { ...SOURCE, todayCounts: COUNTS },
      access,
    );
    expect(stats).toMatchObject(COUNTS);
  });

  it("leaves the keys out when the desktop sent no counts", () => {
    const access = resolveDashboardFieldAccess(context("owner"));
    const { stats } = projectDashboardForTrustedActor(SOURCE, access);
    expect(todayKeys(stats)).toEqual([]);
  });

  it("keeps the money amount from a member without order financials", () => {
    const access = resolveDashboardFieldAccess(
      context("operator", ["shops.read", "orders.read", "conversations.read"]),
    );
    const { stats } = projectDashboardForTrustedActor(
      { ...SOURCE, todayCounts: COUNTS },
      access,
    );
    expect(stats).toMatchObject({ ordersWaiting: 7, whatsappHeld: 2 });
    expect(todayKeys(stats)).toEqual(["ordersWaiting", "whatsappHeld"]);
  });

  it("keeps the WhatsApp number from a member without conversations", () => {
    const access = resolveDashboardFieldAccess(
      context("operator", ["shops.read", "orders.read", "orders.financials.read"]),
    );
    const { stats } = projectDashboardForTrustedActor(
      { ...SOURCE, todayCounts: COUNTS },
      access,
    );
    expect(stats).toMatchObject({ ordersWaiting: 7, codToCollectDzd: 45_000 });
    expect(todayKeys(stats)).toEqual(["ordersWaiting", "codToCollectDzd"]);
  });

  it("shows no order number to a member who cannot read orders, even with financials", () => {
    const access = resolveDashboardFieldAccess(
      context("operator", ["shops.read", "orders.financials.read", "conversations.read"]),
    );
    const { stats } = projectDashboardForTrustedActor(
      { ...SOURCE, todayCounts: COUNTS },
      access,
    );
    expect(todayKeys(stats)).toEqual(["whatsappHeld"]);
  });

  it("shows none of the three to a shops-only member", () => {
    const access = resolveDashboardFieldAccess(context("operator", ["shops.read"]));
    const { stats } = projectDashboardForTrustedActor(
      { ...SOURCE, todayCounts: COUNTS },
      access,
    );
    expect(todayKeys(stats)).toEqual([]);
  });

  it("omits only the key whose query failed (absent, never null)", () => {
    const access = resolveDashboardFieldAccess(context("owner"));
    const { stats } = projectDashboardForTrustedActor(
      { ...SOURCE, todayCounts: { ordersWaiting: 7, whatsappHeld: null, codToCollectDzd: 45_000 } },
      access,
    );
    expect(stats).toMatchObject({ ordersWaiting: 7, codToCollectDzd: 45_000 });
    expect(stats).not.toHaveProperty("whatsappHeld");
    expect(todayKeys(stats)).toEqual(["ordersWaiting", "codToCollectDzd"]);
  });

  it("publishes an empty shop as explicit zeros (0 is an answer, absent is unknown)", () => {
    const access = resolveDashboardFieldAccess(context("owner"));
    const { stats } = projectDashboardForTrustedActor(
      { ...SOURCE, todayCounts: { ordersWaiting: 0, whatsappHeld: 0, codToCollectDzd: 0 } },
      access,
    );
    expect(stats.ordersWaiting).toBe(0);
    expect(stats.whatsappHeld).toBe(0);
    expect(stats.codToCollectDzd).toBe(0);
  });

  it("never publishes a value the phone could not read as a whole count", () => {
    const access = resolveDashboardFieldAccess(context("owner"));
    const { stats } = projectDashboardForTrustedActor(
      { ...SOURCE, todayCounts: { ordersWaiting: -1, whatsappHeld: 2.5, codToCollectDzd: Number.NaN } },
      access,
    );
    expect(todayKeys(stats)).toEqual([]);
  });
});
