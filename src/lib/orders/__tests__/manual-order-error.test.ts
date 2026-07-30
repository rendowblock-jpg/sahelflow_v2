import { describe, expect, it } from "vitest";

import { translateManualOrderError } from "../manual-order-error";

describe("manual order error localization", () => {
  it("localizes stock conflicts in AR, FR, and EN", () => {
    const message = "Insufficient available stock for product p1";
    expect(translateManualOrderError("CONFLICT", message, "ar", "fallback")).toContain("الكمية");
    expect(translateManualOrderError("CONFLICT", message, "fr", "fallback")).toContain("quantité");
    expect(translateManualOrderError("CONFLICT", message, "en", "fallback")).toContain("quantity");
  });

  it("distinguishes stale and idempotency conflicts", () => {
    expect(
      translateManualOrderError(
        "CONFLICT",
        "Order version conflict: expected 0, current 1",
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

  it("does not expose unrelated server details", () => {
    expect(
      translateManualOrderError("INTERNAL", "secret detail", "ar", "تعذر التحديث"),
    ).toBe("تعذر التحديث");
  });
});
