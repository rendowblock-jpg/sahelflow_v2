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
} from "../types";

const { fetchPageMock, credentialsProvider, upsertMock } = vi.hoisted(() => ({
  fetchPageMock: vi.fn(),
  credentialsProvider: vi.fn(),
  upsertMock: vi.fn(),
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

vi.mock("../sync-engine", () => ({
  upsertCanonicalCommerceOrder: upsertMock,
}));

import {
  processNextCommerceFetch,
  processNextCommerceItem,
} from "../processor";
import {
  listCommerceSyncHistory,
  retryCommerceSync,
} from "../recovery";
import { queueCommerceSync } from "../queue";

const context = { prisma: rawDb as never, shop: TEST_SHOP_CONTEXT };
const credentials = {
  shop: "demo",
  accessToken: "token",
} as EcommerceCredentials;

function order(): NormalizedOrder {
  return {
    sourceOrderId: "provider-recovery-1",
    orderNumber: "#REC-1",
    customerName: "Sensitive Customer",
    customerPhone: "0555999999",
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    address: "Secret Address",
    items: [
      {
        productName: "Widget A",
        catalogSku: "WIDGET-A",
        quantity: 1,
        unitPrice: 2_000,
      },
    ],
    totalPrice: 2_500,
    deliveryCost: 500,
    source: "shopify",
    sourceRevision: "recovery-rev-1",
    sourceMetadata: {
      sourceOrderId: "provider-recovery-1",
      rawUpdatedAt: "recovery-rev-1",
    },
    createdAt: "2026-01-01T00:00:00Z",
  };
}

beforeEach(async () => {
  await cleanDb();
  fetchPageMock.mockReset();
  credentialsProvider.mockReset().mockResolvedValue(credentials);
  upsertMock.mockReset().mockResolvedValue("created");
});

afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe("commerce operator retry generations", () => {
  it("gives a dead-lettered fetch a fresh automatic retry budget", async () => {
    const queued = await queueCommerceSync(context, "shopify", 1);
    await rawDb.commerceSyncRun.update({
      where: { id: queued.id },
      data: {
        status: "dead_letter",
        attemptCount: 5,
        lastErrorCode: "ExternalServiceError",
        completedAt: new Date(),
        deadLetteredAt: new Date(),
        nextAttemptAt: null,
      },
    });
    for (let attemptNumber = 1; attemptNumber <= 5; attemptNumber += 1) {
      await rawDb.commerceSyncRunAttempt.create({
        data: {
          id: crypto.randomUUID(),
          runId: queued.id,
          attemptNumber,
          phase: "fetch",
          state: "failed",
          detailJson: JSON.stringify({ cursor: null, generation: 0 }),
          completedAt: new Date(),
        },
      });
    }

    const recovery = await retryCommerceSync(context, {
      runId: queued.id,
      reason: "Credentials were corrected",
      auditActor: "owner:test",
    });
    expect(recovery).toMatchObject({ mode: "fetch", status: "queued" });

    fetchPageMock.mockRejectedValueOnce(new Error("temporary provider outage"));
    expect(await processNextCommerceFetch(context)).toBe(true);
    const run = await rawDb.commerceSyncRun.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(run).toMatchObject({
      status: "retrying",
      operatorRetryCount: 1,
      attemptCount: 6,
    });
  });

  it("reopens failed items with a new budget and keeps history PII-free", async () => {
    const queued = await queueCommerceSync(context, "shopify", 1);
    fetchPageMock.mockResolvedValueOnce({
      orders: [order()],
      nextCursor: null,
      candidateWatermark: "wm-recovery",
    });
    await processNextCommerceFetch(context);
    const item = await rawDb.commerceSyncItem.findFirstOrThrow();
    await rawDb.commerceSyncItem.update({
      where: { id: item.id },
      data: {
        status: "dead_letter",
        attemptCount: 5,
        lastErrorCode: "ExternalServiceError",
        completedAt: new Date(),
        deadLetteredAt: new Date(),
        nextAttemptAt: null,
      },
    });
    await rawDb.commerceSyncRun.update({
      where: { id: queued.id },
      data: {
        status: "dead_letter",
        lastErrorCode: "COMMERCE_ITEMS_REQUIRE_OPERATOR",
        completedAt: new Date(),
        deadLetteredAt: new Date(),
      },
    });
    for (let attemptNumber = 1; attemptNumber <= 5; attemptNumber += 1) {
      await rawDb.commerceSyncItemAttempt.create({
        data: {
          id: crypto.randomUUID(),
          itemId: item.id,
          attemptNumber,
          state: "dead_letter",
          detailJson: JSON.stringify({ generation: 0 }),
          completedAt: new Date(),
        },
      });
    }

    const recovery = await retryCommerceSync(context, {
      runId: queued.id,
      reason: "Catalog and provider mapping were reviewed",
      auditActor: "owner:test",
    });
    expect(recovery).toMatchObject({
      mode: "items",
      status: "processing",
      retriedItemCount: 1,
    });

    upsertMock.mockRejectedValueOnce(new Error("temporary database contention"));
    expect(await processNextCommerceItem(context)).toBe(true);
    const retried = await rawDb.commerceSyncItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(retried).toMatchObject({
      status: "retrying",
      operatorRetryCount: 1,
      attemptCount: 6,
    });

    const history = await listCommerceSyncHistory(context, 10);
    const serialized = JSON.stringify(history);
    expect(serialized).not.toContain("Sensitive Customer");
    expect(serialized).not.toContain("0555999999");
    expect(serialized).not.toContain("Secret Address");

    const audit = await rawDb.auditLog.findFirstOrThrow({
      where: { action: "commerce.sync.retry_requested", entityId: queued.id },
    });
    expect(audit.metadata).not.toContain("Catalog and provider mapping were reviewed");
    expect(JSON.parse(audit.metadata ?? "{}")).toMatchObject({ reasonLength: 42 });
  });
});
