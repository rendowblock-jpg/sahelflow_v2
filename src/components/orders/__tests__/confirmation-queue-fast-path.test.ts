import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getConfirmationQueueRuntimeTranslation } from "@/lib/i18n/confirmation-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import {
  dispatchQueueDecision,
  isQueueDecisionActionable,
  resolveDecisionIdempotencyKey,
  runQueueDecisionBatch,
  summarizeBatchFailures,
} from "@/lib/orders/confirmation-queue-dispatch";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn<typeof fetch>();

/** Minimal localStorage double so idempotency keys survive retries. */
function stubLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
  return store;
}

const baseOptions = {
  locale: "en" as const,
  fallbackMessage: "Failed to update",
  blockedMessage: "Confirmation blocked (imported order)",
};

function requestPayload(call: number): Record<string, unknown> {
  const [url, init] = fetchMock.mock.calls[call] ?? [];
  expect(url).toBeTruthy();
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("confirmation queue dispatch (governed vs legacy authority)", () => {
  it("confirms governed orders through the decision command with a released idempotency key", async () => {
    const store = stubLocalStorage();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        order: { id: "o-1", status: "confirmed" },
        command: { replayed: false },
      }),
    );

    const outcome = await dispatchQueueDecision(
      { id: "o-1", version: 3, mutationAuthority: "canonical_v1" },
      "confirm",
      baseOptions,
    );

    expect(outcome).toEqual({ orderId: "o-1", ok: true, replayed: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/orders/o-1/decision");
    expect(init?.method).toBe("POST");

    const payload = requestPayload(0);
    expect(payload.decision).toBe("confirm");
    expect(payload.expectedVersion).toBe(3);
    expect(String(payload.idempotencyKey).length).toBeGreaterThanOrEqual(8);
    expect(payload.correlationId).toBe(
      `confirmation-queue-ui:${payload.idempotencyKey}`,
    );
    expect(payload.reason).toBeUndefined();
    expect(store.has("sf-order-decision:o-1:3:confirm")).toBe(false);
  });

  it("reuses the stored idempotency key across retries of the same decision", () => {
    const store = stubLocalStorage();
    const first = resolveDecisionIdempotencyKey("o-2", 7, "reject");
    const retry = resolveDecisionIdempotencyKey("o-2", 7, "reject");
    const nextVersion = resolveDecisionIdempotencyKey("o-2", 8, "reject");

    expect(retry).toBe(first);
    expect(nextVersion).not.toBe(first);
    expect(store.get("sf-order-decision:o-2:7:reject")).toBe(first);
  });

  it("sends the seller reason on governed rejections", async () => {
    stubLocalStorage();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { command: { replayed: false } }),
    );

    await dispatchQueueDecision(
      { id: "o-3", version: 1, mutationAuthority: "canonical_v1" },
      "reject",
      { ...baseOptions, reason: "Fake order" },
    );

    const payload = requestPayload(0);
    expect(payload.decision).toBe("reject");
    expect(payload.reason).toBe("Fake order");
  });

  it("translates coded governed rejections for the queue toast", async () => {
    stubLocalStorage();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        error: "Order o-4 version conflict: expected 2, current 5",
        code: "CONFLICT",
      }),
    );

    const outcome = await dispatchQueueDecision(
      { id: "o-4", version: 2, mutationAuthority: "canonical_v1" },
      "confirm",
      baseOptions,
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toBe(
      "This order changed in another view. Refresh it before confirming again.",
    );
  });

  it("routes legacy orders through the status endpoint, never the decision command", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { order: { id: "legacy" } }));

    const confirmed = await dispatchQueueDecision(
      { id: "o-5", version: 1, mutationAuthority: "legacy_compatibility" },
      "confirm",
      baseOptions,
    );
    expect(confirmed).toEqual({ orderId: "o-5", ok: true });

    await dispatchQueueDecision(
      { id: "o-6", version: 1, mutationAuthority: "legacy_compatibility" },
      "reject",
      { ...baseOptions, reason: "Unreachable" },
    );

    const [confirmUrl, confirmInit] = fetchMock.mock.calls[0] ?? [];
    const [rejectUrl, rejectInit] = fetchMock.mock.calls[1] ?? [];
    expect(confirmUrl).toBe("/api/orders/o-5/status");
    expect(confirmInit?.method).toBe("PATCH");
    expect(JSON.parse(String(confirmInit?.body))).toEqual({
      status: "confirmed",
    });
    expect(rejectUrl).toBe("/api/orders/o-6/status");
    expect(JSON.parse(String(rejectInit?.body))).toEqual({
      status: "cancelled",
    });
  });

  it("refuses blocked imported orders without any network call", async () => {
    const outcome = await dispatchQueueDecision(
      { id: "o-7", version: 1, mutationAuthority: "confirmation_blocked" },
      "confirm",
      baseOptions,
    );

    expect(outcome).toEqual({
      orderId: "o-7",
      ok: false,
      message: "Confirmation blocked (imported order)",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps isQueueDecisionActionable aligned with the authority contract", () => {
    expect(isQueueDecisionActionable({ mutationAuthority: "canonical_v1" })).toBe(true);
    expect(
      isQueueDecisionActionable({ mutationAuthority: "legacy_compatibility" }),
    ).toBe(true);
    expect(
      isQueueDecisionActionable({ mutationAuthority: "confirmation_blocked" }),
    ).toBe(false);
  });
});

