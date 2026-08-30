import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOrderLifecycleRuntimeTranslation } from "@/lib/i18n/order-lifecycle-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import {
  dispatchLifecycleAction,
  getLifecycleActions,
  getLifecycleRailPosition,
  resolveFulfillmentIdempotencyKey,
} from "@/lib/orders/order-action-dispatch";

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

describe("lifecycle rail action matrix (per mutation authority)", () => {
  const governed = {
    mutationAuthority: "canonical_v1" as const,
    fulfillmentState: null,
    deliveryState: null,
  };

  it("governs pending orders with confirm and a reasoned reject only", () => {
    const actions = getLifecycleActions({ ...governed, status: "pending" });
    expect(actions).toEqual([
      { kind: "confirm" },
      { kind: "reject", requiresReason: true },
    ]);
  });

  it("governs draft orders with the source-draft submission only", () => {
    expect(getLifecycleActions({ ...governed, status: "draft" })).toEqual([
      { kind: "submit_draft" },
    ]);
  });

  it("offers governed pack, ship and deliver exactly when the kernel allows", () => {
    expect(
      getLifecycleActions({
        ...governed,
        status: "confirmed",
        fulfillmentState: "unfulfilled",
      }),
    ).toEqual([{ kind: "pack" }]);
    expect(
      getLifecycleActions({
        ...governed,
        status: "confirmed",
        fulfillmentState: "ready",
        deliveryState: "not_created",
      }),
    ).toEqual([{ kind: "ship" }]);
    expect(
      getLifecycleActions({
        ...governed,
        status: "confirmed",
        fulfillmentState: "preparing",
      }),
    ).toEqual([]);
    expect(
      getLifecycleActions({
        ...governed,
        status: "shipped",
        fulfillmentState: "shipped",
        deliveryState: "in_transit",
      }),
    ).toEqual([{ kind: "deliver" }]);
    expect(
      getLifecycleActions({
        ...governed,
        status: "shipped",
        fulfillmentState: "shipped",
        deliveryState: "out_for_delivery",
      }),
    ).toEqual([]);
    expect(
      getLifecycleActions({
        ...governed,
        status: "delivered",
        fulfillmentState: "closed",
        deliveryState: "delivered",
      }),
    ).toEqual([]);
  });

  it("keeps governed terminal statuses action-free", () => {
    for (const status of ["cancelled", "returned", "refused"] as const) {
      expect(getLifecycleActions({ ...governed, status })).toEqual([]);
    }
  });

  it("surfaces the legacy transition set, forward action first", () => {
    const legacy = {
      mutationAuthority: "legacy_compatibility" as const,
      fulfillmentState: null,
      deliveryState: null,
    };
    expect(getLifecycleActions({ ...legacy, status: "pending" })).toEqual([
      { kind: "transition", target: "confirmed", requiresReason: false },
      { kind: "transition", target: "cancelled", requiresReason: true },
    ]);
    expect(getLifecycleActions({ ...legacy, status: "confirmed" })).toEqual([
      { kind: "transition", target: "shipped", requiresReason: false },
      { kind: "transition", target: "cancelled", requiresReason: true },
      { kind: "transition", target: "returned", requiresReason: false },
      { kind: "transition", target: "refused", requiresReason: false },
    ]);
    expect(getLifecycleActions({ ...legacy, status: "shipped" })).toEqual([
      { kind: "transition", target: "delivered", requiresReason: false },
      { kind: "transition", target: "returned", requiresReason: false },
      { kind: "transition", target: "refused", requiresReason: false },
    ]);
    expect(getLifecycleActions({ ...legacy, status: "delivered" })).toEqual([
      { kind: "transition", target: "returned", requiresReason: false },
    ]);
    expect(getLifecycleActions({ ...legacy, status: "draft" })).toEqual([
      { kind: "transition", target: "pending", requiresReason: false },
      { kind: "transition", target: "cancelled", requiresReason: true },
    ]);
  });

  it("never offers actions to confirmation-blocked imported orders", () => {
    expect(
      getLifecycleActions({
        status: "pending",
        mutationAuthority: "confirmation_blocked",
        fulfillmentState: null,
        deliveryState: null,
      }),
    ).toEqual([]);
  });
});

