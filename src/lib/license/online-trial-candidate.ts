import "server-only";

import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import {
  validateSignedEntitlement,
  type EntitlementValidationStatus,
  type SignedEntitlement,
} from "./entitlement";
import { licenseVerificationKeyring } from "./license-authority";

export type OnlineTrialCandidateDecision = "accept" | "retry";

const RETRYABLE_CANDIDATE_STATUSES = new Set<EntitlementValidationStatus>([
  "invalid",
  "device_mismatch",
  "installation_mismatch",
  "workspace_mismatch",
  "product_mismatch",
]);

function nativeDeviceBinding(): string {
  const binding = process.env.SF_DEVICE_BINDING;
  if (!binding || !/^sfdb1_[0-9a-f]{64}$/.test(binding)) {
    throw new SahelFlowError(
      "Native device binding is unavailable",
      "LICENSE_DEVICE_BINDING_UNAVAILABLE",
      503,
    );
  }
  return binding;
}

/**
 * Verify route-specific response integrity before the failover loop accepts it.
 *
 * This deliberately checks only properties that can differ because an ingress is
 * stale, corrupted or misconfigured: schema/signature/key availability and the
 * exact workspace/installation/device/product binding. Commercial state such as
 * expiry, revocation, transfer and clock rollback is authoritative and must not
 * be bypassed by trying another route; activateSignedEntitlement re-validates
 * those local/native constraints before any entitlement is persisted.
 */
export async function assessOnlineTrialCandidate(
  entitlement: SignedEntitlement,
  shop: ShopContext,
  now: Date = new Date(),
): Promise<OnlineTrialCandidateDecision> {
  if (
    entitlement.claims.type !== "trial" ||
    entitlement.claims.issuer !== "trial-service"
  ) {
    return "retry";
  }
  const result = await validateSignedEntitlement(
    entitlement,
    {
      workspaceId: shop.workspaceId,
      installationId: shop.installationId,
      deviceBinding: nativeDeviceBinding(),
      appVersion: process.env.APP_VERSION ?? "1.0.0-internal.14",
      minimumRevocationEpoch: 0,
      now,
    },
    licenseVerificationKeyring(),
  );
  return RETRYABLE_CANDIDATE_STATUSES.has(result.status) ? "retry" : "accept";
}
