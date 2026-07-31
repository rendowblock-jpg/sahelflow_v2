import "server-only";

import { getCurrentSessionAuthority } from "@/lib/auth/server";
import { shopContext } from "@/lib/db";
import { ensureDurableIdentityActor } from "./control-authority";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import type { SessionAuthorityResult } from "./session-authority";

export const TRUSTED_ACTOR_CONTEXT_VERSION = 1 as const;

declare const TRUSTED_ACTOR_CONTEXT_TYPE_BRAND: unique symbol;
const trustedActorContexts = new WeakSet<object>();

export type BuiltInRole = "owner" | "manager" | "operator" | "viewer";

/** Historical compatibility shape retained for stored audit/replay contracts. */
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

function createPersonContext(
  sessionId: string,
  shop: ShopContext,
  identity: Awaited<ReturnType<typeof ensureDurableIdentityActor>>,
): TrustedActorContext {
  if (!sessionId || sessionId !== sessionId.trim()) {
    throw new TypeError("A trusted person actor requires an exact session ID");
  }

  const shopSnapshot: ShopContext = Object.freeze({ ...shop });
  const context = Object.freeze({
    version: TRUSTED_ACTOR_CONTEXT_VERSION,
    actor: Object.freeze({
      kind: "person" as const,
      personId: identity.personId,
      workspaceMemberId: identity.workspaceMemberId,
      deviceId: identity.deviceId,
      sessionId,
      role: identity.role,
      policyVersion: identity.policyVersion,
      revocationEpoch: identity.revocationEpoch,
    }),
    shop: shopSnapshot,
  });

  trustedActorContexts.add(context);
  return context as TrustedActorContext;
}

/**
 * Resolve and mint the exact durable trusted actor for a consequential command.
 *
 * Session authority is checked first. The installation-level authenticated
 * identity authority then binds that session to one Person, WorkspaceMember and
 * enrolled Device with exact shop grants and freshness snapshots. Callers cannot
 * mint or substitute any part of the context.
 */
export async function requireTrustedActor(): Promise<TrustedActorContext> {
  const authority = await getCurrentSessionAuthority();
  if (authority.status === "authenticated") {
    const identity = await ensureDurableIdentityActor(
      authority.sessionId,
      shopContext,
    );
    return createPersonContext(authority.sessionId, shopContext, identity);
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
