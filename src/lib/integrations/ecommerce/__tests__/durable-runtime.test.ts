process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";
import type {
  EcommerceCredentials,
  EcommercePlatform,
  NormalizedOrder,
  SyncPageResult,
} from "../types";

const { fetchPageMock, credentialsProvider } = vi.hoisted(() => ({
  fetchPageMock: vi.fn(),
  credentialsProvider: vi.fn(),
}));

vi.mock("../index", () => ({
  getEcommerceAdapter: vi.fn((platform: EcommercePlatform) => ({
    platform,
    displayName: platform,
    fetchOrderPage: fetchPageMock,
  })),
  loadEcommerceCredentials: vi.fn(
    (_context: unknown, platform: EcommercePlatform) =>
      credentialsProvider(platform),
  ),
}));

import {
  finalizeCommerceRuns,
  processNextCommerceFetch,
  processNextCommerceItem,
} from "../processor";
import { queueCommerceSync } from "../queue";

const context = { prisma: rawDb as never, shop: TEST_SHOP_CONTEXT };
const credentials = {
  shop: "demo",
  accessToken: "token",
} as EcommerceCredentials;

function normalizedOrder(
  overrides: Partial<NormalizedOrder> = {},
): NormalizedOrder {
  return {
    sourceOrderId: overrides.sourceOrderId ?? "shopify-001",
    orderNumber: overrides.orderNumber ?? "#1001",
    customerName: overrides.customerName ?? "Ahmed Benali",
    customerPhone: overrides.customerPhone ?? "0555123456",
    wilaya: overrides.wilaya === undefined ? "Alger" : overrides.wilaya,
    commune:
      overrides.commune === undefined ? "Bab Ezzouar" : overrides.commune,
    address: overrides.address ?? "123 Rue Didouche",
    items: overrides.items ?? [
      {
        productName: "Widget A",
        catalogSku: "WIDGET-A",
        quantity: 1,
        unitPrice: 1,
      },
    ],
    totalPrice: overrides.totalPrice ?? 2_500,
    deliveryCost: overrides.deliveryCost ?? 500,
    source: overrides.source ?? "shopify",
    sourceRevision: overrides.sourceRevision ?? "rev-1",
    sourceMetadata:
      overrides.sourceMetadata ??
      ({
        sourceOrderId: overrides.sourceOrderId ?? "shopify-001",
        rawUpdatedAt: overrides.sourceRevision ?? "rev-1",
        financialStatus: "pending",
        fulfillmentStatus: null,
        cancelReason: null,
      } satisfies Record<string, unknown>),
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00Z",
  };
}

async function seedProduct(): Promise<void> {
  const category = await rawDb.category.create({
    data: { name: `Commerce ${crypto.randomUUID()}` },
  });
  await rawDb.product.create({
    data: {
      name: "Widget A",
      sku: "WIDGET-A",
      price: 2_000,
      stock: 10,
      lowStockThreshold: 2,
      isActive: true,
      categoryId: category.id,
    },
  });
}

function page(
  orders: NormalizedOrder[],
  input: { nextCursor?: string | null; watermark?: string } = {},
): SyncPageResult {
  return {
    orders,
    nextCursor: input.nextCursor ?? null,
    candidateWatermark: input.watermark ?? "wm-1",
  };
}

beforeEach(async () => {
  await cleanDb();
  fetchPageMock.mockReset();
  credentialsProvider.mockReset().mockResolvedValue(credentials);
});

afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe("durable commerce runtime", () => {
  it("persists encrypted pages, resumes the provider cursor, and commits the watermark last", async () => {
    await seedProduct();
    fetchPageMock
      .mockResolvedValueOnce(
        page([normalizedOrder()], { nextCursor: "page-2", watermark: "wm-1" }),
      )
      .mockResolvedValueOnce(page([], { nextCursor: null, watermark: "wm-2" }));

    const queued = await queueCommerceSync(context, "shopify", 2);
    const replay = await queueCommerceSync(context, "shopify", 2);
    expect(replay).toMatchObject({ id: queued.id, replayed: true });

    expect(await processNextCommerceFetch(context)).toBe(true);
    const afterFirstPage = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(afterFirstPage).toMatchObject({
      fetchComplete: false,
      continuationCursor: "page-2",
      pagesFetched: 1,
      status: "queued",
    });
    const encryptedItem = await rawDb.commerceSyncItem.findFirstOrThrow();
    expect(encryptedItem.payloadJson).not.toContain("Ahmed Benali");
    expect(encryptedItem.payloadJson).not.toContain("0555123456");
    const integrationBefore = await rawDb.integration.findUniqueOrThrow({
      where: { platform: "shopify" },
    });
    expect(JSON.parse(integrationBefore.config ?? "{}")).toMatchObject({
      watermark: "",
    });

    expect(await processNextCommerceFetch(context)).toBe(true);
    expect(fetchPageMock.mock.calls[1]?.[1]).toMatchObject({
      cursor: "page-2",
      watermark: "",
    });
    expect(await processNextCommerceItem(context)).toBe(true);
    expect(await finalizeCommerceRuns(context)).toBe(1);

    const completed = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(completed).toMatchObject({
      status: "succeeded",
      activeKey: null,
      createdCount: 1,
      failedCount: 0,
      candidateWatermark: "wm-2",
    });
    const integrationAfter = await rawDb.integration.findUniqueOrThrow({
      where: { platform: "shopify" },
    });
    expect(JSON.parse(integrationAfter.config ?? "{}")).toMatchObject({
      watermark: "wm-2",
    });
    expect(await rawDb.order.count()).toBe(1);
  });

  it("stops at the requested page budget without advancing the watermark", async () => {
    fetchPageMock.mockResolvedValueOnce(
      page([], { nextCursor: "page-2", watermark: "wm-partial" }),
    );
    const queued = await queueCommerceSync(context, "shopify", 1);

    expect(await processNextCommerceFetch(context)).toBe(true);
    expect(await processNextCommerceFetch(context)).toBe(false);
    expect(await finalizeCommerceRuns(context)).toBe(1);

    const run = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(run).toMatchObject({
      status: "partially_completed",
      activeKey: null,
      fetchComplete: true,
      hasMore: true,
      pagesFetched: 1,
      continuationCursor: "page-2",
      lastErrorCode: "COMMERCE_PAGE_BUDGET_EXHAUSTED",
    });
    expect(fetchPageMock).toHaveBeenCalledTimes(1);
    const integration = await rawDb.integration.findUniqueOrThrow({
      where: { platform: "shopify" },
    });
    expect(JSON.parse(integration.config ?? "{}")).toMatchObject({
      watermark: "",
    });
  });

  it("quarantines a catalog conflict and never advances the watermark", async () => {
    fetchPageMock.mockResolvedValueOnce(
      page([normalizedOrder()], { watermark: "wm-conflict" }),
    );
    const queued = await queueCommerceSync(context, "shopify", 1);

    await processNextCommerceFetch(context);
    await processNextCommerceItem(context);
    expect(await finalizeCommerceRuns(context)).toBe(0);

    const item = await rawDb.commerceSyncItem.findFirstOrThrow();
    expect(item).toMatchObject({
      status: "quarantined",
      lastErrorCode: "VALIDATION_ERROR",
      attemptCount: 1,
    });
    const run = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(run).toMatchObject({
      status: "dead_letter",
      failedCount: 1,
      activeKey: "commerce-sync-active:shopify",
    });
    const integration = await rawDb.integration.findUniqueOrThrow({
      where: { platform: "shopify" },
    });
    expect(JSON.parse(integration.config ?? "{}")).toMatchObject({
      watermark: "",
    });
    expect(await rawDb.order.count()).toBe(0);
  });

  it("closes an expired item attempt and safely replays canonical mutation", async () => {
    await seedProduct();
    fetchPageMock.mockResolvedValueOnce(page([normalizedOrder()]));
    const queued = await queueCommerceSync(context, "shopify", 1);
    await processNextCommerceFetch(context);

    const item = await rawDb.commerceSyncItem.findFirstOrThrow();
    const stale = new Date(Date.now() - 120_000);
    await rawDb.commerceSyncItem.update({
      where: { id: item.id },
      data: {
        status: "processing",
        attemptCount: 1,
        leaseToken: "abandoned",
        lockedAt: stale,
      },
    });
    await rawDb.commerceSyncItemAttempt.create({
      data: {
        id: crypto.randomUUID(),
        itemId: item.id,
        attemptNumber: 1,
        leaseToken: "abandoned",
        state: "processing",
        startedAt: stale,
      },
    });

    expect(await processNextCommerceItem(context)).toBe(true);
    expect(await finalizeCommerceRuns(context)).toBe(1);
    const attempts = await rawDb.commerceSyncItemAttempt.findMany({
      where: { itemId: item.id },
      orderBy: { attemptNumber: "asc" },
    });
    expect(attempts.map((attempt) => attempt.state)).toEqual([
      "lease_expired",
      "succeeded",
    ]);
    expect(await rawDb.order.count()).toBe(1);
    expect(
      (
        await rawDb.commerceSyncRun.findUniqueOrThrow({
          where: { id: queued.id },
        })
      ).status,
    ).toBe("succeeded");
  });

  it("retains the maximum candidate watermark across descending provider pages", async () => {
    fetchPageMock
      .mockResolvedValueOnce(
        page([], {
          nextCursor: "older-page",
          watermark: "2026-01-03T00:00:00Z",
        }),
      )
      .mockResolvedValueOnce(
        page([], {
          nextCursor: null,
          watermark: "2026-01-02T00:00:00Z",
        }),
      );

    const queued = await queueCommerceSync(context, "shopify", 2);
    await processNextCommerceFetch(context);
    await processNextCommerceFetch(context);
    expect(await finalizeCommerceRuns(context)).toBe(1);

    const run = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(run.candidateWatermark).toBe("2026-01-03T00:00:00Z");
    const integration = await rawDb.integration.findUniqueOrThrow({
      where: { platform: "shopify" },
    });
    expect(JSON.parse(integration.config ?? "{}")).toMatchObject({
      watermark: "2026-01-03T00:00:00Z",
    });
  });

  it("fails closed on credential or endpoint drift without changing canonical source identity", async () => {
    const queued = await queueCommerceSync(context, "shopify", 1);
    const original = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: queued.id },
    });
    credentialsProvider.mockResolvedValue({
      shop: "different-shop",
      accessToken: "rotated-token",
    });

    expect(await processNextCommerceFetch(context)).toBe(true);
    expect(fetchPageMock).not.toHaveBeenCalled();
    const failed = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(failed).toMatchObject({
      status: "dead_letter",
      activeKey: null,
      lastErrorCode: "COMMERCE_CREDENTIAL_CONTRACT_DRIFT",
    });

    const replacement = await queueCommerceSync(context, "shopify", 1);
    const replacementRun = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: replacement.id },
    });
    expect(replacement.id).not.toBe(queued.id);
    expect(replacementRun.sourceIdentity).toBe(original.sourceIdentity);
    expect(replacementRun.credentialFingerprint).not.toBe(
      original.credentialFingerprint,
    );
  });

  it("releases a watermark-conflicted run so a reconciled sync can be queued", async () => {
    fetchPageMock.mockResolvedValueOnce(
      page([], { nextCursor: null, watermark: "wm-run" }),
    );
    const queued = await queueCommerceSync(context, "shopify", 1);
    await processNextCommerceFetch(context);
    const integration = await rawDb.integration.findUniqueOrThrow({
      where: { platform: "shopify" },
    });
    await rawDb.integration.update({
      where: { id: integration.id },
      data: {
        config: JSON.stringify({ watermark: "wm-external", lastSyncAt: "" }),
      },
    });

    expect(await finalizeCommerceRuns(context)).toBe(0);
    const conflicted = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(conflicted).toMatchObject({
      status: "dead_letter",
      activeKey: null,
      lastErrorCode: "COMMERCE_WATERMARK_CONFLICT",
    });

    const replacement = await queueCommerceSync(context, "shopify", 1);
    expect(replacement.id).not.toBe(queued.id);
    expect(replacement.initialWatermark).toBe("wm-external");
  });
});
