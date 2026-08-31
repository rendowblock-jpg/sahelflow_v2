import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BULK_SYNC_CAP,
  collectInTransitDeliveries,
  collectSyncBatch,
  isSyncableDelivery,
  runBulkDeliverySync,
  type BulkSyncDeliveryCandidate,
} from "@/components/deliveries/bulk-delivery-sync";
import { getDeliveriesRuntimeTranslation } from "@/lib/i18n/deliveries-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function row(
  overrides: Partial<BulkSyncDeliveryCandidate> = {},
): BulkSyncDeliveryCandidate {
  return {
    id: "delivery-1",
    status: "in_transit",
    trackingNumber: "TRK-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("isSyncableDelivery", () => {
  it("accepts active statuses with a tracking number", () => {
    for (const status of [
      "pending",
      "created",
      "picked_up",
      "in_transit",
      "at_hub",
      "out_for_delivery",
    ]) {
      expect(isSyncableDelivery(row({ status })), status).toBe(true);
    }
  });

  it("rejects final statuses, missing tracking numbers and unknowns", () => {
    for (const status of ["delivered", "returned", "refused", "failed"]) {
      expect(isSyncableDelivery(row({ status })), status).toBe(false);
    }
    expect(
      isSyncableDelivery(row({ trackingNumber: null })),
    ).toBe(false);
    expect(isSyncableDelivery(row({ status: "creating" }))).toBe(false);
  });
});

describe("collectSyncBatch", () => {
  it("keeps only syncable rows, dedupes and orders most recent first", () => {
    const { batch, capped, syncableTotal } = collectSyncBatch([
      row({ id: "old", trackingNumber: "T-old", createdAt: "2026-01-01T00:00:00.000Z" }),
      row({ id: "new", trackingNumber: "T-new", createdAt: "2026-02-01T00:00:00.000Z" }),
      row({ id: "old", trackingNumber: "T-old", createdAt: "2026-01-01T00:00:00.000Z" }),
      row({ id: "delivered", status: "delivered", createdAt: "2026-03-01T00:00:00.000Z" }),
      row({ id: "no-tracking", trackingNumber: null }),
    ]);

    expect(batch.map((delivery) => delivery.id)).toEqual(["new", "old"]);
    expect(capped).toBe(false);
    expect(syncableTotal).toBe(2);
  });

  it("caps the batch and reports the overflow", () => {
    const rows = Array.from({ length: BULK_SYNC_CAP + 5 }, (_, index) =>
      row({
        id: `d-${index}`,
        trackingNumber: `T-${index}`,
        createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      }),
    );

    const { batch, capped, syncableTotal } = collectSyncBatch(rows);
    expect(batch).toHaveLength(BULK_SYNC_CAP);
    expect(capped).toBe(true);
    expect(syncableTotal).toBe(BULK_SYNC_CAP + 5);
    // Most recent first: the last generated row carries the newest date.
    expect(batch[0]?.id).toBe("d-104");
  });
});

describe("collectInTransitDeliveries", () => {
  it("queries every syncable status group through the list API and merges", async () => {
    const urls: string[] = [];
    const fetchJson = async (url: string) => {
      urls.push(url);
      return {
        deliveries: [
          row({
            id: `delivery-${urls.length}`,
            trackingNumber: `TRK-${urls.length}`,
          }),
        ],
      };
    };

    const rows = await collectInTransitDeliveries(fetchJson);

    expect(urls).toHaveLength(5);
    expect(urls.every((url) => url.includes("page=1&pageSize=100"))).toBe(true);
    for (const status of [
      "pending",
      "picked_up",
      "in_transit",
      "at_hub",
      "out_for_delivery",
    ]) {
      expect(urls.some((url) => url.endsWith(`status=${status}`)), status).toBe(
        true,
      );
    }
    expect(rows).toHaveLength(5);
  });
});

