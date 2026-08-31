import { describe, expect, it } from "vitest";

import { declaredOutboundMimeType } from "./outbound-media-mime";

const SAFE_IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);

describe("declaredOutboundMimeType", () => {
  it("accepts an allowed declared type and normalizes case", () => {
    expect(declaredOutboundMimeType("image/jpeg", SAFE_IMAGE)).toBe(
      "image/jpeg",
    );
    expect(declaredOutboundMimeType("image/PNG", SAFE_IMAGE)).toBe(
      "image/png",
    );
  });

  it("returns null when the field is missing or not a string", () => {
    expect(declaredOutboundMimeType(null, SAFE_IMAGE)).toBeNull();
    expect(declaredOutboundMimeType(undefined, SAFE_IMAGE)).toBeNull();
    expect(declaredOutboundMimeType(42, SAFE_IMAGE)).toBeNull();
  });

  it("returns null when the declared type is outside the safe set", () => {
    expect(declaredOutboundMimeType("", SAFE_IMAGE)).toBeNull();
    expect(declaredOutboundMimeType("application/zip", SAFE_IMAGE)).toBeNull();
    expect(declaredOutboundMimeType("image/svg+xml", SAFE_IMAGE)).toBeNull();
  });
});