describe("lifecycle rail position (5-step COD journey)", () => {
  it("walks the canonical milestones", () => {
    expect(
      getLifecycleRailPosition({ status: "pending", packedAt: null }),
    ).toEqual({
      currentStep: 0,
      completedSteps: [false, false, false, false, false],
    });
    expect(
      getLifecycleRailPosition({ status: "confirmed", packedAt: null }),
    ).toEqual({
      currentStep: 1,
      completedSteps: [true, false, false, false, false],
    });
    // Governed packing milestone: confirmed + packedAt parks on the Packed step.
    expect(
      getLifecycleRailPosition({
        status: "confirmed",
        packedAt: "2026-01-01T10:00:00.000Z",
      }),
    ).toEqual({
      currentStep: 2,
      completedSteps: [true, true, false, false, false],
    });
    // Legacy orders skip explicit packing — shipped implies packed passed.
    expect(
      getLifecycleRailPosition({ status: "shipped", packedAt: null }),
    ).toEqual({
      currentStep: 3,
      completedSteps: [true, true, true, false, false],
    });
    expect(
      getLifecycleRailPosition({ status: "delivered", packedAt: null }),
    ).toEqual({
      currentStep: 4,
      completedSteps: [true, true, true, true, true],
    });
    expect(getLifecycleRailPosition({ status: "draft", packedAt: null })).toEqual(
      {
        currentStep: 0,
        completedSteps: [false, false, false, false, false],
      },
    );
  });

  it("returns null for terminal statuses so the rail renders a badge", () => {
    for (const status of ["returned", "refused", "cancelled"] as const) {
      expect(getLifecycleRailPosition({ status, packedAt: null })).toBeNull();
    }
  });
});

describe("lifecycle rail dispatch (endpoint per authority)", () => {
  it("confirms governed pending orders through the shared decision command (queue parity)", async () => {
    const store = stubLocalStorage();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { order: { id: "o-1" }, command: { replayed: false } }),
    );

    const outcome = await dispatchLifecycleAction(
      { id: "o-1", version: 3, mutationAuthority: "canonical_v1" },
      { kind: "confirm" },
      baseOptions,
    );

    expect(outcome).toEqual({ ok: true, replayed: false });
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
    expect(store.has("sf-order-decision:o-1:3:confirm")).toBe(false);
  });

  it("persists the seller reason on governed rejections", async () => {
    stubLocalStorage();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { command: { replayed: false } }),
    );

    await dispatchLifecycleAction(
      { id: "o-2", version: 1, mutationAuthority: "canonical_v1" },
      { kind: "reject", requiresReason: true },
      { ...baseOptions, reason: "Fake order" },
    );

    const payload = requestPayload(0);
    expect(payload.decision).toBe("reject");
    expect(payload.reason).toBe("Fake order");
  });

  it("dispatches governed pack/ship/deliver through the fulfillment command", async () => {
    stubLocalStorage();
    fetchMock.mockResolvedValue(
      jsonResponse(200, { command: { replayed: false } }),
    );

    await dispatchLifecycleAction(
      { id: "o-3", version: 5, mutationAuthority: "canonical_v1" },
      { kind: "pack" },
      baseOptions,
    );
    await dispatchLifecycleAction(
      { id: "o-3", version: 6, mutationAuthority: "canonical_v1" },
      { kind: "ship" },
      baseOptions,
    );
    await dispatchLifecycleAction(
      { id: "o-3", version: 7, mutationAuthority: "canonical_v1" },
      { kind: "deliver" },
      baseOptions,
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [index, action] of [
      [0, "pack"],
      [1, "ship"],
      [2, "deliver"],
    ] as const) {
      const [url, init] = fetchMock.mock.calls[index] ?? [];
      expect(url).toBe("/api/orders/o-3/fulfillment");
      expect(init?.method).toBe("POST");
      const payload = requestPayload(index);
      expect(payload.action).toBe(action);
      expect(payload.expectedVersion).toBe(5 + index);
      expect(String(payload.idempotencyKey).length).toBeGreaterThanOrEqual(8);
      expect(payload.correlationId).toBe(
        `manual-fulfillment-ui:${payload.idempotencyKey}`,
      );
    }
  });

  it("reuses one fulfillment idempotency key across retries of the same version", () => {
    const store = stubLocalStorage();
    const first = resolveFulfillmentIdempotencyKey("o-4", 2, "pack");
    const retry = resolveFulfillmentIdempotencyKey("o-4", 2, "pack");
    expect(retry).toBe(first);
    expect(store.get("sf-order-fulfillment:o-4:2:pack")).toBe(first);
  });

  it("submits governed drafts through the source-draft command", async () => {
    stubLocalStorage();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { command: { replayed: false } }),
    );

    await dispatchLifecycleAction(
      { id: "o-5", version: 1, mutationAuthority: "canonical_v1" },
      { kind: "submit_draft" },
      baseOptions,
    );

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/orders/o-5/source/submit");
    expect(init?.method).toBe("POST");
    const payload = requestPayload(0);
    expect(payload.expectedVersion).toBe(1);
    expect(payload.correlationId).toBe(
      `source-draft-ui:${payload.idempotencyKey}`,
    );
  });

  it("routes legacy transitions through the status endpoint without a reason field", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { order: { id: "l-1" } }));

    await dispatchLifecycleAction(
      { id: "l-1", version: 1, mutationAuthority: "legacy_compatibility" },
      { kind: "confirm" },
      baseOptions,
    );
    await dispatchLifecycleAction(
      { id: "l-1", version: 1, mutationAuthority: "legacy_compatibility" },
      { kind: "transition", target: "shipped" },
      baseOptions,
    );
    // Legacy cancellation collects a reason for the seller but never sends it.
    await dispatchLifecycleAction(
      { id: "l-1", version: 1, mutationAuthority: "legacy_compatibility" },
      { kind: "transition", target: "cancelled", requiresReason: true },
      { ...baseOptions, reason: "Unreachable" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [index, status] of [
      [0, "confirmed"],
      [1, "shipped"],
      [2, "cancelled"],
    ] as const) {
      const [url, init] = fetchMock.mock.calls[index] ?? [];
      expect(url).toBe(`/api/orders/l-1/status`);
      expect(init?.method).toBe("PATCH");
      expect(requestPayload(index)).toEqual({ status });
    }
  });

  it("refuses blocked imported orders without any network call", async () => {
    const outcome = await dispatchLifecycleAction(
      { id: "b-1", version: 1, mutationAuthority: "confirmation_blocked" },
      { kind: "confirm" },
      baseOptions,
    );

    expect(outcome).toEqual({
      ok: false,
      message: "Confirmation blocked (imported order)",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses governed fulfillment and free transitions across authorities", async () => {
    stubLocalStorage();
    // A legacy order can never fire a governed fulfillment command.
    await dispatchLifecycleAction(
      { id: "x-1", version: 1, mutationAuthority: "legacy_compatibility" },
      { kind: "pack" },
      baseOptions,
    );
    // A governed order can never free-transition.
    await dispatchLifecycleAction(
      { id: "x-2", version: 1, mutationAuthority: "canonical_v1" },
      { kind: "transition", target: "shipped" },
      baseOptions,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("translates coded governed failures for the toast", async () => {
    stubLocalStorage();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        error: "Insufficient available stock for variant 'v-9'",
        code: "CONFLICT",
      }),
    );

    const outcome = await dispatchLifecycleAction(
      { id: "o-6", version: 2, mutationAuthority: "canonical_v1" },
      { kind: "pack" },
      baseOptions,
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toBe(
      "The requested quantity is no longer available. Refresh the order and review stock.",
    );
  });

  it("pipes legacy failures through the call site's translateServerError hook", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: "Order not found" }),
    );

    const outcome = await dispatchLifecycleAction(
      { id: "l-2", version: 1, mutationAuthority: "legacy_compatibility" },
      { kind: "transition", target: "shipped" },
      {
        ...baseOptions,
        legacyErrorTranslator: (raw) => `[translated] ${raw}`,
      },
    );

    expect(outcome).toEqual({ ok: false, message: "[translated] Order not found" });
  });
});

