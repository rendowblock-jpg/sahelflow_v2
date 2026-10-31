/**
 * Shared guard and mappings for the owner-only phone routes under
 * /api/connected/devices. Order matters: sign-in and permission first, then
 * "owner", then the licence, then "is this shop enrolled".
 */
import "server-only";

import { db, shopContext } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { requireLicenseEntitlement } from "@/lib/license/license-authority";
import { SahelFlowError } from "@/types/errors";

import { ConnectedPlatformHttpError } from "./client";
import { pairingRefusalFromRelay } from "./desktop-devices";
import { loadConnectedRuntimeIfEnrolled } from "./runtime";

export const DEVICE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

// Same rule as isOwnerActor in whatsapp/held-send.ts, kept here so the phone
// routes do not depend on the WhatsApp module.
function isOwner(actor: { kind: string; role?: string }): boolean {
  return (actor.kind === "compatibility_local_owner" || actor.kind === "person") && actor.role === "owner";
}

export async function connectedOwnerSession() {
  const actorContext = await requireTrustedAction("settings.manage");
  if (!isOwner(actorContext.actor)) {
    throw new SahelFlowError("Only the shop owner can manage paired phones", "PHONE_OWNER_ONLY", 403);
  }
  await requireLicenseEntitlement("sahelflow.connected", shopContext);
  const runtime = await loadConnectedRuntimeIfEnrolled({ prisma: db, shop: shopContext });
  if (!runtime) {
    throw new SahelFlowError("This shop is not connected yet", "CONNECTED_NOT_ENROLLED", 409);
  }
  return { actorContext, runtime, workspaceId: shopContext.workspaceId };
}

/** The relay's answer as a typed, human error; anything unknown is rethrown as is. */
export function relayFailure(error: unknown): unknown {
  if (error instanceof ConnectedPlatformHttpError) {
    const refusal = pairingRefusalFromRelay(error.status, error.code);
    if (refusal) return new SahelFlowError(refusal.message, refusal.code, refusal.status);
  }
  return error;
}

export function phoneNotFound(): SahelFlowError {
  return new SahelFlowError("This phone is not paired (any more)", "PHONE_NOT_FOUND", 404);
}

/** The signed-in person's member id, which the relay needs to attach the phone to. */
export function ownerMemberId(actor: object): string {
  const id = (actor as { workspaceMemberId?: unknown }).workspaceMemberId;
  if (typeof id !== "string" || id.length === 0) {
    throw new SahelFlowError("Sign in with your own account to pair a phone", "PHONE_OWNER_MEMBER_REQUIRED", 409);
  }
  return id;
}
