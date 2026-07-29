import type { ShopContext } from "@/lib/shops/context";

export const TRUSTED_ACTOR_CONTEXT_VERSION = 1 as const;

export type BuiltInRole = "owner" | "manager" | "operator" | "viewer";

/**
 * Compatibility representation of today's PIN-unlocked single-owner baseline.
 *
 * This is intentionally not a `person` actor. A PIN proves local unlock only;
 * durable Person, WorkspaceMember, Device and policy identity will come from the
 * protected local control cache in later Phase 2 packages.
 */
export type CompatibilityLocalOwnerActor = Readonly<{
  kind: "compatibility_local_owner";
  role: "owner";
  sessionId: string;
  compatibilityOnly: true;
}>;

export type PersonActor = Readonly<{
  kind: "person";
  personId: string;
  workspaceMemberId: string;
  deviceId: string;
  sessionId: string;
  role: BuiltInRole;
  policyVersion: number;
  revocationEpoch: number;
}>;

export type SystemActor = Readonly<{
  kind: "system";
  serviceId: string;
  grantId: string;
  policyVersion: number;
  revocationEpoch: number;
}>;

export type TrustedActor =
  | CompatibilityLocalOwnerActor
  | PersonActor
  | SystemActor;

export type TrustedActorContext = Readonly<{
  version: typeof TRUSTED_ACTOR_CONTEXT_VERSION;
  actor: TrustedActor;
  shop: ShopContext;
}>;

export function createCompatibilityLocalOwnerContext(
  sessionId: string,
  shop: ShopContext,
): TrustedActorContext {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new TypeError("A trusted local owner actor requires an exact session ID");
  }

  return Object.freeze({
    version: TRUSTED_ACTOR_CONTEXT_VERSION,
    actor: Object.freeze({
      kind: "compatibility_local_owner",
      role: "owner",
      sessionId: normalizedSessionId,
      compatibilityOnly: true,
    }),
    shop,
  });
}
