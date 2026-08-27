import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { processWhatsAppEffect } from "@/lib/whatsapp/durable-send";
import { queueWhatsAppImage } from "@/lib/whatsapp/outbound-image-queue";
import { sidecar } from "@/lib/whatsapp/sidecar-client";
import { normalizeWhatsAppJid } from "@/lib/whatsapp/types";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_FORM_BYTES = MAX_IMAGE_BYTES + 256 * 1024;
const SAFE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const metaSchema = z.object({
  clientMessageId: z.string().uuid(),
  to: z.string().min(1).max(256),
  caption: z.string().max(4000).default(""),
});

function normalizeRecipient(value: string): string {
  try {
    return normalizeWhatsAppJid(value);
  } catch {
    throw new SahelFlowError(
      "WhatsApp recipient must be a valid Algerian mobile number or known individual chat",
      "VALIDATION_ERROR",
      400,
    );
  }
}

function imageRequestTooLarge(): SahelFlowError {
  return new SahelFlowError(
    "WhatsApp image upload is larger than the accepted request boundary",
    "VALIDATION_ERROR",
    413,
  );
}

function invalidImageMultipart(): SahelFlowError {
  return new SahelFlowError(
    "WhatsApp image multipart body is invalid",
    "VALIDATION_ERROR",
    400,
  );
}

/**
 * Consume multipart bytes through an explicit ceiling before invoking the
 * platform form-data parser. This keeps chunked/no-Content-Length requests from
 * materializing an unbounded body in the contained Next.js process.
 */
async function readBoundedImageForm(req: NextRequest): Promise<FormData> {
  const contentType = req.headers.get("content-type")?.trim() ?? "";
  if (!/^multipart\/form-data(?:;|$)/i.test(contentType)) {
    throw new SahelFlowError(
      "WhatsApp image send requires multipart form data",
      "VALIDATION_ERROR",
      400,
    );
  }
  if (!req.body) {
    throw new SahelFlowError(
      "Choose a JPEG, PNG or WebP image to send",
      "VALIDATION_ERROR",
      400,
    );
  }

  const reader = req.body.getReader();
  const bounded = new Uint8Array(MAX_IMAGE_FORM_BYTES);
  let offset = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (offset + next.value.byteLength > MAX_IMAGE_FORM_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw imageRequestTooLarge();
      }
      bounded.set(next.value, offset);
      offset += next.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return await new Response(bounded.subarray(0, offset), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw invalidImageMultipart();
  }
}

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

  const declaredLength = Number.parseInt(
    req.headers.get("content-length") ?? "0",
    10,
  );
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_IMAGE_FORM_BYTES
  ) {
    throw imageRequestTooLarge();
  }

  // Avoid committing a durable encrypted staging object when the paired account
  // is already unavailable. queueWhatsAppImage revalidates the exact account
  // authority again after staging, so this is only an early reliability gate.
  let providerStatus: Awaited<ReturnType<typeof sidecar.status>>;
  try {
    providerStatus = await sidecar.status();
  } catch {
    throw new SahelFlowError(
      "WhatsApp account identity could not be verified",
      "WHATSAPP_ACCOUNT_UNAVAILABLE",
      503,
    );
  }
  if (providerStatus.status !== "connected" || !providerStatus.user?.id) {
    throw new SahelFlowError(
      "WhatsApp account identity is unavailable",
      "WHATSAPP_ACCOUNT_UNAVAILABLE",
      409,
    );
  }

  const form = await readBoundedImageForm(req);
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
  const jid = normalizeRecipient(input.to);

  // LID sends are allowed only when this exact chat already has durable inbound
  // provenance. Check before staging so a rejected reply cannot leave an
  // unowned encrypted object; the durable queue repeats this check in-transaction.
  if (jid.endsWith("@lid")) {
    const conversation = await db.conversation.findUnique({
      where: {
        channel_sourceId: { channel: "whatsapp", sourceId: jid },
      },
      select: {
        messages: {
          where: { direction: "inbound" },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!conversation || conversation.messages.length === 0) {
      throw new SahelFlowError(
        "WhatsApp LID replies require persisted inbound message provenance",
        "VALIDATION_ERROR",
        400,
      );
    }
  }

  const context = {
    prisma: db,
    shop: actorContext.shop,
    businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
  };
  const queued = await queueWhatsAppImage(context, {
    ...input,
    to: jid,
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
