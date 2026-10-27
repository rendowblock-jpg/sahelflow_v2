import { describe, expect, it } from "vitest";

import {
  assertLegacyOrderFollowupAllowed,
  canonicalSourceOrderSourceMetadata,
  importPendingOrderSourceMetadata,
  isImportPendingOrderAuthority,
  isSellerEditableLinesAuthority,
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

describe("orders whose lines the seller may edit while pending (NEW-ORDER-LINES-OTHER-SOURCES)", () => {
  const canonical = (source: Parameters<typeof canonicalSourceOrderSourceMetadata>[0]["source"], sourceDetails?: Record<string, unknown>) =>
    canonicalSourceOrderSourceMetadata({ source, sourceIdentity: "id", sourceOrderId: "o-1", sourceDetails });

  it("allows the seller's own order and the sources that hold no stock while pending", () => {
    expect(isSellerEditableLinesAuthority("manual", trustedManualOrderSourceMetadata())).toBe(true);
    for (const source of ["whatsapp", "ai_chat", "csv", "xlsx", "storefront"] as const) {
      expect(isSellerEditableLinesAuthority(source, canonical(source))).toBe(true);
    }
    expect(isSellerEditableLinesAuthority("storefront", canonical("storefront", { deliveryMode: "home" }))).toBe(true);
  });

  it("refuses the platform and sheet sources, which wait for a product decision", () => {
    for (const source of ["shopify", "woocommerce", "youcan", "google_sheets"] as const) {
      expect(isSellerEditableLinesAuthority(source, canonical(source))).toBe(false);
    }
  });

  it("refuses a hosted-storefront order, also when its hosted marker is incomplete", () => {
    expect(isSellerEditableLinesAuthority("storefront", canonical("storefront", { hostedDelegationAuthority: "v1", hostedReleaseId: "release-00000001" }))).toBe(false);
    expect(isSellerEditableLinesAuthority("storefront", canonical("storefront", { hostedDelegationAuthority: "v1" }))).toBe(false);
    expect(isSellerEditableLinesAuthority("storefront", canonical("storefront", { hostedReleaseId: "release-00000001" }))).toBe(false);
  });

  it("refuses legacy, import-pending and mismatched metadata", () => {
    expect(isSellerEditableLinesAuthority("whatsapp", null)).toBe(false);
    expect(isSellerEditableLinesAuthority("whatsapp", "not-json")).toBe(false);
    expect(isSellerEditableLinesAuthority("whatsapp", trustedManualOrderSourceMetadata())).toBe(false);
    expect(isSellerEditableLinesAuthority("whatsapp", canonical("csv"))).toBe(false);
    expect(isSellerEditableLinesAuthority("manual", importPendingOrderSourceMetadata())).toBe(false);
  });
});
