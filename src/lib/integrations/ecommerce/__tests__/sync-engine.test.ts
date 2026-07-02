/**
 * E-commerce sync-engine tests (T-INTEGRATIONS).
 *
 * Tests the full syncPlatform flow with a mocked adapter + real Prisma DB
 * (with PII encryption extension). Verifies:
 *   - Orders + customers + items are created on first sync
 *   - The Integration record is upserted with the new watermark + lastSyncAt
 *   - Re-syncing the same orders does NOT duplicate (dedup by sourceOrderId)
 *   - Syncing a mix of new + existing orders creates only the new ones
 *   - Customer find-or-create (same phone → same customer, multiple orders)
 *   - Empty fetch result is a no-op (still updates Integration.lastSyncAt)
 *   - Adapter fetch error is caught and returned in result.errors
 *   - Missing credentials return an error result
 *   - syncAllPlatforms iterates and skips platforms without creds
 *
 * Pattern: vi.mock("../index") returns a fake adapter whose listOrdersSince
 * is a vi.fn() we configure per-test. Real DB is cleaned beforeEach.
 */
process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import type { NormalizedOrder, SyncFetchResult, EcommerceCredentials } from "../types";

// ── Mock the adapter registry + credentials loader ──────────────────────────
const { mockAdapter, mockCreds, listOrdersMock, mockCredsProvider } = vi.hoisted(() => {
  const listOrdersMock = vi.fn();
  // Per-platform credentials provider (so syncAllPlatforms can have creds for
  // some platforms and not others). Tests mutate this.
  const credsProvider = vi.fn();
  return {
    listOrdersMock,
    mockAdapter: {
      platform: "shopify" as const,
      displayName: "Shopify",
      listOrdersSince: listOrdersMock,
    },
    mockCreds: { shop: "test", accessToken: "tok" } as EcommerceCredentials,
    mockCredsProvider: credsProvider,
  };
});

vi.mock("../index", () => ({
  getEcommerceAdapter: vi.fn(() => mockAdapter),
  loadEcommerceCredentials: vi.fn((platform: string) => mockCredsProvider(platform)),
}));

// Import AFTER the mock so sync-engine uses the mocked registry.
import { syncPlatform, syncAllPlatforms } from "../sync-engine";
import { db } from "@/lib/db";

async function cleanDb() {
  await db.$transaction([
    db.orderItem.deleteMany(),
    db.order.deleteMany(),
    db.customer.deleteMany(),
    db.integration.deleteMany(),
    db.pollingEvent.deleteMany(),
    db.counter.deleteMany(),
  ]);
}

function makeOrder(overrides: Partial<NormalizedOrder> = {}): NormalizedOrder {
  const sourceOrderId = overrides.sourceOrderId ?? "shop-001";
  // Include sourceOrderId in sourceMetadata so the sync engine's dedup
  // (which checks `sourceMetadata CONTAINS sourceOrderId` on the JSON string)
  // finds it on re-sync. Mirrors the real Shopify adapter where
  // sourceMetadata.shopifyOrderId === sourceOrderId.
  const defaultMetadata: Record<string, unknown> = {
    shopifyOrderId: 1001,
    shopifyOrderNumber: 1001,
    sourceOrderId,
  };
  return {
    sourceOrderId,
    orderNumber: "#1001",
    customerName: "Ahmed Benali",
    customerPhone: "0555123456",
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    address: "123 Rue Didouche",
    items: [{ productName: "Widget A", quantity: 2, unitPrice: 2000 }],
    totalPrice: 4000,
    source: "shopify",
    sourceMetadata: defaultMetadata as NormalizedOrder["sourceMetadata"],
    createdAt: "2026-01-02T10:00:00Z",
    ...overrides,
  };
}

