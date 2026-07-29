import "server-only";

import { getCurrentSessionAuthority } from "@/lib/auth/server";
import { shopContext } from "@/lib/db";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import type { SessionAuthorityResult } from "./session-authority";

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

function sessionAuthorityError(
  authority: Extract<SessionAuthorityResult, { status: "rejected" }>,
): SahelFlowError {
  if (
    authority.code === "AUTH_SECRET_UNAVAILABLE" ||
    authority.code === "SESSION_AUTHORITY_UNAVAILABLE"
  ) {
    return new SahelFlowError(
      "Authentication authority is temporarily unavailable",
      authority.code,
      503,
    );
  }

  return new SahelFlowError("Unauthorized", "UNAUTHORIZED", 401);
}

function createCompatibilityLocalOwnerContext(
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

/**
 * Resolve and mint the exact trusted actor for a consequential command.
 *
 * This is the only exported minting path. The raw constructor and runtime brand
 * remain private to this module, so callers cannot bypass session revocation or
 * substitute a caller-created ShopContext.
 */
export async function requireTrustedActor(): Promise<TrustedActorContext> {
  const authority = await getCurrentSessionAuthority();
  if (authority.status === "authenticated") {
    return createCompatibilityLocalOwnerContext(authority.sessionId, shopContext);
  }
  if (authority.status === "setup") {
    throw new SahelFlowError(
      "A trusted actor is unavailable before authentication setup completes",
      "TRUSTED_ACTOR_REQUIRED",
      401,
    );
  }
  throw sessionAuthorityError(authority);
}
