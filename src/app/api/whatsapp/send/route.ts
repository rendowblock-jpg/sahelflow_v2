import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import {
  processWhatsAppEffect,
  queueWhatsAppText,
} from "@/lib/whatsapp/durable-send";

export const dynamic = "force-dynamic";

const sendSchema = z.object({
  clientMessageId: z.string().uuid(),
  to: z.string().min(1).max(256),
  text: z.string().trim().min(1).max(4000),
});

/**
 * POST /api/whatsapp/send
 *
 * Commits the encrypted message and exact outbox intent before attempting the
 * sidecar effect. A 202 response means the send is durably queued/retrying,
 * not that WhatsApp accepted it. Ambiguous results fail closed for operator
 * reconciliation instead of being repeated automatically.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("conversations.reply");
  assertTrustedAction(actorContext, "customers.contact.read", {
    shopId: actorContext.shop.shopId,
  });
  const input = sendSchema.parse(await req.json());
  const context = {
    prisma: db,
    shop: actorContext.shop,
    businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
  };
  const queued = await queueWhatsAppText(context, input);
  const effect = await processWhatsAppEffect(context, queued.effectKey);
  const accepted = effect.state === "queued" || effect.state === "processing" || effect.state === "retrying";
  const succeeded = effect.state === "succeeded";
  const status = succeeded ? 200 : accepted ? 202 : 409;
  return NextResponse.json(
    {
      ok: succeeded,
      accepted: succeeded || accepted,
      replayed: queued.replayed,
      id: effect.providerMessageId,
      messageId: queued.messageId,
      effectKey: queued.effectKey,
      state: effect.state,
      attemptCount: effect.attemptCount,
      nextAttemptAt: effect.nextAttemptAt,
      errorCode: effect.errorCode,
      requiresDuplicateConfirmation: effect.requiresDuplicateConfirmation,
    },
    { status },
  );
}, "POST /api/whatsapp/send");
