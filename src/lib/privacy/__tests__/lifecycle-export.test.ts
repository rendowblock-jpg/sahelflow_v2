import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioural contract for createShopPrivacyExport(): runs the real export
 * function against a recording in-memory stand-in for the protected Prisma
 * client, so the document that would be handed to the seller is inspected
 * directly (no database).
 */
const harness = vi.hoisted(() => {
  const rows = new Map<string, unknown[]>();
  const reads: string[] = [];
  const db = new Proxy(
    {},
    {
      get: (_target, delegate) => {
        if (typeof delegate !== "string" || delegate === "then") {
          return undefined;
        }
        return {
          findMany: async () => {
            reads.push(delegate);
            return rows.get(delegate) ?? [];
          },
        };
      },
    },
  );
  return { rows, reads, db };
});

vi.mock("@/lib/db", () => ({
  db: harness.db,
  shopContext: {
    workspaceId: "workspace-test",
    installationId: "installation-test",
    shopId: "shop-test",
    shopIncarnationId: "incarnation-test",
    registryRevision: 1,
  },
}));
vi.mock("@/lib/automations/notification-codec", () => ({
  openAutomationNotificationBody: vi.fn(),
}));
vi.mock("@/lib/business-truth/envelope-key", () => ({
  getBusinessEnvelopeKey: vi.fn(),
}));
vi.mock("@/lib/demo/algerian-demo-policy", () => ({
  withDemoPolicyLock: vi.fn(),
}));
vi.mock("@/lib/maintenance/privacy-erase-transaction", () => ({
  withPrivacyEraseTransaction: vi.fn(),
}));
vi.mock("@/lib/whatsapp/message-attachments", () => ({
  openWhatsAppMessageAttachmentWithKey: vi.fn(),
}));

import { createShopPrivacyExport } from "../lifecycle";

interface ExportDocument {
  inventory: {
    includedModels: string[];
    excludedModels: string[];
    settingValuesExcluded: boolean;
  };
  models: Record<string, unknown>;
}

async function runExport(): Promise<{ document: ExportDocument; text: string }> {
  const payload = await createShopPrivacyExport();
  const text = payload.toString("utf8");
  return { document: JSON.parse(text) as ExportDocument, text };
}

const STAMP = "2026-10-01T10:00:00.000Z";

const FORMERLY_OMITTED_ROWS: Readonly<Record<string, readonly [string, unknown[]]>> = {
  AiMessageFeedback: [
    "aiMessageFeedback",
    [{ id: "fb-1", messageId: "msg-1", value: "down", createdAt: STAMP }],
  ],
  CapiAttemptLog: [
    "capiAttemptLog",
    [
      {
        id: "attempt-1",
        orderId: "order-1",
        stage: "confirmed",
        eventName: "Purchase",
        attempt: 1,
        status: "sent",
        httpStatus: 200,
        fbtraceId: "trace-1",
        error: null,
        sentAt: STAMP,
      },
    ],
  ],
  CapiEventLedger: [
    "capiEventLedger",
    [
      {
        id: "ledger-1",
        orderId: "order-1",
        eventName: "Purchase",
        stage: "confirmed",
        eventId: "order-1",
        status: "sent",
        attempts: 1,
        leaseUntil: null,
        metaEventId: "trace-1",
        lastError: null,
        triggeredAt: STAMP,
        sentAt: STAMP,
        createdAt: STAMP,
        updatedAt: STAMP,
      },
    ],
  ],
  MetaPixelConfig: [
    "metaPixelConfig",
    [
      {
        id: "pixel-1",
        pixelId: "1234567890",
        adAccountName: "Shop ads",
        conversionEvent: "Purchase",
        testMode: true,
        testEventCode: "TEST123",
        enabled: true,
        createdAt: STAMP,
        updatedAt: STAMP,
      },
    ],
  ],
  QuantityTierOffer: [
    "quantityTierOffer",
    [
      {
        id: "offer-1",
        storefrontSlug: "demo",
        triggerProductId: "product-1",
        triggerVariantId: null,
        triggerQuantity: 3,
        rewardType: "free_shipping",
        rewardProductId: null,
        rewardVariantId: null,
        rewardQuantity: null,
        isActive: true,
        createdAt: STAMP,
        updatedAt: STAMP,
      },
    ],
  ],
};

beforeEach(() => {
  harness.rows.clear();
  harness.reads.length = 0;
});

