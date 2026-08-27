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
  queueWhatsAppImage,
} from "@/lib/whatsapp/durable-send";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const SAFE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const metaSchema = z.object({
  clientMessageId: z.string().uuid(),
  to: z.string().min(1).max(256),
  caption: z.string().max(4000).default(""),
});

/**
 * POST /api/whatsapp/send-image
 *
 * Stages one validated image directly into the shop-scoped encrypted WhatsApp
 * media authority before committing the canonical Message/outbox intent. The
 * browser never supplies an object ID/path and the provider dispatch never
 * depends on a browser File after this request returns.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("conversations.reply");
  assertTrustedAction(actorContext, "customers.contact.read", {
    shopId: actorContext.shop.shopId,
  });

  const form = await req.formData();
  const image = form.get("image");
  if (!(image instanceof File)) {
    throw new SahelFlowError(
      "Choose a JPEG, PNG or WebP image to send",
      "VALIDATION_ERROR",
      400,
    );
  }
  const mediaType = image.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (
    image.size <= 0 ||
    image.size > MAX_IMAGE_BYTES ||
    !SAFE_IMAGE_TYPES.has(mediaType)
  ) {
    throw new SahelFlowError(
      "WhatsApp images must be JPEG, PNG or WebP and no larger than 20 MiB",
      "VALIDATION_ERROR",
      400,
    );
  }

  const input = metaSchema.parse({
    clientMessageId: form.get("clientMessageId"),
    to: form.get("to"),
    caption: form.get("caption") ?? "",
  });
  const context = {
    prisma: db,
    shop: actorContext.shop,
    businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
  };
  const queued = await queueWhatsAppImage(context, {
    ...input,
    fileName: image.name,
    declaredMime: mediaType,
    declaredSize: image.size,
    source: image.stream(),
  });
  const effect = await processWhatsAppEffect(context, queued.effectKey);
  const accepted =
    effect.state === "queued" ||
    effect.state === "processing" ||
    effect.state === "retrying";
  const succeeded = effect.state === "succeeded";
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
    { status: succeeded ? 200 : accepted ? 202 : 409 },
  );
}, "POST /api/whatsapp/send-image");
