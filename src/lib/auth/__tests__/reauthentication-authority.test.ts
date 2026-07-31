import { describe, expect, it, vi } from "vitest";

import { SahelFlowError } from "@/types/errors";
import { requireReauthenticationIdentityEligibility } from "../reauthentication-authority";

describe("reauthentication identity eligibility", () => {
  it("accepts current durable identity", async () => {
    const validate = vi.fn(async () => undefined);

    await expect(
      requireReauthenticationIdentityEligibility(validate),
    ).resolves.toBe("current");
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it("accepts only policy-stale identity for PIN recovery", async () => {
    const validate = vi.fn(async () => {
      throw new SahelFlowError(
        "The durable identity binding is stale and must be reauthenticated",
        "IDENTITY_POLICY_STALE",
        403,
      );
    });

    await expect(
      requireReauthenticationIdentityEligibility(validate),
    ).resolves.toBe("policy-stale");
  });

  it.each([
    ["IDENTITY_SESSION_BINDING_REQUIRED", 401],
    ["IDENTITY_SHOP_FORBIDDEN", 403],
    ["IDENTITY_AUTHORITY_UNAVAILABLE", 503],
    ["IDENTITY_AUTHORITY_MISSING", 503],
  ])("rejects %s instead of treating it as stale policy", async (code, statusCode) => {
    const error = new SahelFlowError("blocked", code, statusCode);

    await expect(
      requireReauthenticationIdentityEligibility(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });
});
