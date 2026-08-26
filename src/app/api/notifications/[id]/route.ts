import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { notificationLifecycleSchema } from "@/lib/notifications/contracts";
import { applyNotificationLifecycle } from "@/lib/notifications/notification-center";

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandler(async (request: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireTrustedAction("conversations.read");
  const { id } = await params;
  const input = notificationLifecycleSchema.parse(await request.json());
  const notification = await applyNotificationLifecycle(actorContext, id, input.action);
  return NextResponse.json({ notification: {
    id: notification.id,
    read: notification.readAt !== null,
    archived: notification.archivedAt !== null,
  } });
}, "PATCH /api/notifications/[id]");