describe("confirmation queue bulk batch", () => {
  it("confirms governed and legacy rows in one batch with honest partial results", async () => {
    stubLocalStorage();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/orders/g-1/decision") {
        return jsonResponse(200, { command: { replayed: false } });
      }
      if (url === "/api/orders/g-2/decision") {
        return jsonResponse(409, {
          error: "Insufficient available stock for variant 'v-9'",
          code: "CONFLICT",
        });
      }
      if (url === "/api/orders/l-1/status") {
        return jsonResponse(200, { order: { id: "l-1" } });
      }
      return jsonResponse(500, { error: "unexpected" });
    });

    const result = await runQueueDecisionBatch(
      [
        { id: "g-1", version: 1, mutationAuthority: "canonical_v1" },
        { id: "g-2", version: 4, mutationAuthority: "canonical_v1" },
        { id: "l-1", version: 1, mutationAuthority: "legacy_compatibility" },
        { id: "b-1", version: 1, mutationAuthority: "confirmation_blocked" },
      ],
      "confirm",
      baseOptions,
    );

    expect(result.succeeded).toEqual(["g-1", "l-1"]);
    expect(result.failed).toEqual([
      {
        id: "g-2",
        reason:
          "The requested quantity is no longer available. Refresh the order and review stock.",
      },
      { id: "b-1", reason: "Confirmation blocked (imported order)" },
    ]);
  });

  it("summarizes failure reasons compactly for partial toasts", () => {
    expect(
      summarizeBatchFailures([
        { id: "a", reason: "Out of stock" },
        { id: "b", reason: "Blocked" },
        { id: "c", reason: "Out of stock" },
      ]),
    ).toBe("Out of stock ×2 · Blocked ×1");
  });
});

