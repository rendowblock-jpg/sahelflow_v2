import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db, shopContext } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { retryWhatsAppInbound } from "@/lib/whatsapp/inbound-recovery";

export const dynamic = "force-dynamic";

const recoverySchema = z.object({
  ingressEventId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireTrustedAction("conversations.update");
  assertTrustedAction(actorContext, "customers.contact.read", {
    shopId: actorContext.shop.shopId,
  });
  const input = recoverySchema.parse(await request.json());
  const result = await retryWhatsAppInbound(
    { prisma: db, shop: shopContext },
    {
      ingressEventId: input.ingressEventId,
      reason: input.reason,
      auditActor: businessPrincipalFromTrustedActor(actorContext).auditActor,
    },
  );

  return NextResponse.json({ result });
}, "POST /api/whatsapp/inbound/recovery");
