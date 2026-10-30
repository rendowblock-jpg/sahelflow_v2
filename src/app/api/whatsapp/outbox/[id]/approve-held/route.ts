import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { approveHeldWhatsAppSend, processWhatsAppEffect } from "@/lib/whatsapp/durable-send";
import { HELD_SEND_OWNER_ONLY_CODE, isOwnerActor } from "@/lib/whatsapp/held-send";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const effectKeySchema = z.string().min(1).max(200);

/**
 * POST /api/whatsapp/outbox/[id]/approve-held ([id] is the effect key)
 *
 * The shop owner releases a send the guard held. 202: released now and the
 * attempt starts in the background (the inbox monitors it). 200: it was
 * released before, nothing changed and nothing is sent again. 409: the send is
 * not on hold. 403 HELD_SEND_OWNER_ONLY: a team member or an automation.
 */
export const POST = withErrorHandler(async (_request: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireTrustedAction("conversations.reply");
  if (!isOwnerActor(actorContext.actor)) {
    throw new SahelFlowError(
      "Only the shop owner can release a held WhatsApp send",
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
  const { effect, alreadyApproved } = await approveHeldWhatsAppSend(context, effectKey);
  if (alreadyApproved) {
    return NextResponse.json({ ok: true, alreadyApproved: true, effect }, { status: 200 });
  }
  // Same as the send routes: answer once the release is durable; the 10 s
  // outbox worker is the crash-recovery path.
  void processWhatsAppEffect(context, effectKey).catch(() => {
    // The queued/retrying/ambiguous state stays authoritative.
  });
  return NextResponse.json({ ok: true, alreadyApproved: false, effect }, { status: 202 });
}, "POST /api/whatsapp/outbox/[id]/approve-held");