describe("confirmation queue fast-path surface contract", () => {
  const table = read("src/components/orders/confirmation-queue-table.tsx");
  const hook = read("src/hooks/swr/use-confirmation-queue.ts");
  const page = read("src/app/(dashboard)/orders/confirmation-queue/page.tsx");
  const dispatch = read("src/lib/orders/confirmation-queue-dispatch.ts");

  it("exposes inline confirm and reject actions on every actionable row", () => {
    expect(table).toContain('data-testid="queue-row-confirm"');
    expect(table).toContain('data-testid="queue-row-reject"');
    expect(table).toContain('aria-label={t("confirmationQueue.inline.confirm")}');
    expect(table).toContain('aria-label={t("confirmationQueue.inline.reject")}');
    // Reject opens an anchored popover with quick-pick reasons, not a dialog.
    expect(table).toContain('data-testid="queue-reject-quickpick"');
    expect(table).toContain(
      '"confirmationQueue.reject.reason.fakeOrder"',
    );
    // Rows without inline authority keep the review-first link.
    expect(table).toContain('t("orders.workspace.confirmation.review")');
    expect(table).toContain("isQueueDecisionActionable(order)");
    expect(table).toContain("order.canUpdate && isQueueDecisionActionable(order)");
  });

  it("renders the bulk bar through the DataTable primitive once rows are selectable", () => {
    expect(table).toContain("selectColumn<ConfirmationQueueItem>()");
    expect(table).toContain(
      "bulkActions={canSelectRows ? bulkActions : undefined}",
    );
    expect(table).toContain('t("orders.confirmSelected")');
    expect(table).toContain('t("confirmationQueue.bulk.rejectSelected")');
    // One shared rejection form feeds a single reason to the whole batch.
    expect(table).toContain('runBulkDecision(targets, "reject", reason)');
    // The bar itself is the shared DataTable toolbar (data-table-bulk-bar).
    expect(read("src/components/data-table/data-table.tsx")).toContain(
      'data-testid="data-table-bulk-bar"',
    );
  });

  it("keeps bulk governed confirmations per-order and honest about partial results", () => {
    expect(dispatch).toContain("Promise.allSettled");
    expect(dispatch).toContain("releaseDecisionIdempotencyKey");
    expect(dispatch).toContain("summarizeBatchFailures");
    expect(table).toContain('t("orders.bulkPartial"');
    expect(table).toContain('t("orders.bulkSuccess"');
  });

  it("marks rows past the 60-minute confirmation SLA without new API surface", () => {
    expect(table).toContain("CONFIRMATION_SLA_MINUTES = 60");
    expect(table).toContain(
      'data-sla={stale ? "stale" : late ? "late" : "fresh"}',
    );
    expect(table).toContain("text-warning");
    expect(table).toContain('t("confirmationQueue.sla.overdue")');
    // Age stays locale-aware elapsed minutes (no server ageLabel echo).
    expect(table).toContain(
      "formatOperationalAge(row.original.ageMinutes, locale)",
    );
    expect(table).not.toContain("{row.original.ageLabel}");
  });

  it("refreshes incoming pending orders every 30 seconds", () => {
    expect(hook).toContain("refreshInterval: 30_000");
  });

  it("keeps the all-caught-up state distinct and the pending count in the page header", () => {
    expect(table).toContain('testId="queue-all-caught-up"');
    expect(table).toContain('t("confirmationQueue.empty.slaMet")');
    expect(table).toContain('t("confirmationQueue.empty.autoRefresh")');
    expect(page).toContain('data-testid="confirmation-queue-count"');
    expect(page).toContain('t("confirmationQueue.header.pendingCount"');
  });

  it("mutates the queue and the orders lists after every decision", () => {
    expect(table).toContain('mutatePrefix("/api/orders")');
    expect(table).toContain("router.refresh()");
    expect(table).toContain("optimisticData: removeRow");
    expect(table).toContain("rollbackOnError: true");
  });
});

describe("confirmation queue runtime dictionary", () => {
  const locales = ["en", "fr", "ar"] as const;
  const manifest = [
    "confirmationQueue.inline.confirm",
    "confirmationQueue.inline.reject",
    "confirmationQueue.reject.popoverTitle",
    "confirmationQueue.reject.quickPicksLabel",
    "confirmationQueue.reject.reason.customerCancelled",
    "confirmationQueue.reject.reason.fakeOrder",
    "confirmationQueue.reject.reason.unreachable",
    "confirmationQueue.reject.reason.postponed",
    "confirmationQueue.reject.submit",
    "confirmationQueue.reject.legacyHint",
    "confirmationQueue.bulk.rejectSelected",
    "confirmationQueue.bulk.rejectTitle",
    "confirmationQueue.bulk.blockedReason",
    "confirmationQueue.sla.overdue",
    "confirmationQueue.toast.confirmed",
    "confirmationQueue.toast.rejected",
    "confirmationQueue.empty.slaMet",
    "confirmationQueue.empty.autoRefresh",
    "confirmationQueue.header.pendingCount",
  ];

  it.each(locales)("resolves every fast-path key for %s", (locale) => {
    for (const key of manifest) {
      expect(
        getConfirmationQueueRuntimeTranslation(locale, key),
        key,
      ).toBeTruthy();
    }
    expect(
      getConfirmationQueueRuntimeTranslation(
        locale,
        "confirmationQueue.missing",
      ),
    ).toBeUndefined();
  });

  it.each(locales)(
    "registers the dictionary in the shared runtime resolver for %s",
    (locale) => {
      expect(
        getRuntimeTranslation(locale, "confirmationQueue.inline.confirm"),
      ).toBe(
        getConfirmationQueueRuntimeTranslation(
          locale,
          "confirmationQueue.inline.confirm",
        ),
      );
    },
  );

  it("keeps the rejection quick-picks localized, not machine codes", () => {
    expect(
      getConfirmationQueueRuntimeTranslation(
        "ar",
        "confirmationQueue.reject.reason.fakeOrder",
      ),
    ).toMatch(/[\u0600-\u06ff]/);
    expect(
      getConfirmationQueueRuntimeTranslation(
        "fr",
        "confirmationQueue.reject.reason.fakeOrder",
      ),
    ).toBe("Fausse commande");
    expect(
      getConfirmationQueueRuntimeTranslation(
        "en",
        "confirmationQueue.reject.reason.fakeOrder",
      ),
    ).toBe("Fake order");
  });
});
