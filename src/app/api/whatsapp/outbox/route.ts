import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";
import {
  findWhatsAppEffectByMessageId,
  getWhatsAppEffectStatus,
  retryWhatsAppEffect,
} from "@/lib/whatsapp/durable-send";

export const dynamic = "force-dynamic";

const effectKeySchema = z.string().min(1).max(200);
const messageIdSchema = z.string().uuid();
const retrySchema = z.object({
  effectKey: effectKeySchema,
  confirmMayDuplicate: z.boolean().optional().default(false),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireTrustedAction("conversations.read");
  const context = { prisma: db, shop: actorContext.shop };
  const rawEffectKey = request.nextUrl.searchParams.get("effectKey");
  const rawMessageId = request.nextUrl.searchParams.get("messageId");
  const effect = rawEffectKey
    ? await getWhatsAppEffectStatus(context, effectKeySchema.parse(rawEffectKey))
    : await findWhatsAppEffectByMessageId(
        context,
        messageIdSchema.parse(rawMessageId),
      );
  return NextResponse.json({ ok: true, effect });
}, "GET /api/whatsapp/outbox");

export const POST = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireTrustedAction("conversations.reply");
  const input = retrySchema.parse(await request.json());
  const effect = await retryWhatsAppEffect(
    {
      prisma: db,
      shop: actorContext.shop,
      businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
    },
    input.effectKey,
    input.confirmMayDuplicate,
  );

  // An operator retry can itself produce an ambiguous provider outcome. Return
  // 202 so the inbox enters its durable-status monitor and refreshes the bubble
  // to `ambiguous`, rather than leaving the stale pre-retry dead-letter state.
  const monitorDurableState =
    effect.state === "retrying" ||
    effect.state === "queued" ||
    effect.state === "ambiguous";
  return NextResponse.json(
    { ok: effect.state === "succeeded", effect },
    {
      status: effect.state === "succeeded" ? 200 : monitorDurableState ? 202 : 409,
    },
  );
}, "POST /api/whatsapp/outbox");