describe("createShopPrivacyExport", () => {
  it("exports the five models the inventory includes, exactly as stored", async () => {
    for (const [delegate, rows] of Object.values(FORMERLY_OMITTED_ROWS)) {
      harness.rows.set(delegate, rows);
    }

    const { document } = await runExport();

    for (const [model, [, rows]] of Object.entries(FORMERLY_OMITTED_ROWS)) {
      expect(document.inventory.includedModels, model).toContain(model);
      expect(document.models[model], model).toEqual(rows);
    }
  });

  it("masks an access token that a stored CAPI error message carries", async () => {
    const leakedUrl =
      "https://graph.facebook.com/v21.0/bad pixel/events?access_token=SENTINEL_NOT_A_REAL_TOKEN%2Fabc&x=1";
    harness.rows.set("capiEventLedger", [
      {
        id: "ledger-2",
        orderId: "order-2",
        status: "failed",
        lastError: `Meta CAPI network error: Failed to parse URL from ${leakedUrl}`,
      },
    ]);
    harness.rows.set("capiAttemptLog", [
      {
        id: "attempt-2",
        orderId: "order-2",
        status: "failed",
        error: `retry at ${leakedUrl} and again ?ACCESS_TOKEN=SENTINEL_NOT_A_REAL_TOKEN`,
      },
    ]);

    const { document, text } = await runExport();

    expect(text).not.toContain("SENTINEL_NOT_A_REAL_TOKEN");
    expect(document.models.CapiEventLedger).toEqual([
      {
        id: "ledger-2",
        orderId: "order-2",
        status: "failed",
        lastError:
          "Meta CAPI network error: Failed to parse URL from https://graph.facebook.com/v21.0/bad pixel/events?access_token=[redacted]&x=1",
      },
    ]);
    expect(document.models.CapiAttemptLog).toEqual([
      {
        id: "attempt-2",
        orderId: "order-2",
        status: "failed",
        error:
          "retry at https://graph.facebook.com/v21.0/bad pixel/events?access_token=[redacted]&x=1 and again ?ACCESS_TOKEN=[redacted]",
      },
    ]);
  });

  it("never reads or exports credential, key or session models", async () => {
    harness.rows.set("secret", [{ key: "meta_capi_access_token", ciphertext: "SENTINEL_SECRET_ROW" }]);
    harness.rows.set("authSecret", [{ id: "auth", secret: "SENTINEL_SECRET_ROW" }]);
    harness.rows.set("protectedKeyAuthority", [{ purpose: "shop-data", wrappedKey: "SENTINEL_SECRET_ROW" }]);
    harness.rows.set("session", [{ id: "session-1", tokenHash: "SENTINEL_SECRET_ROW" }]);

    const { document, text } = await runExport();

    expect(text).not.toContain("SENTINEL_SECRET_ROW");
    for (const delegate of ["secret", "authSecret", "protectedKeyAuthority", "session"]) {
      expect(harness.reads, delegate).not.toContain(delegate);
    }
    expect(document.inventory.excludedModels).toEqual(
      expect.arrayContaining([
        "AuthSecret",
        "ProtectedKeyAuthority",
        "Secret",
        "Session",
        "WilayaRiskProfile",
      ]),
    );
  });

  it("leaves derived search-index material out and says so in the manifest", async () => {
    harness.rows.set("searchProjectionToken", [
      { family: "customer", entityId: "customer-1", tokenHash: "SENTINEL_TOKEN_HASH" },
    ]);
    harness.rows.set("searchProjectionDirty", [
      { family: "customer", entityId: "customer-1", revision: 4 },
    ]);

    const { document, text } = await runExport();

    expect(text).not.toContain("SENTINEL_TOKEN_HASH");
    for (const model of ["SearchProjectionToken", "SearchProjectionDirty", "SearchProjectionRevision"]) {
      expect(document.inventory.includedModels, model).not.toContain(model);
      expect(document.inventory.excludedModels, model).toContain(model);
      expect(document.models, model).not.toHaveProperty(model);
    }
    expect(harness.reads).not.toContain("searchProjectionToken");
    expect(harness.reads).not.toContain("searchProjectionDirty");
  });

  it("keeps the all-or-nothing 32 MiB cap", async () => {
    harness.rows.set("category", [{ id: "category-1", name: "x".repeat(33 * 1024 * 1024) }]);

    await expect(createShopPrivacyExport()).rejects.toThrow(
      "Privacy export exceeds the local response limit; no partial portability file was created.",
    );
  });
});
