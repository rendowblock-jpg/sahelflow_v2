import { describe, expect, it } from "vitest";

import {
  assertLegacyOrderFollowupAllowed,
  importPendingOrderSourceMetadata,
  isImportPendingOrderAuthority,
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
});
