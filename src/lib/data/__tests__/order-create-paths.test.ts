process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  EcommerceCredentials,
  NormalizedOrder,
  SyncFetchResult,
} from "@/lib/integrations/ecommerce/types";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

const { mockAdapter, listOrdersMock, mockCredentialsProvider } = vi.hoisted(() => {
  const listOrders = vi.fn();
  const credentialsProvider = vi.fn();
  return {
    listOrdersMock: listOrders,
    mockCredentialsProvider: credentialsProvider,
    mockAdapter: {
      platform: "shopify" as const,
      displayName: "Shopify",
      listOrdersSince: listOrders,
    },
  };
});

vi.mock("@/lib/integrations/ecommerce/index", () => ({
  getEcommerceAdapter: vi.fn(() => mockAdapter),
  loadEcommerceCredentials: vi.fn(
    (_context: unknown, platform: string) =>
      mockCredentialsProvider(platform),
  ),
}));

vi.mock("@/lib/integrations/delivery", () => ({
  getDeliveryAdapter: vi.fn(() => ({
    id: "yalidine",
    name: "Yalidine",
    logo: "📦",
    estimateCost: vi.fn(),
    createShipment: vi.fn(),
    syncTracking: vi.fn(),
  })),
  loadDeliveryCredentials: vi.fn().mockResolvedValue({
    apiId: "x",
    apiToken: "y",
  }),
}));

import { POST as importPost } from "@/app/api/import/orders/route";
import { POST as storefrontPost } from "@/app/api/storefront/submit/route";
import {
  cleanDb,
  getJson,
  mockPost,
  rawDb,
  seedProduct,
  seedStorefront,
} from "@/app/api/__tests__/helpers";
import "@/lib/ai/chat/tools/core-tools";
import { getTool, type ToolContext } from "@/lib/ai/chat/tools/registry";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";
import { orderService } from "@/lib/data/order-service";
import { syncPlatform } from "@/lib/integrations/ecommerce/sync-engine";
import { isCanonicalOrderAuthority } from "@/lib/orders/manual-order-authority";

const credentials = {
  shop: "test",
  accessToken: "token",
} as EcommerceCredentials;

beforeEach(async () => {
  await cleanDb();
  listOrdersMock.mockReset();
  mockCredentialsProvider.mockReset().mockResolvedValue(credentials);
});

afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

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

async function waitForCreatedLog(timeoutMs = 2500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const logs = await rawDb.automationLog.findMany({
      where: { trigger: "order.created" },
      orderBy: { createdAt: "desc" },
    });
    if (logs.length > 0) return logs;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return [];
}

function importRequest(productName: string, unitPrice: number): NextRequest {
  const contents = [
    [
      "Order",
      "Customer",
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
      "EXT-IMPORT-1",
      "Import Customer",
      "0555123456",
      "Alger",
      "Bab Ezzouar",
      "123 Import Street",
      productName,
      "3",
      String(unitPrice),
      "0",
      "pending",
    ].join(","),
  ].join("\n");
  const formData = new FormData();
  formData.append(
    "file",
    new File([contents], "orders.csv", { type: "text/csv" }),
  );
  formData.append("commit", "true");
  formData.append(
    "mapping",
    JSON.stringify({
      Order: "orderNumber",
      Customer: "customerName",
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
    body: formData,
  });
}

function normalizedOrder(
  overrides: Partial<NormalizedOrder> = {},
): NormalizedOrder {
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
    sourceMetadata: {
      shopifyOrderId: 1001,
      sourceOrderId,
      rawUpdatedAt: "2026-01-02T10:00:00Z",
    },
    createdAt: "2026-01-02T10:00:00Z",
    ...overrides,
  };
}

