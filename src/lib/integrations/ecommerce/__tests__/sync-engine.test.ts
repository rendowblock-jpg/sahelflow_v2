process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";
import { executeCanonicalFulfillment } from "@/lib/orders/canonical-fulfillment";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";
import { readCanonicalSourceOrderAuthority } from "@/lib/orders/manual-order-authority";
import type {
  EcommerceCredentials,
  EcommercePlatform,
  NormalizedOrder,
  SyncFetchResult,
} from "../types";

const { listOrdersMock, credentialsProvider } = vi.hoisted(() => ({
  listOrdersMock: vi.fn(),
  credentialsProvider: vi.fn(),
}));

vi.mock("../index", () => ({
  getEcommerceAdapter: vi.fn((platform: EcommercePlatform) => ({
    platform,
    displayName: platform,
    listOrdersSince: listOrdersMock,
  })),
  loadEcommerceCredentials: vi.fn(
    (_context: unknown, platform: EcommercePlatform) =>
      credentialsProvider(platform),
  ),
}));

import { syncAllPlatforms, syncPlatform } from "../sync-engine";

const credentials = {
  shop: "test",
  accessToken: "token",
} as EcommerceCredentials;
const context = { prisma: rawDb as never, shop: TEST_SHOP_CONTEXT };

function order(
  overrides: Partial<NormalizedOrder> = {},
): NormalizedOrder {
  const source = overrides.source ?? "shopify";
  const sourceOrderId = overrides.sourceOrderId ?? `${source}-001`;
  return {
    sourceOrderId,
    orderNumber: overrides.orderNumber ?? "#1001",
    customerName: overrides.customerName ?? "Ahmed Benali",
    customerPhone: overrides.customerPhone ?? "0555123456",
    wilaya: overrides.wilaya === undefined ? "Alger" : overrides.wilaya,
    commune:
      overrides.commune === undefined ? "Bab Ezzouar" : overrides.commune,
    address: overrides.address ?? "123 Rue Didouche",
    items:
      overrides.items ??
      [
        {
          productName: "Widget A",
          catalogSku: "WIDGET-A",
          quantity: 2,
          unitPrice: 1,
        },
      ],
    totalPrice: overrides.totalPrice ?? 99_999,
    deliveryCost: overrides.deliveryCost ?? 500,
    source,
    sourceRevision: overrides.sourceRevision ?? "rev-1",
    sourceMetadata:
      overrides.sourceMetadata ??
      ({
        sourceOrderId,
        rawUpdatedAt: overrides.sourceRevision ?? "rev-1",
        financialStatus: "pending",
        fulfillmentStatus: null,
        cancelReason: null,
      } satisfies Record<string, unknown>),
    createdAt: overrides.createdAt ?? "2026-01-02T10:00:00Z",
  };
}

async function seedProduct(input?: {
  name?: string;
  sku?: string;
  price?: number;
  stock?: number;
}) {
  const name = input?.name ?? "Widget A";
  const category = await rawDb.category.create({
    data: { name: `Commerce ${name} ${crypto.randomUUID()}` },
  });
  return rawDb.product.create({
    data: {
      name,
      sku: input?.sku ?? "WIDGET-A",
      price: input?.price ?? 2000,
      stock: input?.stock ?? 10,
      isActive: true,
      categoryId: category.id,
    },
  });
}

function fetched(
  orders: NormalizedOrder[],
  nextWatermark = "wm-2",
): SyncFetchResult {
  return { orders, nextWatermark, hasMore: false };
}

async function integrationConfig(platform: EcommercePlatform) {
  const integration = await rawDb.integration.findUnique({ where: { platform } });
  return integration?.config
    ? (JSON.parse(integration.config) as { watermark?: string })
    : null;
}

beforeEach(async () => {
  await cleanDb();
  listOrdersMock.mockReset();
  credentialsProvider.mockReset().mockResolvedValue(credentials);
});

afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe("canonical commerce sync", () => {
  it("creates a server-priced pending canonical order and advances the watermark", async () => {
    const product = await seedProduct({ price: 2000 });
    listOrdersMock.mockResolvedValueOnce(fetched([order()], "wm-1"));

    const result = await syncPlatform(context, "shopify");

    expect(result).toMatchObject({
      fetched: 1,
      created: 1,
      updated: 0,
      skipped: 0,
      errors: [],
      watermark: "wm-1",
    });
    const stored = await rawDb.order.findFirst({ include: { items: true } });
    expect(stored).toMatchObject({
      source: "shopify",
      sourceOrderId: "shopify-001",
      status: "pending",
      totalPrice: 4500,
      deliveryCost: 500,
      version: 1,
    });
    expect(stored?.items[0]).toMatchObject({
      productId: product.id,
      unitPrice: 2000,
      quantity: 2,
      total: 4000,
    });
    expect(
      readCanonicalSourceOrderAuthority(stored?.source, stored?.sourceMetadata),
    ).toMatchObject({ sourceRevision: "rev-1" });
    expect(await integrationConfig("shopify")).toMatchObject({ watermark: "wm-1" });
  });

  it("skips an unchanged re-fetch without duplicating the order", async () => {
    await seedProduct();
    listOrdersMock.mockResolvedValueOnce(fetched([order()], "wm-1"));
    await syncPlatform(context, "shopify");
    listOrdersMock.mockResolvedValueOnce(fetched([order()], "wm-2"));

    const replay = await syncPlatform(context, "shopify");

    expect(replay).toMatchObject({ created: 0, updated: 0, skipped: 1, errors: [] });
    expect(await rawDb.order.count()).toBe(1);
    expect(await integrationConfig("shopify")).toMatchObject({ watermark: "wm-2" });
  });

  it("commits a provider checkpoint without overwriting an internal confirmed status", async () => {
    await seedProduct();
    listOrdersMock.mockResolvedValueOnce(fetched([order()], "wm-1"));
    await syncPlatform(context, "shopify");
    const created = await rawDb.order.findFirstOrThrow();
    await executeManualOrderDecision(context, {
      orderId: created.id,
      decision: "confirm",
      expectedVersion: 1,
      idempotencyKey: "commerce-confirm-before-checkpoint",
    });

    const changed = order({
      sourceRevision: "rev-2",
      sourceMetadata: {
        sourceOrderId: "shopify-001",
        rawUpdatedAt: "rev-2",
        financialStatus: "paid",
        fulfillmentStatus: "fulfilled",
        cancelReason: null,
      },
    });
    listOrdersMock.mockResolvedValueOnce(fetched([changed], "wm-2"));
    const result = await syncPlatform(context, "shopify");

    expect(result).toMatchObject({ updated: 1, errors: [], watermark: "wm-2" });
    const stored = await rawDb.order.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.status).toBe("confirmed");
    expect(stored.version).toBe(3);
    expect(
      readCanonicalSourceOrderAuthority(stored.source, stored.sourceMetadata),
    ).toMatchObject({ sourceRevision: "rev-2" });
  });

  it("rejects a pending order when the provider cancels it", async () => {
    await seedProduct();
    listOrdersMock.mockResolvedValueOnce(fetched([order()], "wm-1"));
    await syncPlatform(context, "shopify");

    const cancelled = order({
      sourceRevision: "rev-2",
      sourceMetadata: {
        sourceOrderId: "shopify-001",
        rawUpdatedAt: "rev-2",
        financialStatus: "voided",
        fulfillmentStatus: null,
        cancelReason: "customer",
      },
    });
    listOrdersMock.mockResolvedValueOnce(fetched([cancelled], "wm-2"));
    const result = await syncPlatform(context, "shopify");

    expect(result).toMatchObject({ updated: 1, errors: [], watermark: "wm-2" });
    const stored = await rawDb.order.findFirstOrThrow();
    expect(stored.status).toBe("cancelled");
    expect(stored.version).toBe(3);
    expect(
      readCanonicalSourceOrderAuthority(stored.source, stored.sourceMetadata),
    ).toMatchObject({ sourceRevision: "rev-2" });
  });

  it("restores reserved stock when a confirmed provider order is cancelled", async () => {
    const product = await seedProduct({ stock: 10 });
    listOrdersMock.mockResolvedValueOnce(fetched([order()], "wm-1"));
    await syncPlatform(context, "shopify");
    const created = await rawDb.order.findFirstOrThrow();
    await executeManualOrderDecision(context, {
      orderId: created.id,
      decision: "confirm",
      expectedVersion: 1,
      idempotencyKey: "commerce-confirm-before-cancel",
    });
    expect(
      (await rawDb.product.findUniqueOrThrow({ where: { id: product.id } })).stock,
    ).toBe(8);

    const cancelled = order({
      sourceRevision: "rev-2",
      sourceMetadata: {
        sourceOrderId: "shopify-001",
        rawUpdatedAt: "rev-2",
        financialStatus: "voided",
        fulfillmentStatus: null,
        cancelReason: "customer",
      },
    });
    listOrdersMock.mockResolvedValueOnce(fetched([cancelled], "wm-2"));
    const result = await syncPlatform(context, "shopify");

    expect(result.errors).toEqual([]);
    expect((await rawDb.order.findUniqueOrThrow({ where: { id: created.id } })).status).toBe(
      "cancelled",
    );
    expect(
      (await rawDb.product.findUniqueOrThrow({ where: { id: product.id } })).stock,
    ).toBe(10);
  });

  it("fails closed and retains the watermark when cancellation is unsafe after shipment", async () => {
    await seedProduct({ stock: 10 });
    listOrdersMock.mockResolvedValueOnce(fetched([order()], "wm-1"));
    await syncPlatform(context, "shopify");
    const created = await rawDb.order.findFirstOrThrow();
    await executeManualOrderDecision(context, {
      orderId: created.id,
      decision: "confirm",
      expectedVersion: 1,
      idempotencyKey: "commerce-confirm-before-ship",
    });
    await executeCanonicalFulfillment(context, {
      orderId: created.id,
      action: "pack",
      expectedVersion: 2,
      idempotencyKey: "commerce-pack-before-cancel",
    });
    await executeCanonicalFulfillment(context, {
      orderId: created.id,
      action: "ship",
      expectedVersion: 3,
      idempotencyKey: "commerce-ship-before-cancel",
    });

    const cancelled = order({
      sourceRevision: "rev-2",
      sourceMetadata: {
        sourceOrderId: "shopify-001",
        rawUpdatedAt: "rev-2",
        financialStatus: "voided",
        fulfillmentStatus: null,
        cancelReason: "customer",
      },
    });
    listOrdersMock.mockResolvedValueOnce(fetched([cancelled], "wm-2"));
    const result = await syncPlatform(context, "shopify");

    expect(result.errors).toEqual([
      expect.stringMatching(/cannot safely transition/i),
    ]);
    expect(result.watermark).toBe("wm-1");
    expect(await integrationConfig("shopify")).toMatchObject({ watermark: "wm-1" });
    const stored = await rawDb.order.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.status).toBe("shipped");
    expect(
      readCanonicalSourceOrderAuthority(stored.source, stored.sourceMetadata),
    ).toMatchObject({ sourceRevision: "rev-1" });
  });

  it("retries the whole provider page after one order fails", async () => {
    await seedProduct({ name: "Widget A", sku: "WIDGET-A" });
    const valid = order({ sourceOrderId: "shopify-valid" });
    const missing = order({
      sourceOrderId: "shopify-missing",
      orderNumber: "#1002",
      items: [
        {
          productName: "Widget B",
          catalogSku: "WIDGET-B",
          quantity: 1,
          unitPrice: 1,
        },
      ],
    });
    listOrdersMock.mockResolvedValueOnce(fetched([valid, missing], "wm-2"));
    const first = await syncPlatform(context, "shopify");

    expect(first.created).toBe(1);
    expect(first.errors).toHaveLength(1);
    expect(first.watermark).toBe("");
    expect(await rawDb.order.count()).toBe(1);

    await seedProduct({ name: "Widget B", sku: "WIDGET-B", price: 3000 });
    listOrdersMock.mockResolvedValueOnce(fetched([valid, missing], "wm-2"));
    const retry = await syncPlatform(context, "shopify");

    expect(retry).toMatchObject({
      created: 1,
      skipped: 1,
      errors: [],
      watermark: "wm-2",
    });
    expect(await rawDb.order.count()).toBe(2);
  });

  it("resolves an exact variant SKU and uses its server price", async () => {
    const product = await seedProduct({ name: "T-Shirt", sku: "TSHIRT", price: 2000 });
    const variant = await rawDb.productVariant.create({
      data: {
        productId: product.id,
        name: "Large",
        sku: "TS-L",
        price: 2600,
        stock: 5,
        isActive: true,
      },
    });
    listOrdersMock.mockResolvedValueOnce(
      fetched([
        order({
          items: [
            {
              productName: "T-Shirt",
              catalogSku: "TS-L",
              variantName: "Large",
              quantity: 1,
              unitPrice: 1,
            },
          ],
          deliveryCost: 0,
        }),
      ]),
    );

    const result = await syncPlatform(context, "shopify");
    expect(result.errors).toEqual([]);
    const item = await rawDb.orderItem.findFirstOrThrow();
    expect(item).toMatchObject({
      productId: product.id,
      productVariantId: variant.id,
      unitPrice: 2600,
    });
  });

  it("does not create or advance when catalog authority is missing", async () => {
    listOrdersMock.mockResolvedValueOnce(fetched([order()], "wm-1"));
    const result = await syncPlatform(context, "shopify");

    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.watermark).toBe("");
    expect(await rawDb.order.count()).toBe(0);
    expect(await integrationConfig("shopify")).toMatchObject({ watermark: "" });
  });

  it("returns credential and fetch failures without advancing", async () => {
    credentialsProvider.mockResolvedValueOnce(null);
    expect(await syncPlatform(context, "shopify")).toMatchObject({
      fetched: 0,
      created: 0,
      watermark: "",
      errors: [expect.stringMatching(/No credentials/i)],
    });

    credentialsProvider.mockResolvedValue(credentials);
    listOrdersMock.mockRejectedValueOnce(new Error("Shopify API 503"));
    expect(await syncPlatform(context, "shopify")).toMatchObject({
      fetched: 0,
      watermark: "",
      errors: [expect.stringMatching(/Shopify API 503/i)],
    });
  });

  it("syncs every configured platform through separate canonical identities", async () => {
    await seedProduct();
    credentialsProvider.mockResolvedValue(credentials);
    listOrdersMock
      .mockResolvedValueOnce(fetched([order({ source: "shopify" })], "s-1"))
      .mockResolvedValueOnce(
        fetched(
          [
            order({
              source: "woocommerce",
              sourceOrderId: "woocommerce-001",
              sourceRevision: "woo-rev-1",
              sourceMetadata: { wooStatus: "processing" },
            }),
          ],
          "w-1",
        ),
      )
      .mockResolvedValueOnce(
        fetched(
          [
            order({
              source: "youcan",
              sourceOrderId: "youcan-001",
              sourceRevision: "yc-rev-1",
              sourceMetadata: { statusNew: "new", shippingPrice: 500 },
            }),
          ],
          "y-1",
        ),
      );

    const results = await syncAllPlatforms(context);
    expect(results).toHaveLength(3);
    expect(results.every((entry) => entry.created === 1 && entry.errors.length === 0)).toBe(
      true,
    );
    expect(
      (await rawDb.order.findMany()).map((entry) => entry.source).sort(),
    ).toEqual(["shopify", "woocommerce", "youcan"]);
  });
});
