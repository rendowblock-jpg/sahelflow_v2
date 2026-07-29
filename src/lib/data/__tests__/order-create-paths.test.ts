process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { EcommerceCredentials, NormalizedOrder, SyncFetchResult } from "@/lib/integrations/ecommerce/types";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined })),
}));

const { mockAdapter, mockCreds, listOrdersMock, mockCredsProvider } = vi.hoisted(() => ({
  listOrdersMock: vi.fn(),
  mockAdapter: { platform: "shopify" as const, displayName: "Shopify", listOrdersSince: vi.fn() },
  mockCreds: { shop: "test", accessToken: "tok" } as EcommerceCredentials,
  mockCredsProvider: vi.fn(),
}));
mockAdapter.listOrdersSince = listOrdersMock;
vi.mock("@/lib/integrations/ecommerce/index", () => ({
  getEcommerceAdapter: vi.fn(() => mockAdapter),
  loadEcommerceCredentials: vi.fn((_context: unknown, platform: string) => mockCredsProvider(platform)),
}));
vi.mock("@/lib/integrations/delivery", () => ({
  getDeliveryAdapter: vi.fn(() => ({ id: "yalidine", name: "Yalidine", logo: "📦", estimateCost: vi.fn(), createShipment: vi.fn(), syncTracking: vi.fn() })),
  loadDeliveryCredentials: vi.fn().mockResolvedValue({ apiId: "x", apiToken: "y" }),
}));

import { POST as storefrontPost } from "@/app/api/storefront/submit/route";
import { POST as importPost } from "@/app/api/import/orders/route";
import { cleanDb, getJson, mockPost, rawDb, seedProduct, seedStorefront } from "@/app/api/__tests__/helpers";
import { syncPlatform } from "@/lib/integrations/ecommerce/sync-engine";
import "@/lib/ai/chat/tools/core-tools";
import { getTool, type ToolContext } from "@/lib/ai/chat/tools/registry";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";

beforeEach(async () => {
  await cleanDb();
  listOrdersMock.mockReset();
  mockCredsProvider.mockReset();
  mockCredsProvider.mockResolvedValue(mockCreds);
});
afterAll(async () => rawDb.$disconnect());

function importRequest(): NextRequest {
  const csv = [
    "Customer Name,Phone,Wilaya,Commune,Address,Product,Qty,Price,Delivery,Status",
    "Import Customer,0555123456,Alger,Bab Ezzouar,123 Rue Test,Imported Product,3,1500,0,pending",
  ].join("\n");
  const form = new FormData();
  form.append("file", new File([csv], "orders.csv", { type: "text/csv" }));
  form.append("commit", "true");
  form.append("mapping", JSON.stringify({
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
  }));
  return new NextRequest("http://localhost/api/import/orders", { method: "POST", body: form });
}

function syncOrder(overrides: Partial<NormalizedOrder> = {}): NormalizedOrder {
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

async function configureCreatedAutomation() {
  return rawDb.automation.create({
    data: {
      name: "New order notifier",
      trigger: "order.created",
      action: "send_notification",
      config: JSON.stringify({ messageTemplate: "New order {{orderNumber}}" }),
      isActive: true,
    },
  });
}

async function waitForCreatedLog(automationId: string) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    const [logs, automation] = await Promise.all([
      rawDb.automationLog.findMany({ where: { automationId, trigger: "order.created" } }),
      rawDb.automation.findUnique({ where: { id: automationId } }),
    ]);
    if (logs.length > 0 && (automation?.runCount ?? 0) > 0) return logs;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return [];
}

async function expectCreatedLedger(orderId: string) {
  expect(await rawDb.orderChange.count({ where: { orderId, actionType: "created" } })).toBe(1);
}