describe("lifecycle rail surface contract", () => {
  const rail = read("src/components/orders/order-lifecycle-rail.tsx");
  const dispatch = read("src/lib/orders/order-action-dispatch.ts");
  const page = read("src/app/(dashboard)/orders/[id]/page.tsx");

  it("renders the canonical 5-step COD journey with current/done/upcoming states", () => {
    expect(rail).toContain('data-testid="lifecycle-step"');
    expect(rail).toContain('data-step={LIFECYCLE_RAIL_STEPS[index]}');
    expect(rail).toContain('data-state={done ? "done" : current ? "current" : "upcoming"}');
    expect(rail).toContain('aria-current={current ? "step" : undefined}');
    // Step labels follow the canonical journey (pending → delivered).
    const labels = [
      '"orders.status.pending"',
      '"orders.status.confirmed"',
      '"orders.statusActions.packed"',
      '"orders.status.shipped"',
      '"orders.status.delivered"',
    ];
    for (const label of labels) expect(rail).toContain(label);
    // Terminal statuses render a badge, never steps.
    expect(rail).toContain('data-testid="lifecycle-terminal"');
    expect(rail).toContain("showChevron={false}");
    expect(rail).toContain('t("orders.statusActions.finalStatus")');
  });

  it("caps visible actions at three with an overflow popover", () => {
    expect(rail).toContain("MAX_VISIBLE_ACTIONS = 3");
    expect(rail).toContain("actions.slice(0, MAX_VISIBLE_ACTIONS)");
    expect(rail).toContain("actions.slice(MAX_VISIBLE_ACTIONS)");
    expect(rail).toContain('data-testid="lifecycle-more-actions"');
    expect(rail).toContain('data-testid="lifecycle-action"');
  });

  it("reuses the confirmation queue's rejection quick-picks and legacy hint", () => {
    expect(rail).toContain('"confirmationQueue.reject.reason.customerCancelled"');
    expect(rail).toContain('"confirmationQueue.reject.reason.fakeOrder"');
    expect(rail).toContain('"confirmationQueue.reject.reason.unreachable"');
    expect(rail).toContain('"confirmationQueue.reject.reason.postponed"');
    expect(rail).toContain('t("confirmationQueue.reject.legacyHint")');
    expect(rail).toContain('data-testid="lifecycle-reason-quickpick"');
  });

  it("gives every action per-button loading, coded errors and refresh", () => {
    expect(rail).toContain("translateServerError");
    expect(rail).toContain('t("orders.statusActions.updateFailed")');
    expect(rail).toContain('await mutatePrefix("/api/orders")');
    expect(rail).toContain("router.refresh()");
    expect(rail).toContain("toast.error");
    expect(dispatch).toContain("translateManualOrderError");
  });

  it("surfaces the governed sub-state machines under the rail", () => {
    expect(rail).toContain('data-testid="lifecycle-substate"');
    expect(rail).toContain('t("orders.workspace.fulfillment.heading")');
    expect(rail).toContain('"orders.workspace.fulfillment.axis.cod"');
    expect(rail).toContain('"orders.workspace.fulfillment.state.in_transit"');
    expect(rail).toContain('"orders.workspace.fulfillment.state.receivable"');
    // Last change time rides the timeline data already on the page.
    expect(rail).toContain('t("orderLifecycle.substate.updated", { time: updatedLabel })');
  });

  it("mounts one rail on the order detail page and removes the dual action cards", () => {
    expect(page).toContain("OrderLifecycleRail");
    expect(page).not.toContain("OrderStatusActions");
    expect(page).not.toContain("CanonicalFulfillmentActions");
    // R3-b's customer-summary WhatsApp + delivery-slip buttons survive.
    expect(page).toContain("OrderWhatsAppButton");
    expect(page).toContain("DeliverySlipPrintButton");
    // The governed auxiliary controls keep their dedicated card.
    expect(page).toContain("CanonicalCourierActions");
    expect(page).toContain("CanonicalCodActions");
    expect(page).toContain("CanonicalOrderRecoveryActions");
    expect(page).toContain("CanonicalCustomerReturnActions");
    expect(page).toContain('t("orderLifecycle.aux.heading")');
    // The timeline deep link lands on the tracking section.
    expect(page).toContain('id="order-tracking"');
    expect(rail).toContain('href="#order-tracking"');
    // The dual action cards are gone from the tree.
    expect(
      existsSync(resolve(root, "src/components/orders/order-status-actions.tsx")),
    ).toBe(false);
    expect(
      existsSync(
        resolve(root, "src/components/orders/canonical-fulfillment-actions.tsx"),
      ),
    ).toBe(false);
  });

  it("composes the R2-b queue dispatcher instead of duplicating its routing", () => {
    expect(dispatch).toContain("dispatchQueueDecision");
    expect(dispatch).toContain("from \"@/lib/orders/confirmation-queue-dispatch\"");
  });
});

