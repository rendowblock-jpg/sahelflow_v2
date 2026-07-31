import "server-only";

import { SahelFlowError } from "@/types/errors";
import {
  isTrustedActorContext,
  requireTrustedActor,
  type TrustedActor,
  type TrustedActorContext,
} from "./trusted-actor";
import {
  COMPATIBILITY_LOCAL_OWNER_ACTIONS,
  hasPhase2Permission,
  resolvePhase2Permissions,
  type Phase2Action,
} from "./permissions";

export type AuthorizationResource = Readonly<{
  shopId?: string;
}>;

export function trustedActorAuditIdentity(actor: TrustedActor): string {
  switch (actor.kind) {
    case "person":
      return `person:${actor.personId}`;
    case "system":
      return `system:${actor.serviceId}`;
    case "compatibility_local_owner":
      return `compatibility_local_owner:${actor.sessionId}`;
  }
}

function forbidden(action: Phase2Action): SahelFlowError {
  return new SahelFlowError(
    `The current member is not authorized to perform ${action}`,
    "ACTION_FORBIDDEN",
    403,
  );
}

/**
 * Enforce an exact action against a server-minted actor and optional resource.
 * Caller-provided role, permission, member and shop fields never participate in
 * the decision. Durable member custom permissions replace the role preset and
 * have already been validated against that role's ceiling before persistence.
 */
export function assertTrustedAction(
  context: TrustedActorContext,
  action: Phase2Action,
  resource: AuthorizationResource = {},
): void {
  if (!isTrustedActorContext(context)) {
    throw new SahelFlowError(
      "Authorization requires a server-minted trusted actor",
      "TRUSTED_ACTOR_REQUIRED",
      401,
    );
  }

  if (context.actor.kind === "system") {
    throw forbidden(action);
  }

  if (
    resource.shopId !== undefined &&
    resource.shopId !== context.shop.shopId
  ) {
    throw forbidden(action);
  }

  const permissions =
    context.actor.kind === "compatibility_local_owner"
      ? COMPATIBILITY_LOCAL_OWNER_ACTIONS
      : context.actor.permissions ??
        resolvePhase2Permissions(context.actor.role, null);
  if (!hasPhase2Permission(permissions, action)) {
    throw forbidden(action);
  }
}

export async function requireTrustedAction(
  action: Phase2Action,
  resource: AuthorizationResource = {},
): Promise<TrustedActorContext> {
  const context = await requireTrustedActor();
  assertTrustedAction(context, action, resource);
  return context;
}
