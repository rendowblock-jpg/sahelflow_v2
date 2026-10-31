import { assertTrustedAction } from "@/lib/identity/authorization";
import type { Phase2Action } from "@/lib/identity/permissions";
import { trustedActorForRemoteCommand, type TrustedActorContext } from "@/lib/identity/trusted-actor";
import { SahelFlowError } from "@/types/errors";
import { COMMAND_PERMISSIONS, type CommandKind, type CommandPermissionRule } from "../contracts";
import type { CommandHandlerInput } from "./types";

/** One permission, asked of the member's own rights; any refusal is one typed code. */
export function assertCommandPermission(
  actorContext: TrustedActorContext,
  permission: string,
  shopId: string,
): void {
  try {
    assertTrustedAction(actorContext, permission as Phase2Action, { shopId });
  } catch {
    throw new SahelFlowError("This member may not do that", "PERMISSION_DENIED", 403);
  }
}

/**
 * Every handler starts here: the member is re-read from the database (never
 * trusted from the envelope), the policy version and the revocation epoch must
 * match what the phone signed, and EVERY permission of the kind is asserted.
 */
export async function authorizeRemoteCommand(
  kind: CommandKind,
  input: CommandHandlerInput,
): Promise<TrustedActorContext> {
  const { context, envelope, device } = input;
  const actorContext = await trustedActorForRemoteCommand(
    envelope.memberId,
    device.deviceId,
    context.shop,
  );
  if (
    actorContext.actor.kind !== "person" ||
    actorContext.actor.policyVersion !== envelope.sequence ||
    actorContext.actor.revocationEpoch !== envelope.revocationEpoch
  ) {
    throw new SahelFlowError("Remote command policy is stale", "REMOTE_POLICY_STALE", 403);
  }
  const rule: CommandPermissionRule = COMMAND_PERMISSIONS[kind];
  for (const permission of rule.all) {
    assertCommandPermission(actorContext, permission, context.shop.shopId);
  }
  if (rule.anyOf.length > 0) {
    const allowed = rule.anyOf.some((permission) => {
      try {
        assertCommandPermission(actorContext, permission, context.shop.shopId);
        return true;
      } catch {
        return false;
      }
    });
    if (!allowed) throw new SahelFlowError("This member may not do that", "PERMISSION_DENIED", 403);
  }
  return actorContext;
}