describe("order lifecycle runtime dictionary", () => {
  const locales = ["en", "fr", "ar"] as const;
  const manifest = [
    "orderLifecycle.stepsLabel",
    "orderLifecycle.nextActions",
    "orderLifecycle.authority.legacy",
    "orderLifecycle.moreActions",
    "orderLifecycle.viewTimeline",
    "orderLifecycle.substate.updated",
    "orderLifecycle.cancel.popoverTitle",
    "orderLifecycle.cancel.submit",
    "orderLifecycle.aux.heading",
  ];

  it.each(locales)("resolves every rail key for %s", (locale) => {
    for (const key of manifest) {
      expect(
        getOrderLifecycleRuntimeTranslation(locale, key),
        key,
      ).toBeTruthy();
    }
    expect(
      getOrderLifecycleRuntimeTranslation(locale, "orderLifecycle.missing"),
    ).toBeUndefined();
  });

  it.each(locales)(
    "registers the dictionary in the shared runtime resolver for %s",
    (locale) => {
      expect(
        getRuntimeTranslation(locale, "orderLifecycle.nextActions"),
      ).toBe(
        getOrderLifecycleRuntimeTranslation(locale, "orderLifecycle.nextActions"),
      );
    },
  );

  it("keeps rail copy trilingual with real Arabic", () => {
    expect(
      getOrderLifecycleRuntimeTranslation("ar", "orderLifecycle.viewTimeline"),
    ).toMatch(/[\u0600-\u06ff]/);
    expect(
      getOrderLifecycleRuntimeTranslation("fr", "orderLifecycle.nextActions"),
    ).toBe("Prochaines actions");
    expect(
      getOrderLifecycleRuntimeTranslation("en", "orderLifecycle.nextActions"),
    ).toBe("Next actions");
  });
});
