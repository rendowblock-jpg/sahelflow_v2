import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { synchronizeNotifications } from "@/lib/notifications/notification-center";

/** Recover PII-free event markers into this actor's durable projection. */
export const POST = withErrorHandler(async () => {
  const actorContext = await requireTrustedAction("conversations.read");
  return NextResponse.json(await synchronizeNotifications(actorContext));
}, "POST /api/notifications/sync");
