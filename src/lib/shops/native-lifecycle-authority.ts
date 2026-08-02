import "server-only";

import { randomBytes } from "node:crypto";

import { assertTrustedAction } from "@/lib/identity/authorization";
import { getIdentityAdministrationSnapshot } from "@/lib/identity/control-authority";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import type { Phase2Action } from "@/lib/identity/permissions";
import { requireLifecycleEntitlementAuthority } from "@/lib/license/lifecycle-authority";
import { SahelFlowError } from "@/types/errors";
import { getRegistry, type Shop } from "./index";
import {
  enqueueNativeShopLifecycleCommand,
  nativeShopLifecycleSessionBinding,
} from "./native-lifecycle-inbox";
import {
  signNativeShopLifecycleAuthorization,
  type NativeShopLifecycleOperation,
  type NativeShopLifecyclePayload,
} from "./native-lifecycle-command";

export type NativeLifecycleTarget = Readonly<{
  id: string;
  incarnationId: string;
}>;

export type EnqueuedNativeLifecycle = Readonly<{
  operationId: string;
  operation: NativeShopLifecycleOperation;
  targetShopId: string | null;
  targetShopIncarnationId: string | null;
}>;

function lifecycleError(
  message: string,
  code: string,
  statusCode: number,
): SahelFlowError {
  return new SahelFlowError(message, code, statusCode);
}

function assertExactActor(
  actorContext: Awaited<ReturnType<typeof requireTrustedActor>>,
  identity: Awaited<ReturnType<typeof getIdentityAdministrationSnapshot>>,
): void {
  if (
    actorContext.actor.kind !== "person" ||
    identity.workspace.id !== actorContext.shop.workspaceId ||
    identity.installation.id !== actorContext.shop.installationId ||
    identity.currentActor.personId !== actorContext.actor.personId ||
    identity.currentActor.workspaceMemberId !==
      actorContext.actor.workspaceMemberId ||
    identity.currentActor.deviceId !== actorContext.actor.deviceId ||
    identity.currentActor.policyVersion !== actorContext.actor.policyVersion ||
    identity.currentActor.revocationEpoch !== actorContext.actor.revocationEpoch ||
    identity.member.id !== actorContext.actor.workspaceMemberId
  ) {
    throw lifecycleError(
      "Durable identity authority changed before shop lifecycle authorization",
      "SHOP_LIFECYCLE_IDENTITY_STALE",
      409,
    );
  }
}

function assertRegistryAuthority(
  registry: ReturnType<typeof getRegistry>,
  current: Awaited<ReturnType<typeof requireTrustedActor>>["shop"],
): void {
  if (
    registry.workspaceId !== current.workspaceId ||
    registry.installationId !== current.installationId ||
    registry.revision !== current.registryRevision ||
    registry.activeShopId !== current.shopId
  ) {
    throw lifecycleError(
      "Shop registry authority changed before native lifecycle authorization",
      "SHOP_AUTHORITY_STALE",
      409,
    );
  }
}

export function registryLifecycleTarget(
  shopId: string,
  shops: readonly Shop[],
): NativeLifecycleTarget {
  const target = shops.find((shop) => shop.id === shopId);
  if (!target) {
    throw lifecycleError("Shop not found", "SHOP_NOT_FOUND", 404);
  }
  return Object.freeze({ id: target.id, incarnationId: target.incarnationId });
}

export async function enqueueAuthorizedNativeLifecycle(input: Readonly<{
  action: Phase2Action;
  operation: NativeShopLifecycleOperation;
  payload: NativeShopLifecyclePayload;
  target: NativeLifecycleTarget | null;
  recentOwnerReauthentication?: boolean;
}>): Promise<EnqueuedNativeLifecycle> {
  const actorContext = await requireTrustedActor();
  assertTrustedAction(actorContext, input.action);
  if (actorContext.actor.kind !== "person") {
    throw lifecycleError(
      "Native shop lifecycle requires durable person, member, device and session authority",
      "DURABLE_IDENTITY_REQUIRED",
      503,
    );
  }

  const current = actorContext.shop;
  const registry = getRegistry();
  assertRegistryAuthority(registry, current);

  const identity = await getIdentityAdministrationSnapshot(
    actorContext.actor.sessionId,
    current,
  );
  assertExactActor(actorContext, identity);

  if (input.target && !identity.member.shopIds.includes(input.target.id)) {
    throw lifecycleError(
      "The current durable member is not authorized for the target shop",
      "SHOP_TARGET_FORBIDDEN",
      403,
    );
  }

  const recentOwnerReauthentication =
    input.recentOwnerReauthentication === true;
  if (input.operation === "delete") {
    if (actorContext.actor.role !== "owner" || !recentOwnerReauthentication) {
      throw lifecycleError(
        "Destructive shop deletion requires owner authority and recent reauthentication",
        "SHOP_DELETE_REAUTHENTICATION_REQUIRED",
        403,
      );
    }
  }

  const entitlement = await requireLifecycleEntitlementAuthority(current);
  const issuedAtUnixMs = Date.now();
  const operationId = randomBytes(16).toString("hex");
  const command = signNativeShopLifecycleAuthorization({
    formatVersion: 1,
    issuedAtUnixMs,
    expiresAtUnixMs: issuedAtUnixMs + 30_000,
    request: {
      formatVersion: 1,
      operationId,
      operation: input.operation,
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
      targetShopId: input.target?.id ?? null,
      targetShopIncarnationId: input.target?.incarnationId ?? null,
      recentOwnerReauthentication,
    },
    payload: input.payload,
  });
  enqueueNativeShopLifecycleCommand(command);

  return Object.freeze({
    operationId,
    operation: input.operation,
    targetShopId: input.target?.id ?? null,
    targetShopIncarnationId: input.target?.incarnationId ?? null,
  });
}