describe("Phase 1 order-create paths", () => {
  it("orderService.create writes the created ledger and trigger", async () => {
    const { orderService } = await import("@/lib/data/order-service");
    const automation = await configureCreatedAutomation();
    const customer = await rawDb.customer.create({
      data: {
        name: "Direct Create",
        phone: "0555123456",
        nameBlindIndex: "direct-create",
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue Didouche",
      },
    });
    const order = await orderService.create({ prisma: rawDb as never }, {
      customerId: customer.id,
      items: [{ productName: "Product", quantity: 2, unitPrice: 2500 }],
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: "0555123456",
      source: "manual",
    });
    await expectCreatedLedger(order.id);
    expect((await waitForCreatedLog(automation.id)).length).toBeGreaterThan(0);
  });

  it("storefront submit writes the created ledger and trigger", async () => {
    const automation = await configureCreatedAutomation();
    const product = await seedProduct({ price: 2500 });
    const storefront = await seedStorefront({ productIds: [product.id] });
    const response = await storefrontPost(mockPost("http://localhost/api/storefront/submit", {
      slug: storefront.slug,
      customer: { name: "Storefront Customer", phone: "0555123456", wilaya: "Alger", commune: "Bab Ezzouar", address: "123 Rue Test" },
      items: [{ productId: product.id, quantity: 2 }],
    }));
    expect(response.status).toBe(201);
    const body = await getJson(response);
    expect(body.ok).toBe(true);
    const orderId = body.orderId as string;
    expect(await rawDb.order.findUnique({ where: { id: orderId } })).toMatchObject({ source: "storefront" });
    await expectCreatedLedger(orderId);
    expect((await waitForCreatedLog(automation.id)).length).toBeGreaterThan(0);
  });

  it("import writes a created ledger while preserving explicit compatibility status", async () => {
    const response = await importPost(importRequest());
    expect(response.status).toBe(200);
    expect(await getJson(response)).toMatchObject({ inserted: 1 });
    const order = await rawDb.order.findFirstOrThrow();
    expect(order).toMatchObject({ source: "import", status: "pending" });
    await expectCreatedLedger(order.id);
  });

  it("ecommerce sync writes a created ledger and platform order number", async () => {
    listOrdersMock.mockResolvedValue({ orders: [syncOrder()], nextWatermark: "1002", hasMore: false } satisfies SyncFetchResult);
    expect(await syncPlatform({ prisma: rawDb as never, shop: TEST_SHOP_CONTEXT }, "shopify")).toMatchObject({ created: 1, errors: [] });
    const order = await rawDb.order.findFirstOrThrow();
    expect(order.orderNumber).toMatch(/^SYNC-SHOPIFY-\d{4}$/);
    expect(order.source).toBe("shopify");
    await expectCreatedLedger(order.id);
  });

  it("ecommerce cancellation propagates through the compatibility service with stock restoration", async () => {
    listOrdersMock.mockResolvedValueOnce({ orders: [syncOrder({ sourceOrderId: "shop-cancel-001" })], nextWatermark: "1002", hasMore: false } satisfies SyncFetchResult);
    await syncPlatform({ prisma: rawDb as never, shop: TEST_SHOP_CONTEXT }, "shopify");
    const order = await rawDb.order.findFirstOrThrow({ where: { sourceOrderId: "shop-cancel-001" } });
    const category = await rawDb.category.create({ data: { name: "Sync cancellation" } });
    const product = await rawDb.product.create({ data: { name: "Sync Product", price: 2000, stock: 3, categoryId: category.id, isActive: true } });
    await rawDb.orderItem.create({ data: { orderId: order.id, productId: product.id, productName: product.name, quantity: 2, unitPrice: 2000, total: 4000 } });
    await rawDb.order.update({ where: { id: order.id }, data: { status: "confirmed", confirmedAt: new Date() } });

    listOrdersMock.mockResolvedValueOnce({
      orders: [syncOrder({
        sourceOrderId: "shop-cancel-001",
        sourceMetadata: { shopifyOrderId: 1001, sourceOrderId: "shop-cancel-001", rawUpdatedAt: "2026-01-03T10:00:00Z", cancelReason: "customer" },
      })],
      nextWatermark: "1003",
      hasMore: false,
    } satisfies SyncFetchResult);
    expect(await syncPlatform({ prisma: rawDb as never, shop: TEST_SHOP_CONTEXT }, "shopify")).toMatchObject({ updated: 1, errors: [] });
    expect(await rawDb.order.findUnique({ where: { id: order.id } })).toMatchObject({ status: "cancelled" });
    expect((await rawDb.product.findUnique({ where: { id: product.id } }))?.stock).toBe(5);
    const latest = await rawDb.orderChange.findFirst({ where: { orderId: order.id, actionType: "status_change" }, orderBy: { createdAt: "desc" } });
    expect(JSON.parse(latest?.payload ?? "{}")).toMatchObject({ from: "confirmed", to: "cancelled" });
  });

  it("AI create_order writes the created ledger and ai_chat source", async () => {
    const product = await seedProduct({ price: 2500 });
    const customer = await rawDb.customer.create({
      data: {
        name: "AI Customer",
        phone: "0555123456",
        nameBlindIndex: "ai-customer",
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue Didouche",
      },
    });
    const tool = getTool("create_order")!;
    const result = await tool.execute({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 2 }],
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: "0555123456",
      notes: "AI-created order",
    }, { db: rawDb, shop: TEST_SHOP_CONTEXT } satisfies ToolContext);
    expect(result.success).toBe(true);
    const orderId = (result.data as { id: string }).id;
    expect(await rawDb.order.findUnique({ where: { id: orderId } })).toMatchObject({ source: "ai_chat" });
    await expectCreatedLedger(orderId);
  });
});
