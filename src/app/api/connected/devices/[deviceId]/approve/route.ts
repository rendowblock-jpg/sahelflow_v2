import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { DEVICE_ID, connectedOwnerSession, phoneNotFound, relayFailure } from "@/lib/connected-platform/device-admin";
import { readDeviceApprovals, updateDeviceApprovals, withDeviceApproved } from "@/lib/connected-platform/device-approvals";
import { kickConnectedProjectionWorker } from "@/lib/connected-platform/remote-projection-worker";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ deviceId: string }> };

/**
 * POST /api/connected/devices/[deviceId]/approve: "It matches, approve".
 * 200 {alreadyApproved:false}: approved now; 200 {alreadyApproved:true}: it was
 * approved before, nothing changed. 404 PHONE_NOT_FOUND; 409 PHONE_REVOKED.
 */
export const POST = withErrorHandler(async (_request: NextRequest, { params }: RouteContext) => {
  const { actorContext, runtime, workspaceId } = await connectedOwnerSession();
  const deviceId = (await params).deviceId;
  if (!DEVICE_ID.test(deviceId)) throw phoneNotFound();
  let listed: Awaited<ReturnType<typeof runtime.client.listDevices>>;
  try {
    listed = await runtime.client.listDevices(workspaceId);
  } catch (error) {
    throw relayFailure(error);
  }
  const row = listed.devices.find((value) => value.device_id === deviceId);
  if (!row) throw phoneNotFound();
  if (typeof row.revoked_at === "string" && row.revoked_at.length > 0) {
    throw new SahelFlowError("This phone was removed and cannot be approved", "PHONE_REVOKED", 409);
  }
  if ((await readDeviceApprovals(workspaceId)).approved[deviceId] !== undefined) {
    return NextResponse.json({ ok: true, alreadyApproved: true });
  }
  await updateDeviceApprovals(workspaceId, (state) => withDeviceApproved(state, deviceId, Date.now()));
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "connected.device.approve",
      entity: "connected_device",
      entityId: deviceId,
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: { deviceId },
    },
  );
  kickConnectedProjectionWorker();
  return NextResponse.json({ ok: true, alreadyApproved: false });
}, "POST /api/connected/devices/[deviceId]/approve");