describe("sync-engine (syncPlatform)", () => {
  beforeEach(async () => {
    await cleanDb();
    listOrdersMock.mockReset();
    mockCredsProvider.mockReset();
    mockCredsProvider.mockResolvedValue(mockCreds);
  });

  afterAll(async () => {
    await cleanDb();
    await db.$disconnect();
  });

  it("creates orders + customers + items on first sync", async () => {
    listOrdersMock.mockResolvedValueOnce({
      orders: [
        makeOrder(),
        makeOrder({
          sourceOrderId: "shop-002",
          orderNumber: "#1002",
          customerPhone: "0555999888",
          customerName: "Imene Ouali",
          sourceMetadata: { shopifyOrderId: 1002, shopifyOrderNumber: 1002 },
        }),
      ],
      nextWatermark: "1002",
      hasMore: false,
    } satisfies SyncFetchResult);

    const result = await syncPlatform("shopify");

    expect(result.platform).toBe("shopify");
    expect(result.fetched).toBe(2);
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.watermark).toBe("1002");
    expect(result.hasMore).toBe(false);
    expect(result.errors).toHaveLength(0);

    // DB: 2 orders, 2 customers, 1 item each
    const orders = await db.order.findMany({ include: { items: true } });
    expect(orders).toHaveLength(2);

    const customers = await db.customer.findMany();
    expect(customers).toHaveLength(2);

    expect(orders[0]!.items).toHaveLength(1);
    expect(orders[1]!.items).toHaveLength(1);

    for (const o of orders) {
      expect(o.status).toBe("draft");
      expect(o.source).toBe("shopify");
    }

    for (const o of orders) {
      expect(o.orderNumber).toMatch(/^SYNC-SHOPIFY-\d+$/);
    }
  });

  it("persists items with correct quantity + unitPrice + total", async () => {
    listOrdersMock.mockResolvedValueOnce({
      orders: [
        makeOrder({
          items: [
            { productName: "A", quantity: 2, unitPrice: 1500 },
            { productName: "B", quantity: 3, unitPrice: 1000 },
          ],
          totalPrice: 6000,
        }),
      ],
      nextWatermark: "1",
      hasMore: false,
    });

    await syncPlatform("shopify");

    const items = await db.orderItem.findMany();
    expect(items).toHaveLength(2);
    const a = items.find((i) => i.productName === "A")!;
    const b = items.find((i) => i.productName === "B")!;
    expect(a.quantity).toBe(2);
    expect(a.unitPrice).toBe(1500);
    expect(a.total).toBe(3000);
    expect(b.quantity).toBe(3);
    expect(b.unitPrice).toBe(1000);
    expect(b.total).toBe(3000);
  });

  it("creates customer with normalized fields (name, phone, wilaya, commune, address)", async () => {
    listOrdersMock.mockResolvedValueOnce({
      orders: [makeOrder()],
      nextWatermark: "1",
      hasMore: false,
    });

    await syncPlatform("shopify");

    const customers = await db.customer.findMany();
    expect(customers).toHaveLength(1);
    const c = customers[0]!;
    expect(c.name).toBe("Ahmed Benali");
    expect(c.phone).toBe("0555123456"); // decrypted by PII extension
    expect(c.wilaya).toBe("Alger");
    expect(c.commune).toBe("Bab Ezzouar");
    expect(c.address).toBe("123 Rue Didouche"); // decrypted
  });

  it("reuses existing customer when phone matches (find-or-create)", async () => {
    // First sync: 1 order
    listOrdersMock.mockResolvedValueOnce({
      orders: [makeOrder()],
      nextWatermark: "1",
      hasMore: false,
    });
    await syncPlatform("shopify");

    // Second sync: 2 orders, both with the SAME phone as the first
    listOrdersMock.mockResolvedValueOnce({
      orders: [
        makeOrder({ sourceOrderId: "shop-002", orderNumber: "#1002" }),
        makeOrder({ sourceOrderId: "shop-003", orderNumber: "#1003" }),
      ],
      nextWatermark: "3",
      hasMore: false,
    });
    await syncPlatform("shopify");

    // Should have 3 orders but only 1 customer (same phone)
    const orders = await db.order.findMany();
    expect(orders).toHaveLength(3);
    const customers = await db.customer.findMany();
    expect(customers).toHaveLength(1);
  });

  it("stores sourceMetadata as JSON with platform-specific fields", async () => {
    listOrdersMock.mockResolvedValueOnce({
      orders: [makeOrder({ sourceOrderId: "shop-XYZ-42" })],
      nextWatermark: "1",
      hasMore: false,
    });
    await syncPlatform("shopify");

    const orders = await db.order.findMany();
    expect(orders).toHaveLength(1);
    const meta = JSON.parse(orders[0]!.sourceMetadata ?? "{}");
    expect(meta.shopifyOrderId).toBe(1001);
  });

  it("does NOT duplicate orders on re-sync (dedup by sourceOrderId)", async () => {
    listOrdersMock.mockResolvedValueOnce({
      orders: [makeOrder(), makeOrder({ sourceOrderId: "shop-002" })],
      nextWatermark: "2",
      hasMore: false,
    });
    const r1 = await syncPlatform("shopify");
    expect(r1.created).toBe(2);
    expect(r1.skipped).toBe(0);

    // Re-sync the same orders
    listOrdersMock.mockResolvedValueOnce({
      orders: [makeOrder(), makeOrder({ sourceOrderId: "shop-002" })],
      nextWatermark: "2",
      hasMore: false,
    });
    const r2 = await syncPlatform("shopify");
    expect(r2.fetched).toBe(2);
    expect(r2.created).toBe(0);
    expect(r2.skipped).toBe(2);
    expect(r2.errors).toHaveLength(0);

    // DB still has only 2 orders
    const orders = await db.order.findMany();
    expect(orders).toHaveLength(2);
  });

  it("creates only new orders on subsequent sync (mixed new + existing)", async () => {
    listOrdersMock.mockResolvedValueOnce({
      orders: [makeOrder(), makeOrder({ sourceOrderId: "shop-002" })],
      nextWatermark: "2",
      hasMore: false,
    });
    await syncPlatform("shopify");

    listOrdersMock.mockResolvedValueOnce({
      orders: [
        makeOrder(), // existing
        makeOrder({ sourceOrderId: "shop-002" }), // existing
        makeOrder({ sourceOrderId: "shop-003", orderNumber: "#1003" }), // new
      ],
      nextWatermark: "3",
      hasMore: false,
    });
    const r2 = await syncPlatform("shopify");
    expect(r2.fetched).toBe(3);
    expect(r2.created).toBe(1);
    expect(r2.skipped).toBe(2);

    const orders = await db.order.findMany();
    expect(orders).toHaveLength(3);
  });

  it("updates Integration record with new watermark + lastSyncAt", async () => {
    listOrdersMock.mockResolvedValueOnce({
      orders: [makeOrder()],
      nextWatermark: "9999",
      hasMore: false,
    });
    await syncPlatform("shopify");

    const integration = await db.integration.findUnique({ where: { platform: "shopify" } });
    expect(integration).not.toBeNull();
    expect(integration!.type).toBe("E-commerce");
    expect(integration!.isActive).toBe(true);
    expect(integration!.lastSyncAt).not.toBeNull();
    const config = JSON.parse(integration!.config ?? "{}");
    expect(config.watermark).toBe("9999");
    expect(config.lastSyncAt).toBeTruthy();
  });

  it("passes the persisted watermark from Integration.config to the adapter", async () => {
    // Pre-populate the Integration with a watermark
    await db.integration.create({
      data: {
        platform: "shopify",
        type: "E-commerce",
        isActive: true,
        config: JSON.stringify({ watermark: "PREVIOUS-WATERMARK", lastSyncAt: "" }),
      },
    });

    listOrdersMock.mockResolvedValueOnce({
      orders: [],
      nextWatermark: "",
      hasMore: false,
    });
    await syncPlatform("shopify");

    expect(listOrdersMock).toHaveBeenCalledWith(
      mockCreds,
      "PREVIOUS-WATERMARK",
      10,
    );
  });

  it("handles corrupt Integration.config gracefully (starts fresh)", async () => {
    await db.integration.create({
      data: {
        platform: "shopify",
        type: "E-commerce",
        isActive: true,
        config: "not valid json {{{",
      },
    });

    listOrdersMock.mockResolvedValueOnce({
      orders: [makeOrder()],
      nextWatermark: "1",
      hasMore: false,
    });
    const result = await syncPlatform("shopify");
    expect(result.created).toBe(1);
    // The adapter should have been called with "" (default watermark)
    expect(listOrdersMock).toHaveBeenCalledWith(mockCreds, "", 10);
  });

  it("returns no-creds error when credentials are missing", async () => {
    mockCredsProvider.mockResolvedValueOnce(null);

    const result = await syncPlatform("shopify");
    expect(result.fetched).toBe(0);
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("No credentials");
    expect(listOrdersMock).not.toHaveBeenCalled();
  });

  it("catches adapter fetch errors and returns them in result.errors", async () => {
    listOrdersMock.mockRejectedValueOnce(new Error("Shopify API 503"));

    const result = await syncPlatform("shopify");
    expect(result.fetched).toBe(0);
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Fetch failed");
    expect(result.errors[0]).toContain("Shopify API 503");
  });

  it("empty fetch result updates the watermark but creates no orders", async () => {
    listOrdersMock.mockResolvedValueOnce({
      orders: [],
      nextWatermark: "new-watermark",
      hasMore: false,
    });
    const result = await syncPlatform("shopify");
    expect(result.fetched).toBe(0);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.watermark).toBe("new-watermark");
    expect(result.errors).toHaveLength(0);

    // Integration still updated
    const integration = await db.integration.findUnique({ where: { platform: "shopify" } });
    expect(integration).not.toBeNull();
    const config = JSON.parse(integration!.config ?? "{}");
    expect(config.watermark).toBe("new-watermark");
  });

  it("uses synthetic phone when customerPhone is empty", async () => {
    listOrdersMock.mockResolvedValueOnce({
      orders: [
        makeOrder({
          sourceOrderId: "shop-no-phone",
          customerPhone: "", // empty
        }),
      ],
      nextWatermark: "1",
      hasMore: false,
    });
    const result = await syncPlatform("shopify");
    expect(result.created).toBe(1);

    const customers = await db.customer.findMany();
    expect(customers).toHaveLength(1);
    // Synthetic phone starts with "05" + 8 digits
    expect(customers[0]!.phone).toMatch(/^05\d{8}$/);
  });

  it("uses itemsTotal when totalPrice is 0", async () => {
    listOrdersMock.mockResolvedValueOnce({
      orders: [
        makeOrder({
          items: [
            { productName: "A", quantity: 2, unitPrice: 1500 },
            { productName: "B", quantity: 1, unitPrice: 1000 },
          ],
          totalPrice: 0, // should fall back to itemsTotal
        }),
      ],
      nextWatermark: "1",
      hasMore: false,
    });
    await syncPlatform("shopify");

    const orders = await db.order.findMany();
    expect(orders).toHaveLength(1);
    // 2*1500 + 1*1000 = 4000
    expect(orders[0]!.totalPrice).toBe(4000);
  });
});

