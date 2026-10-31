import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { discardHeldWhatsAppSend } from "@/lib/whatsapp/durable-send";
import { HELD_SEND_OWNER_ONLY_CODE, isOwnerActor } from "@/lib/whatsapp/held-send";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const effectKeySchema = z.string().min(1).max(200);

/**
 * POST /api/whatsapp/outbox/[id]/discard-held ([id] is the effect key)
 *
 * The shop owner throws away a send the guard held: it will never be sent to
 * this chat. 200 {ok, alreadyDiscarded}: discarded now, or before (nothing
 * changed). 409: the send is not on hold, or it was already released. 403
 * HELD_SEND_OWNER_ONLY: a team member or an automation. This route never
 * starts a send.
 */
export const POST = withErrorHandler(async (_request: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireTrustedAction("conversations.reply");
  if (!isOwnerActor(actorContext.actor)) {
    throw new SahelFlowError(
      "Only the shop owner can discard a held WhatsApp send",
      HELD_SEND_OWNER_ONLY_CODE,
      403,
    );
  }
  const effectKey = effectKeySchema.parse((await params).id);
  const context = {
    prisma: db,
    shop: actorContext.shop,
    businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
  };
  const { effect, alreadyDiscarded } = await discardHeldWhatsAppSend(context, effectKey);
  return NextResponse.json({ ok: true, alreadyDiscarded, effect }, { status: 200 });
}, "POST /api/whatsapp/outbox/[id]/discard-held");
