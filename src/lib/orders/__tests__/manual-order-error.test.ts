import { describe, expect, it } from "vitest";

import { translateManualOrderError } from "../manual-order-error";

describe("translateManualOrderError", () => {
  it("localizes insufficient stock in all supported locales", () => {
    const message = "Insufficient available stock for product 'p1'";
    expect(translateManualOrderError("CONFLICT", message, "en", "fallback")).toContain("quantity");
    expect(translateManualOrderError("CONFLICT", message, "fr", "fallback")).toContain("quantité");
    expect(translateManualOrderError("CONFLICT", message, "ar", "fallback")).toContain("الكمية");
  });

  it("distinguishes stale optimistic versions and idempotency conflicts", () => {
    expect(
      translateManualOrderError(
        "CONFLICT",
        "Order o1 version conflict: expected 1, current 2",
        "en",
        "fallback",
      ),
    ).toContain("another view");
    expect(
      translateManualOrderError(
        "CONFLICT",
        "Idempotency key was reused with different command content",
        "fr",
        "fallback",
      ),
    ).toContain("demande initiale");
  });

  it("localizes canonical boundary codes", () => {
    expect(
      translateManualOrderError(
        "CANONICAL_CONFIRMATION_REQUIRED",
        null,
        "ar",
        "fallback",
      ),
    ).toContain("التأكيد");
    expect(
      translateManualOrderError(
        "CANONICAL_FOLLOWUP_REQUIRED",
        null,
        "fr",
        "fallback",
      ),
    ).toContain("stock");
    expect(
      translateManualOrderError(
        "CANONICAL_ORDER_EDIT_REQUIRED",
        null,
        "en",
        "fallback",
      ),
    ).toContain("Products and prices");
  });

  it("returns the caller's localized fallback for unrelated server errors", () => {
    expect(
      translateManualOrderError("INTERNAL", "secret server detail", "ar", "تعذر التحديث"),
    ).toBe("تعذر التحديث");
  });
});
