import { afterEach, describe, expect, it, vi } from "vitest";

import { dispatchQueueDecision } from "@/lib/orders/confirmation-queue-dispatch";
import { dispatchLegacyTransition } from "@/lib/orders/order-action-dispatch";
import { translateServerError } from "@/lib/i18n/translate-server-error";

// The answer the local walk measured for PATCH /api/orders/demo-order-025/status.
const STOCK_409 = {
  error: "Insufficient available stock for product 'demo-product-09'",
  code: "CONFLICT",
};
const idT = (key: string) => key;

function answerWith(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status, json: async () => body })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const base = { locale: "en" as const, fallbackMessage: "FALLBACK", blockedMessage: "BLOCKED" };

describe("confirming a legacy order with not enough stock", () => {
  it("order page (rail): the 409 becomes the stock sentence, not the generic one", async () => {
    answerWith(409, STOCK_409);
    const outcome = await dispatchLegacyTransition({ id: "demo-order-025" }, "confirmed", {
      ...base,
      legacyErrorTranslator: (raw) => translateServerError(raw, idT, "FALLBACK"),
    });
    expect(outcome).toEqual({ ok: false, message: "orders.errors.insufficientStock" });
  });

  it("confirmation queue: the 409 is translated too when the screen passes the translator", async () => {
    answerWith(409, STOCK_409);
    const outcome = await dispatchQueueDecision(
      { id: "demo-order-025", version: 1, mutationAuthority: "legacy_compatibility" },
      "confirm",
      { ...base, legacyErrorTranslator: (raw) => translateServerError(raw, idT, "FALLBACK") },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toBe("orders.errors.insufficientStock");
    expect(outcome.message).not.toContain("demo-product-09");
  });

  it("confirmation queue: callers that pass no translator keep today's behaviour", async () => {
    answerWith(409, STOCK_409);
    const outcome = await dispatchQueueDecision(
      { id: "demo-order-025", version: 1, mutationAuthority: "legacy_compatibility" },
      "confirm",
      base,
    );
    expect(outcome.message).toBe(STOCK_409.error);
  });

  it("an empty error body still gives the caller's fallback", async () => {
    answerWith(500, {});
    const outcome = await dispatchQueueDecision(
      { id: "o1", version: 1, mutationAuthority: "legacy_compatibility" },
      "confirm",
      { ...base, legacyErrorTranslator: (raw) => translateServerError(raw, idT, "FALLBACK") },
    );
    expect(outcome.message).toBe("FALLBACK");
  });
});
