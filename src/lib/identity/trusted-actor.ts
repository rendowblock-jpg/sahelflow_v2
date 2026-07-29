import "server-only";

import type { ShopContext } from "@/lib/shops/context";

export const TRUSTED_ACTOR_CONTEXT_VERSION = 1 as const;

const TRUSTED_ACTOR_CONTEXT_BRAND = Symbol("sahelflow.trusted-actor-context.v1");

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
  readonly [TRUSTED_ACTOR_CONTEXT_BRAND]: true;
}>;

export function isTrustedActorContext(value: unknown): value is TrustedActorContext {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [TRUSTED_ACTOR_CONTEXT_BRAND]?: unknown })[
      TRUSTED_ACTOR_CONTEXT_BRAND
    ] === true
  );
}

export function createCompatibilityLocalOwnerContext(
  sessionId: string,
  shop: ShopContext,
): TrustedActorContext {
  if (!sessionId || sessionId !== sessionId.trim()) {
    throw new TypeError("A trusted local owner actor requires an exact session ID");
  }

  const shopSnapshot: ShopContext = Object.freeze({ ...shop });
  const context = {
    version: TRUSTED_ACTOR_CONTEXT_VERSION,
    actor: Object.freeze({
      kind: "compatibility_local_owner" as const,
      role: "owner" as const,
      sessionId,
      compatibilityOnly: true as const,
    }),
    shop: shopSnapshot,
  };

  Object.defineProperty(context, TRUSTED_ACTOR_CONTEXT_BRAND, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return Object.freeze(context) as TrustedActorContext;
}
