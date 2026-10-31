import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { ConnectedPlatformHttpError } from "@/lib/connected-platform/client";
import { DEVICE_ID, connectedOwnerSession, phoneNotFound, relayFailure } from "@/lib/connected-platform/device-admin";
import { updateDeviceApprovals, withoutDevice } from "@/lib/connected-platform/device-approvals";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ deviceId: string }> };

/**
 * POST /api/connected/devices/[deviceId]/revoke: "Remove this phone".
 * The local approval is wiped FIRST, so this desktop stops publishing to the
 * phone at once even if the relay cannot be reached; then the relay revokes.
 * 200 {alreadyRevoked:true} when the relay no longer lists the phone (repeat).
 * 404 PHONE_NOT_FOUND (bad id); 409 PHONE_REVOKE_CONFLICT (relay race, retry).
 */
export const POST = withErrorHandler(async (_request: NextRequest, { params }: RouteContext) => {
  const { actorContext, runtime, workspaceId } = await connectedOwnerSession();
  const deviceId = (await params).deviceId;
  if (!DEVICE_ID.test(deviceId)) throw phoneNotFound();
  await updateDeviceApprovals(workspaceId, (state) => withoutDevice(state, deviceId));
  let alreadyRevoked = false;
  try {
    const listed = await runtime.client.listDevices(workspaceId);
    const row = listed.devices.find((value) => value.device_id === deviceId);
    const epoch = typeof row?.revocation_epoch === "number" ? row.revocation_epoch : null;
    if (!row || epoch === null) {
      alreadyRevoked = true;
    } else {
      await runtime.client.revokeDevice(deviceId, { workspaceId, revocationEpoch: epoch + 1 });
    }
  } catch (error) {
    if (error instanceof ConnectedPlatformHttpError && error.status === 404) {
      alreadyRevoked = true;
    } else if (error instanceof ConnectedPlatformHttpError && error.status === 409 && error.code === "revocation_epoch_conflict") {
      throw new SahelFlowError("The phone list changed while removing; try again", "PHONE_REVOKE_CONFLICT", 409);
    } else {
      throw relayFailure(error);
    }
  }
  if (!alreadyRevoked) {
    await logAudit(
      { prisma: db, shop: shopContext },
      {
        action: "connected.device.revoke",
        entity: "connected_device",
        entityId: deviceId,
        actor: trustedActorAuditIdentity(actorContext.actor),
        after: { deviceId },
      },
    );
  }
  return NextResponse.json({ ok: true, alreadyRevoked });
}, "POST /api/connected/devices/[deviceId]/revoke");
