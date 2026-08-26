import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { readAllNotifications } from "@/lib/notifications/notification-center";

export const POST = withErrorHandler(async () => {
  const actorContext = await requireTrustedAction("conversations.read");
  return NextResponse.json(await readAllNotifications(actorContext));
}, "POST /api/notifications/read-all");
