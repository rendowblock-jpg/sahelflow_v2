import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { nativeDeliverySchema } from "@/lib/notifications/contracts";
import { claimNativeDelivery, completeNativeDelivery } from "@/lib/notifications/notification-center";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (request: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireTrustedAction("conversations.read");
  const { id } = await params;
  const input = nativeDeliverySchema.parse(await request.json());
  const result = input.action === "claim"
    ? await claimNativeDelivery(actorContext, id)
    : await completeNativeDelivery(actorContext, id, input.state, input.reasonCode);
  return NextResponse.json(result);
}, "POST /api/notifications/[id]/native");
