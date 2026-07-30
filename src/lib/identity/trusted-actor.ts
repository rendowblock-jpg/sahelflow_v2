import "server-only";

import { getCurrentSessionAuthority } from "@/lib/auth/server";
import { shopContext } from "@/lib/db";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import type { SessionAuthorityResult } from "./session-authority";

export const TRUSTED_ACTOR_CONTEXT_VERSION = 1 as const;

declare const TRUSTED_ACTOR_CONTEXT_TYPE_BRAND: unique symbol;
const trustedActorContexts = new WeakSet<object>();

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
  readonly [TRUSTED_ACTOR_CONTEXT_TYPE_BRAND]: true;
}>;

export function isTrustedActorContext(value: unknown): value is TrustedActorContext {
  return typeof value === "object" && value !== null && trustedActorContexts.has(value);
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
  const context = Object.freeze({
    version: TRUSTED_ACTOR_CONTEXT_VERSION,
    actor: Object.freeze({
      kind: "compatibility_local_owner" as const,
      role: "owner" as const,
      sessionId,
      compatibilityOnly: true as const,
    }),
    shop: shopSnapshot,
  });

  trustedActorContexts.add(context);
  return context as TrustedActorContext;
}

/**
 * Resolve and mint the exact trusted actor for a consequential command.
 *
 * This is the only exported minting path. The raw constructor, compile-time
 * nominal brand and runtime membership set remain private to this module, so
 * callers cannot bypass session revocation or substitute a caller-created
 * Session ID or ShopContext.
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
