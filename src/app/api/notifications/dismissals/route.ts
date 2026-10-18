import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import {
  dismissOperationalAlerts,
  restoreOperationalAlerts,
} from "@/lib/notifications/operational-dismissals";

const MAX_ITEMS = 100;

const alertIdSchema = z.string().min(1).max(128);

const dismissalSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("dismiss"),
      items: z
        .array(
          z
            .object({
              id: alertIdSchema,
              title: z.string().max(512),
              body: z.string().max(2_048),
            })
            .strict(),
        )
        .min(1)
        .max(MAX_ITEMS),
    })
    .strict(),
  z
    .object({
      action: z.literal("restore"),
      ids: z.array(alertIdSchema).min(1).max(MAX_ITEMS),
    })
    .strict(),
]);

/**
 * Clear (or bring back) computed operational alerts for the signed-in member.
 * Stored per member in the shop database, so a cleared alert stays cleared
 * after SahelFlow is closed and opened again.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireTrustedAction("conversations.read");
  const input = dismissalSchema.parse(await request.json());
  if (input.action === "dismiss") {
    return NextResponse.json(await dismissOperationalAlerts(actorContext, input.items));
  }
  return NextResponse.json(await restoreOperationalAlerts(actorContext, input.ids));
}, "POST /api/notifications/dismissals");
