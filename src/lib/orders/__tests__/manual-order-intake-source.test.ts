import { describe, expect, it } from "vitest";

import { assertManualOrderIntakeSource } from "@/lib/orders/manual-order-intake-source";
import { ValidationError } from "@/types/errors";

/**
 * S03a-01: POST /api/orders is the governed manual intake. A body that names any
 * other order source must be refused, never handed to the legacy engine.
 */
describe("assertManualOrderIntakeSource", () => {
  it("accepts an omitted, null or manual source", () => {
    expect(() => assertManualOrderIntakeSource({})).not.toThrow();
    expect(() => assertManualOrderIntakeSource({ source: undefined })).not.toThrow();
    expect(() => assertManualOrderIntakeSource({ source: null })).not.toThrow();
    expect(() => assertManualOrderIntakeSource({ source: "manual" })).not.toThrow();
  });

  it("leaves non-object bodies to the manual command's own schema", () => {
    for (const body of [null, undefined, "manual", 42, true, []]) {
      expect(() => assertManualOrderIntakeSource(body)).not.toThrow();
    }
  });

  it.each([
    "whatsapp",
    "tiktok",
    "webstore",
    "storefront",
    "ai_chat",
    "shopify",
    "woocommerce",
    "youcan",
    "csv",
    "xlsx",
    "google_sheets",
  ])("refuses the %s channel source with a 400 on the source field", (source) => {
    let thrown: unknown;
    try {
      assertManualOrderIntakeSource({ source });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ValidationError);
    expect(thrown).toMatchObject({
      code: "VALIDATION_ERROR",
      statusCode: 400,
      field: "source",
    });
  });

  it.each([
    ["different case", "MANUAL"],
    ["padded", " manual"],
    ["empty string", ""],
    ["number", 1],
    ["boolean", false],
    ["array", ["manual"]],
    ["object", { toString: () => "manual" }],
  ])("refuses a source that is not exactly the string manual (%s)", (_label, source) => {
    expect(() => assertManualOrderIntakeSource({ source })).toThrow(ValidationError);
  });

  it("does not echo the caller's value back in the message", () => {
    const marker = "x-forged-marker-7f3a";
    try {
      assertManualOrderIntakeSource({ source: marker });
      throw new Error("expected a refusal");
    } catch (error) {
      expect((error as Error).message).not.toContain(marker);
    }
  });
});
