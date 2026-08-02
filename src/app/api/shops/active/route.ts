import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { assertTrustedAction } from "@/lib/identity/authorization";
import { getIdentityAdministrationSnapshot } from "@/lib/identity/control-authority";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import { requireLifecycleEntitlementAuthority } from "@/lib/license/lifecycle-authority";
import { getRegistry, setActiveShopId } from "@/lib/shops";
import {
  enqueueNativeShopLifecycleCommand,
  nativeShopLifecycleSessionBinding,
} from "@/lib/shops/native-lifecycle-inbox";
import { signNativeShopLifecycleCommand } from "@/lib/shops/native-lifecycle-command";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

const setActiveSchema = z
  .object({
    shopId: z.string().trim().min(1).max(200),
  })
  .strict();

function forbiddenTarget(): SahelFlowError {
  return new SahelFlowError(
    "The current durable member is not authorized for the target shop",
    "SHOP_TARGET_FORBIDDEN",
    403,
  );
}

/**
 * PUT /api/shops/active — authorize and enqueue an exact native switch.
 * Body: { shopId: string }
 */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedActor();
  const input = setActiveSchema.parse(await req.json());
  assertTrustedAction(actorContext, "shops.switch");

  if (actorContext.actor.kind === "compatibility_local_owner") {
    if (process.env.NODE_ENV === "production") {
      throw new SahelFlowError(
        "Native shop switching requires durable identity authority",
        "DURABLE_IDENTITY_REQUIRED",
        503,
      );
    }
    setActiveShopId(input.shopId);
    return NextResponse.json({
      status: "completed",
      targetShopId: input.shopId,
      developmentFallback: true,
    });
  }
  if (actorContext.actor.kind !== "person") {
    throw forbiddenTarget();
  }

  const current = actorContext.shop;
  const registry = getRegistry();
  if (
    registry.workspaceId !== current.workspaceId ||
    registry.installationId !== current.installationId ||
    registry.revision !== current.registryRevision ||
    registry.activeShopId !== current.shopId
  ) {
    throw new SahelFlowError(
      "Shop registry authority changed before native switch authorization",
      "SHOP_AUTHORITY_STALE",
      409,
    );
  }

  const target = registry.shops.find((shop) => shop.id === input.shopId);
  if (!target) {
    throw new SahelFlowError("Shop not found", "SHOP_NOT_FOUND", 404);
  }
  if (target.id === current.shopId) {
    return NextResponse.json({
      status: "completed",
      targetShopId: target.id,
      targetShopIncarnationId: target.incarnationId,
    });
  }

  const identity = await getIdentityAdministrationSnapshot(
    actorContext.actor.sessionId,
    current,
  );
  if (
    identity.workspace.id !== current.workspaceId ||
    identity.installation.id !== current.installationId ||
    identity.currentActor.personId !== actorContext.actor.personId ||
    identity.currentActor.workspaceMemberId !==
      actorContext.actor.workspaceMemberId ||
    identity.currentActor.deviceId !== actorContext.actor.deviceId ||
    identity.currentActor.policyVersion !== actorContext.actor.policyVersion ||
    identity.currentActor.revocationEpoch !== actorContext.actor.revocationEpoch ||
    identity.member.id !== actorContext.actor.workspaceMemberId ||
    !identity.member.shopIds.includes(target.id)
  ) {
    throw forbiddenTarget();
  }

  const entitlement = await requireLifecycleEntitlementAuthority(current);
  const issuedAtUnixMs = Date.now();
  const operationId = randomBytes(16).toString("hex");
  const command = signNativeShopLifecycleCommand({
    authorization: {
      formatVersion: 1,
      issuedAtUnixMs,
      expiresAtUnixMs: issuedAtUnixMs + 30_000,
      request: {
        formatVersion: 1,
        operationId,
        operation: "switch",
        expectedRegistryRevision: registry.revision,
        workspaceId: current.workspaceId,
        installationId: current.installationId,
        actorPersonId: actorContext.actor.personId,
        actorMemberId: actorContext.actor.workspaceMemberId,
        actorDeviceId: actorContext.actor.deviceId,
        actorSessionBinding: nativeShopLifecycleSessionBinding(
          actorContext.actor.sessionId,
        ),
        policyVersion: actorContext.actor.policyVersion,
        revocationEpoch: actorContext.actor.revocationEpoch,
        entitlementId: entitlement.entitlementId,
        entitlementRevision: entitlement.entitlementRevision,
        shopSlots: entitlement.shopSlots,
        migrationSetSha256: current.migrationSetSha256,
        currentShopId: current.shopId,
        currentShopIncarnationId: current.shopIncarnationId,
        targetShopId: target.id,
        targetShopIncarnationId: target.incarnationId,
        recentOwnerReauthentication: false,
      },
      payload: { operation: "switch" },
    },
  });
  enqueueNativeShopLifecycleCommand(command);

  return NextResponse.json(
    {
      status: "pending",
      operationId,
      targetShopId: target.id,
      targetShopIncarnationId: target.incarnationId,
    },
    { status: 202 },
  );
}, "PUT /api/shops/active");
