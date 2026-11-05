/** Pure helpers of the Tracking settings (ITEM 2 P1 slice 1): validation messages, empty = removed, what the shop is allowed to receive. */
import { describe, expect, it } from "vitest";
import {
  normalizeStorefrontTracking,
  STOREFRONT_TRACKING_PATTERNS,
  trackingFieldError,
} from "./studio-tracking";

describe("trackingFieldError", () => {
  it("is null for an empty value (the field is simply not set) and for a valid id", () => {
    expect(trackingFieldError("meta", "")).toBeNull();
    expect(trackingFieldError("tiktok", "")).toBeNull();
    expect(trackingFieldError("meta", "1234567890")).toBeNull();
    expect(trackingFieldError("tiktok", "CABCDEFGHIJ1")).toBeNull();
  });

  it("gives one message key per field for anything else, including script text and spaces", () => {
    for (const bad of ["12", "<script>", "1234567890 ", "'1234567890'", "CABCDEFGHIJ1"]) {
      expect(trackingFieldError("meta", bad)).toBe("storefront.tracking.error.meta");
    }
    for (const bad of ["ABC", "<script>", "cabcdefghij1", " CABCDEFGHIJ1", "1234567890'"]) {
      expect(trackingFieldError("tiktok", bad)).toBe("storefront.tracking.error.tiktok");
    }
  });
});

describe("normalizeStorefrontTracking: empty = removed, so an unset shop emits no key at all", () => {
  it("returns undefined for nothing, an empty block or only empty strings", () => {
    expect(normalizeStorefrontTracking(undefined)).toBeUndefined();
    expect(normalizeStorefrontTracking({})).toBeUndefined();
    expect(normalizeStorefrontTracking({ metaPixelId: "", tiktokPixelId: "" })).toBeUndefined();
    expect(normalizeStorefrontTracking({ metaPixelId: undefined })).toBeUndefined();
  });

  it("keeps only the ids that are set", () => {
    expect(normalizeStorefrontTracking({ metaPixelId: "", tiktokPixelId: "CABCDEFGHIJ1" })).toEqual({ tiktokPixelId: "CABCDEFGHIJ1" });
    expect(normalizeStorefrontTracking({ metaPixelId: "1234567890", tiktokPixelId: "" })).toEqual({ metaPixelId: "1234567890" });
    expect(normalizeStorefrontTracking({ metaPixelId: "1234567890", tiktokPixelId: "CABCDEFGHIJ1" })).toEqual({
      metaPixelId: "1234567890",
      tiktokPixelId: "CABCDEFGHIJ1",
    });
  });

  it("does not mutate its input", () => {
    const input = { metaPixelId: "", tiktokPixelId: "CABCDEFGHIJ1" };
    normalizeStorefrontTracking(input);
    expect(input).toEqual({ metaPixelId: "", tiktokPixelId: "CABCDEFGHIJ1" });
  });
});

describe("STOREFRONT_TRACKING_PATTERNS", () => {
  it("is the one source of the two shapes (the hosted validator repeats them; a test keeps both equal)", () => {
    expect(STOREFRONT_TRACKING_PATTERNS.meta).toBe("^[0-9]{10,20}$");
    expect(STOREFRONT_TRACKING_PATTERNS.tiktok).toBe("^[A-Z0-9]{10,32}$");
  });
});
