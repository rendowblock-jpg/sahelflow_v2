/**
 * Regression test for Phase 1 bug 1.3 — 4 of the 5 order-creation paths
 * bypassed `orderService.create` (storefront/submit, import/orders, ecommerce
 * sync-engine, AI core-tools `create_order`), so they:
 *   - never wrote an OrderChange "created" ledger entry (the order timeline
 *     showed no "created" event for storefront/import/sync/AI orders)
 *   - never fired the `order.created` automation trigger (so "new order →
 *     WhatsApp notify" automations only worked for manual UI orders, not for
 *     storefront/import/sync/AI orders — the most common new-order channels)
 *   - didn't go through the canonical orderNumber / status / totalPrice flow
 *
 * Also: the sync-engine's cancellation propagation used a raw
 * `db.order.update({ status: "cancelled" })` that bypassed
 * `orderService.updateStatus` → stock stayed deducted, no `order.cancelled`
 * trigger fired, no OrderChange ledger entry was written.
 *
 * After the fix, all 4 paths route through `orderService.create` (which writes
 * the "created" ledger entry + fires `order.created`) and the sync-engine
 * cancellation propagates through `orderService.updateStatus("cancelled")`.
 *
 * This test verifies each path produces:
 *   1. An OrderChange row with actionType = "created"
 *   2. (with an automation configured) the `order.created` trigger fires
 *
 * Plus: sync-engine cancellation produces the side effects of
 * orderService.updateStatus("cancelled") (OrderChange "status_change" entry).
 */
process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import type { NormalizedOrder, SyncFetchResult, EcommerceCredentials } from "@/lib/integrations/ecommerce/types";

// ── Mock next/headers cookies() — the import route calls requireAuth() which
//    reads the auth cookie. With a clean DB (no AuthSecret row),
//    isAuthenticated() returns true (setup mode), so an empty cookie jar
//    passes requireAuth.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

