import "server-only";

import { SahelFlowError } from "@/types/errors";

export type ReauthenticationIdentityState = "current" | "policy-stale";

/**
 * A database-authenticated session may enter the PIN reauthentication ceremony
 * when its durable identity is current or when policy freshness alone is stale.
 * Missing, revoked, cross-shop, malformed and unavailable authority remains
 * ineligible and propagates unchanged.
 */
export async function requireReauthenticationIdentityEligibility(
  validateIdentity: () => Promise<void>,
): Promise<ReauthenticationIdentityState> {
  try {
    await validateIdentity();
    return "current";
  } catch (error) {
    if (
      error instanceof SahelFlowError &&
      error.code === "IDENTITY_POLICY_STALE"
    ) {
      return "policy-stale";
    }
    throw error;
  }
}
