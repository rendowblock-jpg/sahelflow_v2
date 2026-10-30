import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { mergeDevices } from "@/lib/connected-platform/desktop-devices";
import { connectedOwnerSession, relayFailure } from "@/lib/connected-platform/device-admin";
import { readDeviceApprovals } from "@/lib/connected-platform/device-approvals";

export const dynamic = "force-dynamic";

/** GET /api/connected/devices: the relay's phones merged with this desktop's approvals. */
export const GET = withErrorHandler(async () => {
  const { runtime, workspaceId } = await connectedOwnerSession();
  let listed: Awaited<ReturnType<typeof runtime.client.listDevices>>;
  try {
    listed = await runtime.client.listDevices(workspaceId);
  } catch (error) {
    throw relayFailure(error);
  }
  const local = await readDeviceApprovals(workspaceId);
  return NextResponse.json({ devices: await mergeDevices(listed.devices, local) }, { headers: { "Cache-Control": "no-store" } });
}, "GET /api/connected/devices");
