/**
 * C1 poison-receipt ingestion contract tests.
 *
 * One malformed hosted receipt used to throw past the governed rejection
 * handler, aborting the whole poll page; the worker's silent catch hid the
 * failure and the cursor never advanced — a permanent silent stall of
 * storefront ingestion. These tests pin the partitioned contract:
 *
 * - receipt-scoped corruption is classified, rejected on the relay, and the
 *   page continues (the cursor always advances);
 * - the checkout delegation is released for poison receipts whose item list
 *   fully parsed;
 * - customer-decryption failures that could equally mean a broken enrollment
 *   key stay systemic when they affect the whole page (durable retry, no
 *   poison-reject data loss) and poison-reject only when a sibling receipt
 *   proves the key works.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/orders/canonical-source-order", () => ({
  createCanonicalSourceOrder: vi.fn(),
}));
vi.mock("./storefront-receipt-delegation", () => ({
  releaseRejectedStorefrontReceiptDelegation: vi.fn(async () => {}),
}));
vi.mock("@/lib/automations/engine", () => ({
  dispatchTrigger: vi.fn(async () => {}),
}));

import { createCanonicalSourceOrder } from "@/lib/orders/canonical-source-order";
import { releaseRejectedStorefrontReceiptDelegation } from "./storefront-receipt-delegation";
import { encryptStorefrontCustomer } from "../storefront/hosted-checkout-crypto";
import { generateConnectedKeyPair } from "./payload-crypto";
import type { ConnectedPlatformClient, StorefrontReceipt } from "./client";
import { importHostedStorefrontReceipts } from "./storefront-receipt-import";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";

const SHOP_ID = "shop_12345678";
const context = {
  prisma: {} as never,
  shop: { ...TEST_SHOP_CONTEXT, shopId: SHOP_ID },
};

const binding = {
  storefrontId: "storefront_12345678",
  releaseId: "release_12345678",
  idempotencyKey: "checkout_12345678",
  wilayaCode: "16",
  deliveryMode: "home" as const,
};

function baseReceipt(overrides: Partial<StorefrontReceipt>): StorefrontReceipt {
  return {
    relaySequence: 1,
    receiptId: "receipt_12345678",
    storefrontId: binding.storefrontId,
    storefrontSlug: "sahel-store",
    shopId: SHOP_ID,
    releaseId: binding.releaseId,
    idempotencyKey: binding.idempotencyKey,
    requestDigest: "b".repeat(64),
    encryptedCustomer: "AAAA",
    wrappedCustomerKey: "AAAA",
    wilayaCode: binding.wilayaCode,
    deliveryMode: binding.deliveryMode,
    subtotalDzd: 2_500,
    shippingDzd: 500,
    totalDzd: 3_000,
    createdAt: "2026-08-13T12:00:00.000Z",
    lines: [{ itemKey: "product_12345678:base", quantity: 1, unitPriceDzd: 2_500 }],
    ...overrides,
  };
}

function fakeClient(page: { receipts: StorefrontReceipt[]; nextCursor: number }) {
  const completions: Array<Record<string, unknown>> = [];
  const client = {
    pollStorefrontReceipts: vi.fn(async () => page),
    completeStorefrontReceipt: vi.fn(async (_receiptId: string, payload: Record<string, unknown>) => {
      completions.push({ receiptId: _receiptId, ...payload });
      return {};
    }),
  };
  return { client: client as unknown as ConnectedPlatformClient, completions };
}

async function encryptWithFreshKeys(): Promise<{
  privateKeyPkcs8: string;
  encryptedCustomer: string;
  wrappedCustomerKey: string;
}> {
  const keys = generateConnectedKeyPair();
  const encrypted = await encryptStorefrontCustomer(
    {
      name: "Amina",
      phone: "0555123456",
      wilayaCode: "16",
      commune: "Alger Centre",
      address: "1 Didouche Mourad",
      notes: null,
    },
    keys.encryptionPublicKeyJwk,
    binding,
  );
  return {
    privateKeyPkcs8: keys.encryptionPrivateKeyPkcs8,
    encryptedCustomer: encrypted.encryptedCustomer,
    wrappedCustomerKey: encrypted.wrappedCustomerKey,
  };
}

beforeEach(() => {
  vi.mocked(createCanonicalSourceOrder).mockReset();
  vi.mocked(releaseRejectedStorefrontReceiptDelegation).mockClear();
});

describe("hosted storefront receipt ingestion poison contract (C1)", () => {
  it("rejects receipt-scoped corruption and advances the cursor instead of stalling", async () => {
    const keys = await encryptWithFreshKeys();
    // Receipt A: schema-invalid shape but with an addressable id — rejected
    // on the relay best-effort, never rethrows past the page.
    const malformed = baseReceipt({
      receiptId: "receipt_malformed",
      // Missing every required field the schema demands.
    }) as unknown as StorefrontReceipt;
    // Receipt B: well-formed shape but an unparseable release item key —
    // rejected with the item_authority classification.
    const badItemKey = baseReceipt({
      receiptId: "receipt_baditemk",
      requestDigest: "c".repeat(64),
      lines: [{ itemKey: "z:-x", quantity: 1, unitPriceDzd: 2_500 }],
    });
    const { client, completions } = fakeClient({
      receipts: [malformed, badItemKey],
      nextCursor: 7,
    });

    const result = await importHostedStorefrontReceipts({
      client,
      context,
      workspaceId: context.shop.workspaceId,
      encryptionPrivateKeyPkcs8: keys.privateKeyPkcs8,
      after: 3,
    });

    expect(result).toMatchObject({ imported: 0, replayed: 0, nextCursor: 7 });
    expect(completions).toHaveLength(2);
    expect(completions[0]).toMatchObject({ receiptId: "receipt_malformed", state: "rejected" });
    expect(completions[1]).toMatchObject({ receiptId: "receipt_baditemk", state: "rejected" });
    expect(completions[0]!.resultDigest).not.toBe(completions[1]!.resultDigest);
    expect(createCanonicalSourceOrder).not.toHaveBeenCalled();
  });

  it("releases the checkout delegation for a totals-inconsistent poison receipt", async () => {
    const keys = await encryptWithFreshKeys();
    const brokenTotals = baseReceipt({
      receiptId: "receipt_brokenamt",
      subtotalDzd: 2_600,
    });
    const { client, completions } = fakeClient({ receipts: [brokenTotals], nextCursor: 5 });

    const result = await importHostedStorefrontReceipts({
      client,
      context,
      workspaceId: context.shop.workspaceId,
      encryptionPrivateKeyPkcs8: keys.privateKeyPkcs8,
      after: 4,
    });

    expect(result).toMatchObject({ imported: 0, replayed: 0, nextCursor: 5 });
    expect(releaseRejectedStorefrontReceiptDelegation).toHaveBeenCalledTimes(1);
    expect(completions).toHaveLength(1);
    expect(completions[0]).toMatchObject({ receiptId: "receipt_brokenamt", state: "rejected" });
  });

  it("refuses a page where every receipt fails decryption (systemic key authority)", async () => {
    const keys = await encryptWithFreshKeys();
    const corrupted = baseReceipt({
      receiptId: "receipt_corrupt1",
      wrappedCustomerKey: keys.wrappedCustomerKey.slice(0, -4) + "AAAA",
    });
    const { client, completions } = fakeClient({ receipts: [corrupted], nextCursor: 6 });

    await expect(importHostedStorefrontReceipts({
      client,
      context,
      workspaceId: context.shop.workspaceId,
      encryptionPrivateKeyPkcs8: keys.privateKeyPkcs8,
      after: 5,
    })).rejects.toThrow(/decryption failed for all/i);

    // Systemic failure: no poison-reject data loss, durable retry authority
    // preserved (no completion marking, cursor untouched).
    expect(completions).toHaveLength(0);
    expect(createCanonicalSourceOrder).not.toHaveBeenCalled();
  });

  it("rejects an isolated decrypt failure once a sibling receipt proves the key works", async () => {
    const keys = await encryptWithFreshKeys();
    const good = baseReceipt({
      receiptId: "receipt_goodone1",
      requestDigest: "d".repeat(64),
      encryptedCustomer: keys.encryptedCustomer,
      wrappedCustomerKey: keys.wrappedCustomerKey,
    });
    const corrupted = baseReceipt({
      receiptId: "receipt_corrupt2",
      requestDigest: "e".repeat(64),
      wrappedCustomerKey: keys.wrappedCustomerKey.slice(0, -4) + "BBBB",
    });
    const { client, completions } = fakeClient({ receipts: [good, corrupted], nextCursor: 8 });
    vi.mocked(createCanonicalSourceOrder).mockResolvedValue({
      replayed: false,
      result: {
        order: { id: "order_canonical1", createdAt: new Date("2026-08-13T12:05:00.000Z") },
        automation: {},
      },
    } as never);

    const result = await importHostedStorefrontReceipts({
      client,
      context,
      workspaceId: context.shop.workspaceId,
      encryptionPrivateKeyPkcs8: keys.privateKeyPkcs8,
      after: 6,
    });

    expect(result).toMatchObject({ imported: 1, replayed: 0, nextCursor: 8 });
    expect(createCanonicalSourceOrder).toHaveBeenCalledTimes(1);
    expect(completions).toHaveLength(2);
    const goodCompletion = completions.find((c) => c.receiptId === "receipt_goodone1");
    const corruptCompletion = completions.find((c) => c.receiptId === "receipt_corrupt2");
    expect(goodCompletion).toMatchObject({ state: "imported", canonicalOrderRef: "order_canonical1" });
    expect(corruptCompletion).toMatchObject({ state: "rejected" });
    expect(releaseRejectedStorefrontReceiptDelegation).toHaveBeenCalledTimes(1);
  });

  it("marks a cross-shop receipt rejected without releasing this shop's delegation", async () => {
    const keys = await encryptWithFreshKeys();
    const crossShop = baseReceipt({
      receiptId: "receipt_crossshp",
      shopId: "shop_87654321",
    });
    const { client, completions } = fakeClient({ receipts: [crossShop], nextCursor: 9 });

    const result = await importHostedStorefrontReceipts({
      client,
      context,
      workspaceId: context.shop.workspaceId,
      encryptionPrivateKeyPkcs8: keys.privateKeyPkcs8,
      after: 8,
    });

    expect(result).toMatchObject({ imported: 0, replayed: 0, nextCursor: 9 });
    expect(releaseRejectedStorefrontReceiptDelegation).not.toHaveBeenCalled();
    expect(completions).toHaveLength(1);
    expect(completions[0]).toMatchObject({ receiptId: "receipt_crossshp", state: "rejected" });
  });

  it("fails fast on an unusable enrollment key before touching any receipt", async () => {
    const { client, completions } = fakeClient({ receipts: [], nextCursor: 2 });

    await expect(importHostedStorefrontReceipts({
      client,
      context,
      workspaceId: context.shop.workspaceId,
      encryptionPrivateKeyPkcs8: "not-a-valid-pkcs8-key",
      after: 1,
    })).rejects.toThrow();

    expect(completions).toHaveLength(0);
  });
});