describe("runBulkDeliverySync", () => {
  it("reports successes, failures, reconciliation conflicts and failed refs", async () => {
    const rows = [
      row({ id: "ok-1", trackingNumber: "TRK-OK-1" }),
      row({ id: "ok-2", trackingNumber: "TRK-OK-2" }),
      row({ id: "conflict", trackingNumber: "TRK-CONFLICT" }),
      row({ id: "plain-fail", trackingNumber: "TRK-FAIL" }),
      row({ id: "network-error", trackingNumber: null }),
    ];
    const sync = async (deliveryId: string) => {
      if (deliveryId === "ok-1" || deliveryId === "ok-2") {
        return { ok: true };
      }
      if (deliveryId === "conflict") {
        return { ok: false, reconciliationRequired: true };
      }
      if (deliveryId === "network-error") {
        throw new Error("offline");
      }
      return { ok: false };
    };

    const outcome = await runBulkDeliverySync(rows, { sync });

    expect(outcome.succeeded).toBe(2);
    expect(outcome.failed).toBe(3);
    expect(outcome.reconciliationRequired).toBe(1);
    // Falls back to the delivery id when no tracking number exists.
    expect(outcome.failedRefs).toContain("TRK-CONFLICT");
    expect(outcome.failedRefs).toContain("TRK-FAIL");
    expect(outcome.failedRefs).toContain("network-error");
  });

  it("caps failedRefs at five entries", async () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      row({ id: `d-${index}`, trackingNumber: `T-${index}` }),
    );
    const outcome = await runBulkDeliverySync(rows, {
      sync: async () => ({ ok: false }),
    });
    expect(outcome.failedRefs).toHaveLength(5);
    expect(outcome.failed).toBe(8);
  });

  it("never exceeds the concurrency limit and reports progress per settled batch", async () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      row({ id: `d-${index}`, trackingNumber: `T-${index}` }),
    );
    let inFlight = 0;
    let maxInFlight = 0;
    const progress: Array<[number, number]> = [];

    const outcome = await runBulkDeliverySync(rows, {
      concurrency: 4,
      sync: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return { ok: true };
      },
      onProgress: (done, total) => progress.push([done, total]),
    });

    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(outcome.succeeded).toBe(10);
    expect(progress.at(-1)).toEqual([10, 10]);
    for (const [index, [done]] of progress.entries()) {
      const previous = index > 0 ? progress[index - 1]?.[0] ?? 0 : 0;
      expect(done).toBeGreaterThan(previous);
    }
  });

  it("handles an empty batch without calling the sync endpoint", async () => {
    let calls = 0;
    const outcome = await runBulkDeliverySync([], {
      sync: async () => {
        calls += 1;
        return { ok: true };
      },
    });
    expect(calls).toBe(0);
    expect(outcome).toEqual({
      succeeded: 0,
      failed: 0,
      reconciliationRequired: 0,
      failedRefs: [],
    });
  });
});

describe("R3-d source contracts", () => {
  it("drives the courier select from the provider registry, not a hardcoded list", () => {
    const createShipment = read("src/components/orders/create-shipment.tsx");
    expect(createShipment).toContain(
      'from "@/lib/integrations/delivery/types"',
    );
    expect(createShipment).toContain("DELIVERY_PROVIDERS.map");
    expect(createShipment).toContain("getBrandIcon");
    expect(createShipment).not.toContain('<SelectItem value="yalidine">');
    expect(createShipment).not.toContain('<SelectItem value="maystro">');
    expect(createShipment).not.toContain('<SelectItem value="zrexpress">');
    expect(createShipment).not.toContain('<SelectItem value="ecotrack">');
  });

  it("previews the fee through the governed estimate route with the booking weight basis", () => {
    const hook = read("src/components/deliveries/use-delivery-fee-quote.ts");
    expect(hook).toContain('"/api/delivery/estimate"');
    // Same weight basis as POST /api/delivery/create: total quantity, min 1.
    expect(hook).toContain("Math.max(");
    expect(hook).toContain("quantity");
  });

  it("bulk sync toolbar batches manually with cache invalidation and no auto-polling", () => {
    const toolbar = read("src/components/deliveries/deliveries-bulk-sync.tsx");
    expect(toolbar).toContain("runBulkDeliverySync");
    expect(toolbar).toContain('mutatePrefix("/api/delivery")');
    expect(toolbar).toContain("router.refresh()");
    // Manual bulk only — courier APIs are never auto-polled.
    expect(toolbar).not.toMatch(/setInterval|setTimeout/);
  });

  it("registers the deliveries runtime dictionary in the shared resolver", () => {
    const runtime = read("src/lib/i18n/runtime-translations.ts");
    expect(runtime).toContain("getDeliveriesRuntimeTranslation");
  });
});

describe("deliveries runtime dictionary", () => {
  const KEYS = [
    "deliveries.bulkSync.action",
    "deliveries.bulkSync.preparing",
    "deliveries.bulkSync.progress",
    "deliveries.bulkSync.success",
    "deliveries.bulkSync.partial",
    "deliveries.bulkSync.none",
    "deliveries.bulkSync.capped",
    "deliveries.bulkSync.reconciliationHint",
    "deliveries.bulkSync.fetchFailed",
    "deliveries.bulkSync.lastSync",
    "deliveries.fee.estimate",
  ];

  it("ships every key in en/fr/ar", () => {
    for (const locale of ["en", "fr", "ar"] as const) {
      for (const key of KEYS) {
        expect(getDeliveriesRuntimeTranslation(locale, key), `${locale}:${key}`)
          .toBeTruthy();
      }
    }
  });

  it("resolves through the shared runtime chain with interpolation params", () => {
    expect(getRuntimeTranslation("en", "deliveries.bulkSync.action")).toBe(
      "Sync all in transit",
    );
    expect(getRuntimeTranslation("fr", "deliveries.bulkSync.progress")).toBe(
      "Synchronisation {{done}}/{{total}}",
    );
    expect(getRuntimeTranslation("ar", "deliveries.bulkSync.lastSync")).toBe(
      "آخر مزامنة: {{time}}",
    );
    expect(getRuntimeTranslation("en", "deliveries.fee.estimate")).toContain(
      "{{wilaya}}",
    );
    expect(getRuntimeTranslation("en", "deliveries.fee.estimate")).toContain(
      "(home delivery)",
    );
  });
});