describe("sync-engine (syncAllPlatforms)", () => {
  beforeEach(async () => {
    await cleanDb();
    listOrdersMock.mockReset();
    mockCredsProvider.mockReset();
  });

  afterAll(async () => {
    await cleanDb();
    await db.$disconnect();
  });

  it("syncs all platforms that have credentials", async () => {
    // All 3 platforms have creds. Each call returns a DIFFERENT order so dedup
    // doesn't kick in across platforms (source/sourceOrderId differ).
    mockCredsProvider.mockResolvedValue(mockCreds);
    listOrdersMock
      .mockResolvedValueOnce({
        orders: [makeOrder({ sourceOrderId: "shop-001", source: "shopify" })],
        nextWatermark: "1",
        hasMore: false,
      })
      .mockResolvedValueOnce({
        orders: [makeOrder({ sourceOrderId: "woo-001", source: "woocommerce", orderNumber: "#W1" })],
        nextWatermark: "1",
        hasMore: false,
      })
      .mockResolvedValueOnce({
        orders: [makeOrder({ sourceOrderId: "yc-001", source: "youcan", orderNumber: "#Y1" })],
        nextWatermark: "1",
        hasMore: false,
      });

    const results = await syncAllPlatforms();

    expect(results).toHaveLength(3); // shopify, woocommerce, youcan
    for (const r of results) {
      expect(r.created).toBe(1);
    }
    // 3 orders total across all platforms (one per platform — different sources)
    const orders = await db.order.findMany();
    expect(orders).toHaveLength(3);

    // Each platform uses its own counter prefix
    const sources = orders.map((o) => o.source).sort();
    expect(sources).toEqual(["shopify", "woocommerce", "youcan"]);
  });

  it("skips platforms without credentials", async () => {
    // Only shopify has creds
    mockCredsProvider.mockImplementation(async (platform: string) =>
      platform === "shopify" ? mockCreds : null,
    );
    listOrdersMock.mockResolvedValue({
      orders: [makeOrder()],
      nextWatermark: "1",
      hasMore: false,
    });

    const results = await syncAllPlatforms();
    expect(results).toHaveLength(1); // only shopify
    expect(results[0]!.platform).toBe("shopify");
    expect(results[0]!.created).toBe(1);
  });

  it("returns empty array when no platform has credentials", async () => {
    mockCredsProvider.mockResolvedValue(null);

    const results = await syncAllPlatforms();
    expect(results).toHaveLength(0);
  });
});