describe("order creation path regression coverage", () => {
  it("orderService.create writes the created timeline and trigger", async () => {
    await configureOrderCreatedAutomation();
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

    expect(
      await rawDb.orderChange.count({
        where: { orderId: order.id, actionType: "created" },
      }),
    ).toBe(1);
    expect((await waitForCreatedLog()).length).toBeGreaterThan(0);
  });

  it("storefront writes a canonical created order and trigger", async () => {
    await configureOrderCreatedAutomation();
    const product = await seedProduct({ price: 2500 });
    const storefront = await seedStorefront({ productIds: [product.id] });
    const response = await storefrontPost(
      mockPost("http://localhost/api/storefront/submit", {
        slug: storefront.slug,
        submissionId: "41414141-4141-4141-8141-414141414141",
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

    expect(response.status).toBe(201);
    const body = await getJson(response);
    const order = await rawDb.order.findUnique({
      where: { id: body.orderId as string },
    });
    expect(order).toMatchObject({ source: "storefront", status: "pending" });
    expect(
      isCanonicalOrderAuthority(order?.source, order?.sourceMetadata),
    ).toBe(true);
    expect(
      await rawDb.orderChange.count({
        where: { orderId: order?.id, actionType: "created" },
      }),
    ).toBe(1);
    expect((await waitForCreatedLog()).length).toBeGreaterThan(0);
  });

  it("CSV import writes one canonical grouped order using server pricing", async () => {
    await seedProduct({ name: "Imported Product", price: 1500 });
    const response = await importPost(importRequest("Imported Product", 1));

    expect(response.status).toBe(200);
    expect(await getJson(response)).toMatchObject({
      inserted: 1,
      replayed: 0,
      errors: [],
    });
    const order = await rawDb.order.findFirst({ include: { items: true } });
    expect(order).toMatchObject({ source: "csv", status: "pending" });
    expect(order?.items[0]).toMatchObject({ unitPrice: 1500, quantity: 3 });
    expect(
      await rawDb.orderChange.count({
        where: { orderId: order?.id, actionType: "created" },
      }),
    ).toBe(1);
  });

  it("commerce sync creates its legacy order and timeline entry", async () => {
    listOrdersMock.mockResolvedValue({
      orders: [normalizedOrder()],
      nextWatermark: "1002",
      hasMore: false,
    } satisfies SyncFetchResult);

    const result = await syncPlatform(
      { prisma: rawDb as never, shop: TEST_SHOP_CONTEXT },
      "shopify",
    );
    expect(result).toMatchObject({ created: 1, errors: [] });
    const order = await rawDb.order.findFirst();
    expect(order?.orderNumber).toMatch(/^SYNC-SHOPIFY-\d{4}$/);
    expect(
      await rawDb.orderChange.count({
        where: { orderId: order?.id, actionType: "created" },
      }),
    ).toBe(1);
  });

  it("commerce cancellation uses the status service and restores scalar stock", async () => {
    listOrdersMock.mockResolvedValueOnce({
      orders: [normalizedOrder({ sourceOrderId: "shop-cancel-001" })],
      nextWatermark: "1002",
      hasMore: false,
    } satisfies SyncFetchResult);
    await syncPlatform(
      { prisma: rawDb as never, shop: TEST_SHOP_CONTEXT },
      "shopify",
    );
    const order = await rawDb.order.findFirst({
      where: { sourceOrderId: "shop-cancel-001" },
    });
    expect(order).toBeTruthy();

    const category = await rawDb.category.create({
      data: { name: "Sync cancellation category" },
    });
    const product = await rawDb.product.create({
      data: {
        name: "Sync Product",
        price: 2000,
        stock: 5,
        categoryId: category.id,
        isActive: true,
      },
    });
    await rawDb.orderItem.create({
      data: {
        orderId: order?.id ?? "missing",
        productId: product.id,
        productName: product.name,
        quantity: 2,
        unitPrice: 2000,
        total: 4000,
      },
    });
    if (!order) throw new Error("Synced order was not created");
    await orderService.updateStatus(
      { prisma: rawDb as never },
      order.id,
      "pending",
    );
    await orderService.updateStatus(
      { prisma: rawDb as never },
      order.id,
      "confirmed",
    );
    expect(
      (await rawDb.product.findUnique({ where: { id: product.id } }))?.stock,
    ).toBe(3);

    listOrdersMock.mockResolvedValueOnce({
      orders: [
        normalizedOrder({
          sourceOrderId: "shop-cancel-001",
          sourceMetadata: {
            shopifyOrderId: 1001,
            sourceOrderId: "shop-cancel-001",
            rawUpdatedAt: "2026-01-03T10:00:00Z",
            cancelReason: "customer",
          },
        }),
      ],
      nextWatermark: "1003",
      hasMore: false,
    } satisfies SyncFetchResult);
    const result = await syncPlatform(
      { prisma: rawDb as never, shop: TEST_SHOP_CONTEXT },
      "shopify",
    );

    expect(result).toMatchObject({ updated: 1, errors: [] });
    expect((await rawDb.order.findUnique({ where: { id: order.id } }))?.status).toBe(
      "cancelled",
    );
    expect(
      (await rawDb.product.findUnique({ where: { id: product.id } }))?.stock,
    ).toBe(5);
    expect(
      await rawDb.orderChange.count({
        where: { orderId: order.id, actionType: "status_change" },
      }),
    ).toBeGreaterThan(0);
  });

  it("AI create_order writes an AI order and created timeline entry", async () => {
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
    const tool = getTool("create_order");
    if (!tool) throw new Error("AI create_order tool is not registered");
    const context: ToolContext = { db: rawDb, shop: TEST_SHOP_CONTEXT };
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
      context,
    );

    expect(result.success).toBe(true);
    const data = result.data as { id: string };
    expect((await rawDb.order.findUnique({ where: { id: data.id } }))?.source).toBe(
      "ai_chat",
    );
    expect(
      await rawDb.orderChange.count({
        where: { orderId: data.id, actionType: "created" },
      }),
    ).toBe(1);
  });
});
