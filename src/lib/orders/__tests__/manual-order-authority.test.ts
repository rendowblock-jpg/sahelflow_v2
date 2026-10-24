import { describe, expect, it } from "vitest";

import {
  assertLegacyOrderFollowupAllowed,
  canonicalSourceOrderSourceMetadata,
  importPendingOrderSourceMetadata,
  isImportPendingOrderAuthority,
  isSellerTypedOrderAuthority,
  isTrustedManualOrderAuthority,
  trustedManualOrderSourceMetadata,
} from "../manual-order-authority";

describe("trusted manual order authority", () => {
  it("recognizes only the exact manual authority marker", () => {
    expect(
      isTrustedManualOrderAuthority("manual", trustedManualOrderSourceMetadata()),
    ).toBe(true);
    expect(
      isTrustedManualOrderAuthority("manual", { authority: "trusted-manual-v1" }),
    ).toBe(true);
    expect(isTrustedManualOrderAuthority("manual", "not-json")).toBe(false);
    expect(
      isTrustedManualOrderAuthority("shopify", {
        authority: "trusted-manual-v1",
      }),
    ).toBe(false);
    expect(
      isImportPendingOrderAuthority(
        "manual",
        importPendingOrderSourceMetadata(),
      ),
    ).toBe(true);
  });

  it("blocks legacy follow-up mutations with a stable conflict code", () => {
    let error: unknown;
    try {
      assertLegacyOrderFollowupAllowed("manual", {
        authority: "trusted-manual-v1",
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      code: "CANONICAL_FOLLOWUP_REQUIRED",
      statusCode: 409,
    });
    expect(() =>
      assertLegacyOrderFollowupAllowed("shopify", null),
    ).not.toThrow();
  });

  it("tells an order typed in by the seller from every other canonical order", () => {
    const sourceOrder = canonicalSourceOrderSourceMetadata({
      source: "storefront",
      sourceIdentity: "shop-a",
      sourceOrderId: "receipt-1",
    });
    expect(isSellerTypedOrderAuthority("manual", trustedManualOrderSourceMetadata())).toBe(true);
    expect(isSellerTypedOrderAuthority("manual", { authority: "trusted-manual-v1" })).toBe(true);
    // The wide check still answers true for a canonical SOURCE order; the narrow one must not.
    expect(isTrustedManualOrderAuthority("storefront", sourceOrder)).toBe(true);
    expect(isSellerTypedOrderAuthority("storefront", sourceOrder)).toBe(false);
    expect(isSellerTypedOrderAuthority("manual", importPendingOrderSourceMetadata())).toBe(false);
    expect(isSellerTypedOrderAuthority("manual", null)).toBe(false);
    expect(isSellerTypedOrderAuthority("manual", "not json")).toBe(false);
    expect(isSellerTypedOrderAuthority("whatsapp", trustedManualOrderSourceMetadata())).toBe(false);
  });
});