// ── Mock the e-commerce adapter registry + credentials loader ────────────────
// Same pattern as src/lib/integrations/ecommerce/__tests__/sync-engine.test.ts
const { mockAdapter, mockCreds, listOrdersMock, mockCredsProvider } = vi.hoisted(() => {
  const listOrdersMock = vi.fn();
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

vi.mock("@/lib/integrations/ecommerce/index", () => ({
  getEcommerceAdapter: vi.fn(() => mockAdapter),
  loadEcommerceCredentials: vi.fn((_context: unknown, platform: string) => mockCredsProvider(platform)),
}));

// ── Mock the delivery adapter so importing core-tools (which imports the
//    delivery registry at module-load) doesn't try to hit any real provider.
vi.mock("@/lib/integrations/delivery", () => ({
  getDeliveryAdapter: vi.fn(() => ({
    id: "yalidine",
    name: "Yalidine",
    logo: "📦",
    estimateCost: vi.fn(),
    createShipment: vi.fn(),
    syncTracking: vi.fn(),
  })),
  loadDeliveryCredentials: vi.fn().mockResolvedValue({ apiId: "x", apiToken: "y" }),
}));

// Import the route handlers + tools AFTER mocks are in place.
import { POST as storefrontPost } from "@/app/api/storefront/submit/route";
import { POST as importPost } from "@/app/api/import/orders/route";
import { syncPlatform } from "@/lib/integrations/ecommerce/sync-engine";
import "@/lib/ai/chat/tools/core-tools"; // side-effect: registers the AI tools
import { getTool, type ToolContext } from "@/lib/ai/chat/tools/registry";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";

import {
  rawDb,
  cleanDb,
  mockPost,
  getJson,
  seedStorefront,
  seedProduct,
} from "@/app/api/__tests__/helpers";

afterAll(async () => {
  await rawDb.$disconnect();
});

beforeEach(async () => {
  await cleanDb();
  listOrdersMock.mockReset();
  mockCredsProvider.mockReset();
  mockCredsProvider.mockResolvedValue(mockCreds);
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a FormData POST request for /api/import/orders with a single CSV row.
 * (mockPost builds JSON-only requests; the import route needs multipart form.)
 */
function buildImportRequest(opts: {
  customerName: string;
  phone: string;
  wilaya: string;
  commune?: string;
  address?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  deliveryCost?: number;
  status?: string;
}): NextRequest {
  const rows = [
    [
      "Customer Name",
      "Phone",
      "Wilaya",
      "Commune",
      "Address",
      "Product",
      "Qty",
      "Price",
      "Delivery",
      "Status",
    ].join(","),
    [
      opts.customerName,
      opts.phone,
      opts.wilaya,
      opts.commune ?? "Bab Ezzouar",
      opts.address ?? "123 Rue Test",
      opts.productName,
      String(opts.quantity),
      String(opts.unitPrice),
      String(opts.deliveryCost ?? 0),
      opts.status ?? "pending",
    ].join(","),
  ].join("\n");

  const fd = new FormData();
  fd.append("file", new File([rows], "orders.csv", { type: "text/csv" }));
  fd.append("commit", "true");
  // Explicit mapping: source CSV header → target field key
  fd.append(
    "mapping",
    JSON.stringify({
      "Customer Name": "customerName",
      Phone: "phone",
      Wilaya: "wilaya",
      Commune: "commune",
      Address: "address",
      Product: "productName",
      Qty: "quantity",
      Price: "unitPrice",
      Delivery: "deliveryCost",
      Status: "status",
    }),
  );
  return new NextRequest("http://localhost/api/import/orders", {
    method: "POST",
    body: fd,
  });
}

/** Build a NormalizedOrder for the sync-engine mock adapter. */
function makeSyncOrder(overrides: Partial<NormalizedOrder> = {}): NormalizedOrder {
  const sourceOrderId = overrides.sourceOrderId ?? "shop-001";
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
    sourceMetadata: { shopifyOrderId: 1001, sourceOrderId, rawUpdatedAt: "2026-01-02T10:00:00Z" },
    createdAt: "2026-01-02T10:00:00Z",
    ...overrides,
  };
}

/** Configure a `order.created` automation that runs `send_notification`. */
async function configureOrderCreatedAutomation() {
  return rawDb.automation.create({
    data: {
      name: "New order notifier",
      trigger: "order.created",
      action: "send_notification",
      config: JSON.stringify({ messageTemplate: "New order: {{orderNumber}}" }),
      isActive: true,
      runCount: 0,
    },
  });
}

/** Poll AutomationLog for an `order.created` row (or timeout). */
async function waitForCreatedLog(timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const logs = await rawDb.automationLog.findMany({
      where: { trigger: "order.created" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    if (logs.length > 0) return logs;
    await new Promise((r) => setTimeout(r, 25));
  }
  return [];
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Phase 1 bug 1.3 — order-create paths produce OrderChange 'created' ledger entry", () => {
  it("orderService.create (base case) writes an OrderChange 'created' entry + fires the order.created trigger", async () => {
    const { orderService } = await import("@/lib/data/order-service");
    await configureOrderCreatedAutomation();

    // Seed a customer directly via rawDb (no PII extension — the service
    // reads it back via the ctx.prisma client which here is also rawDb).
    const customer = await rawDb.customer.create({
      data: {
        name: "Direct Create Test",
        phone: "0555123456",
        nameBlindIndex: "direct-create-test",
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue Didouche",
      },
    });

    const order = await orderService.create(
      { prisma: rawDb as never },
      {
        customerId: customer.id,
        items: [{ productName: "Test Product", quantity: 2, unitPrice: 2500 }],
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue Didouche",
        phone: "0555123456",
        source: "manual",
      },
    );

    expect(order.id).toBeTruthy();

    // OrderChange "created" ledger entry exists.
    const changes = await rawDb.orderChange.findMany({
      where: { orderId: order.id, actionType: "created" },
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]!.actor).toBe("user");

    // order.created automation trigger fires (eventually).
    const logs = await waitForCreatedLog();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]!.trigger).toBe("order.created");
  });

  // ── 2. POST /api/storefront/submit ────────────────────────────────────────

  it("POST /api/storefront/submit writes an OrderChange 'created' entry", async () => {
    const product = await seedProduct({ price: 2500 });
    const storefront = await seedStorefront({ productIds: [product.id] });

    const res = await storefrontPost(
      mockPost("http://localhost/api/storefront/submit", {
        slug: storefront.slug,
        customer: {
          name: "Storefront Customer",
          phone: "0555123456",
          wilaya: "Alger",
          commune: "Bab Ezzouar",
          address: "123 Rue Test",
        },
        items: [{ productId: product.id, quantity: 2 }],
      }),
    );

    expect(res.status).toBe(201);
    const body = await getJson(res);
    expect(body.ok).toBe(true);
    const orderId = body.orderId as string;

    // The order was created with source="storefront" (the service preserves
    // the source field from the schema).
    const order = await rawDb.order.findUnique({ where: { id: orderId } });
    expect(order!.source).toBe("storefront");

    // OrderChange "created" ledger entry exists.
    const changes = await rawDb.orderChange.findMany({
      where: { orderId, actionType: "created" },
    });
    expect(changes).toHaveLength(1);
  });

  it("POST /api/storefront/submit fires the order.created trigger when an automation is configured", async () => {
    await configureOrderCreatedAutomation();
    const product = await seedProduct({ price: 2500 });
    const storefront = await seedStorefront({ productIds: [product.id] });

    const res = await storefrontPost(
      mockPost("http://localhost/api/storefront/submit", {
        slug: storefront.slug,
        customer: {
          name: "Storefront Trigger Test",
          phone: "0555123456",
          wilaya: "Alger",
          commune: "Bab Ezzouar",
          address: "123 Rue Test",
        },
        items: [{ productId: product.id, quantity: 1 }],
      }),
    );
    expect(res.status).toBe(201);

    const logs = await waitForCreatedLog();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]!.trigger).toBe("order.created");
  });

  // ── 3. POST /api/import/orders ────────────────────────────────────────────

  it("POST /api/import/orders writes an OrderChange 'created' entry for each imported row", async () => {
    const req = buildImportRequest({
      customerName: "Import Customer",
      phone: "0555123456",
      wilaya: "Alger",
      productName: "Imported Product",
      quantity: 3,
      unitPrice: 1500,
      status: "pending",
    });

    const res = await importPost(req);

    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.inserted).toBe(1);

    const orders = await rawDb.order.findMany();
    expect(orders).toHaveLength(1);

    const changes = await rawDb.orderChange.findMany({
      where: { orderId: orders[0]!.id, actionType: "created" },
    });
    expect(changes).toHaveLength(1);

    // The import path can set a user-specified status (default "pending").
    expect(orders[0]!.status).toBe("pending");
  });

  // ── 4. E-commerce sync-engine (syncPlatform) ──────────────────────────────

  it("syncPlatform (new order) writes an OrderChange 'created' entry + the order gets a SYNC-<PLATFORM> order number", async () => {
    const normalized = makeSyncOrder();
    listOrdersMock.mockResolvedValue({
      orders: [normalized],
      nextWatermark: "1002",
      hasMore: false,
    } satisfies SyncFetchResult);

    const result = await syncPlatform(
      { prisma: rawDb as never, shop: TEST_SHOP_CONTEXT },
      "shopify",
    );

    expect(result.created).toBe(1);
    expect(result.errors).toEqual([]);

    const orders = await rawDb.order.findMany();
    expect(orders).toHaveLength(1);
    // The sync-engine passes `orderNumberPrefix: "SYNC-SHOPIFY"` so synced
    // orders are distinguishable from manual/AI/storefront orders.
    expect(orders[0]!.orderNumber).toMatch(/^SYNC-SHOPIFY-\d{4}$/);
    expect(orders[0]!.source).toBe("shopify");

    const changes = await rawDb.orderChange.findMany({
      where: { orderId: orders[0]!.id, actionType: "created" },
    });
    expect(changes).toHaveLength(1);
  });

  it("syncPlatform (cancellation propagation) routes through orderService.updateStatus('cancelled') — OrderChange 'status_change' entry written + stock restored", async () => {
    // First sync: create the order in draft status.
    const firstOrder = makeSyncOrder({ sourceOrderId: "shop-cancel-001" });
    listOrdersMock.mockResolvedValueOnce({
      orders: [firstOrder],
      nextWatermark: "1002",
      hasMore: false,
    } satisfies SyncFetchResult);
    await syncPlatform(
      { prisma: rawDb as never, shop: TEST_SHOP_CONTEXT },
      "shopify",
    );

    const created = await rawDb.order.findFirst({
      where: { sourceOrderId: "shop-cancel-001" },
    });
    expect(created).toBeTruthy();
    expect(created!.status).toBe("draft");

    // Move the order through the state machine to "confirmed" + deduct stock.
    // (The sync-engine creates draft orders; the merchant confirms them in the
    // UI. We simulate that step here so the cancellation transition is valid.)
    const product = await rawDb.product.create({
      data: {
        name: "Sync Product",
        price: 2000,
        stock: 5, // start low so we can assert stock reversal clearly
        categoryId: (await rawDb.category.create({ data: { name: "Sync Cat" } })).id,
        isActive: true,
      },
    });
    // Attach an order item with a productId so stock restoration has something
    // to restore. (The sync-engine creates items with no productId — they're
    // catalog-agnostic. For this test we add a stock-bearing item manually.)
    await rawDb.orderItem.create({
      data: {
        orderId: created!.id,
        productId: product.id,
        productName: "Sync Product",
        quantity: 2,
        unitPrice: 2000,
        total: 4000,
      },
    });
    const { orderService } = await import("@/lib/data/order-service");
    // The order state machine is draft → pending → confirmed (stock deducted
    // at confirm). Sync creates draft orders; the merchant would move them to
    // pending then confirm in the UI. We simulate both steps here so the
    // cancellation transition (confirmed → cancelled) is valid.
    await orderService.updateStatus({ prisma: rawDb as never }, created!.id, "pending");
    await orderService.updateStatus({ prisma: rawDb as never }, created!.id, "confirmed");
    // Stock deducted: 5 → 3.
    const productAfterConfirm = await rawDb.product.findUnique({ where: { id: product.id } });
    expect(productAfterConfirm!.stock).toBe(3);

    // Second sync: platform reports the order as cancelled (Shopify
    // cancel_reason set). The engine should propagate the cancellation via
    // orderService.updateStatus("cancelled") — stock restored (3 → 5),
    // OrderChange "status_change" entry written, sourceMetadata updated.
    const cancelledOrder = makeSyncOrder({
      sourceOrderId: "shop-cancel-001",
      sourceMetadata: {
        shopifyOrderId: 1001,
        sourceOrderId: "shop-cancel-001",
        rawUpdatedAt: "2026-01-03T10:00:00Z", // changed → triggers update path
        cancelReason: "customer",
      },
    });
    listOrdersMock.mockResolvedValueOnce({
      orders: [cancelledOrder],
      nextWatermark: "1003",
      hasMore: false,
    } satisfies SyncFetchResult);

    const result = await syncPlatform(
      { prisma: rawDb as never, shop: TEST_SHOP_CONTEXT },
      "shopify",
    );
    expect(result.updated).toBe(1);
    expect(result.errors).toEqual([]);

    // Order status is now "cancelled".
    const updated = await rawDb.order.findUnique({ where: { id: created!.id } });
    expect(updated!.status).toBe("cancelled");

    // Stock restored: 3 → 5.
    const productAfterCancel = await rawDb.product.findUnique({ where: { id: product.id } });
    expect(productAfterCancel!.stock).toBe(5);

    // OrderChange "status_change" entry was written by orderService.updateStatus.
    const statusChanges = await rawDb.orderChange.findMany({
      where: { orderId: created!.id, actionType: "status_change" },
    });
    expect(statusChanges.length).toBeGreaterThan(0);
    // The most recent status_change entry reflects the cancellation.
    const lastChange = statusChanges.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
    const payload = JSON.parse(lastChange.payload ?? "{}") as { from: string; to: string };
    expect(payload.to).toBe("cancelled");
  });

  // ── 5. AI core-tools create_order ─────────────────────────────────────────

  it("AI create_order tool writes an OrderChange 'created' entry + the order has source='ai_chat'", async () => {
    const product = await seedProduct({ price: 2500 });
    const customer = await rawDb.customer.create({
      data: {
        name: "AI Tool Customer",
        phone: "0555123456",
        nameBlindIndex: "ai-tool-customer",
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue Didouche",
      },
    });

    const tool = getTool("create_order")!;
    expect(tool).toBeTruthy();

    const ctx: ToolContext = { db: rawDb, shop: TEST_SHOP_CONTEXT };
    const result = await tool.execute(
      {
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 2 }],
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue Didouche",
        phone: "0555123456",
        notes: "AI-created order",
      },
      ctx,
    );

    expect(result.success).toBe(true);
    const data = result.data as { id: string; orderNumber: string };
    expect(data.id).toBeTruthy();

    const order = await rawDb.order.findUnique({ where: { id: data.id } });
    expect(order!.source).toBe("ai_chat");

    const changes = await rawDb.orderChange.findMany({
      where: { orderId: data.id, actionType: "created" },
    });
    expect(changes).toHaveLength(1);
  });
});
