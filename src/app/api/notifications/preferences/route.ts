import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { notificationPreferenceSchema } from "@/lib/notifications/contracts";
import { getNotificationPreference, updateNotificationPreference } from "@/lib/notifications/notification-center";

export const GET = withErrorHandler(async () => {
  const actorContext = await requireTrustedAction("conversations.read");
  return NextResponse.json({ preference: await getNotificationPreference(actorContext) });
}, "GET /api/notifications/preferences");

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireTrustedAction("conversations.read");
  const input = notificationPreferenceSchema.parse(await request.json());
  return NextResponse.json({ preference: await updateNotificationPreference(actorContext, input) });
}, "PATCH /api/notifications/preferences");
