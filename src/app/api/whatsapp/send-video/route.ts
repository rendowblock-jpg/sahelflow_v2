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
import { queueWhatsAppVideo } from "@/lib/whatsapp/outbound-video-queue";
import { sidecar } from "@/lib/whatsapp/sidecar-client";
import { normalizeWhatsAppJid } from "@/lib/whatsapp/types";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
const MAX_VIDEO_FORM_BYTES = MAX_VIDEO_BYTES + 256 * 1024;
const metaSchema = z.object({
  clientMessageId: z.string().uuid(),
  to: z.string().min(1).max(256),
  caption: z.string().max(4000).default(""),
  quotedMessageId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{6,96}$/)
    .optional(),
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

function videoRequestTooLarge(): SahelFlowError {
  return new SahelFlowError(
    "WhatsApp video upload is larger than the accepted request boundary",
    "VALIDATION_ERROR",
    413,
  );
}

function invalidVideoMultipart(): SahelFlowError {
  return new SahelFlowError(
    "WhatsApp video multipart body is invalid",
    "VALIDATION_ERROR",
    400,
  );
}

async function readBoundedVideoForm(req: NextRequest): Promise<FormData> {
  const contentType = req.headers.get("content-type")?.trim() ?? "";
  if (!/^multipart\/form-data(?:;|$)/i.test(contentType)) {
    throw new SahelFlowError(
      "WhatsApp video send requires multipart form data",
      "VALIDATION_ERROR",
      400,
    );
  }
  if (!req.body) {
    throw new SahelFlowError(
      "Choose an MP4 video to send",
      "VALIDATION_ERROR",
      400,
    );
  }

  const reader = req.body.getReader();
  const bounded = new Uint8Array(MAX_VIDEO_FORM_BYTES);
  let offset = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (offset + next.value.byteLength > MAX_VIDEO_FORM_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw videoRequestTooLarge();
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
    throw invalidVideoMultipart();
  }
}

/**
 * Stage one authenticated MP4 into the shop-scoped encrypted media authority,
 * commit its canonical Message/outbox identity, then dispatch only the staged
 * bytes. Browser files, paths and object identifiers never become authority.
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
    declaredLength > MAX_VIDEO_FORM_BYTES
  ) {
    throw videoRequestTooLarge();
  }

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

  const form = await readBoundedVideoForm(req);
  const video = form.get("video");
  if (!(video instanceof File)) {
    throw new SahelFlowError(
      "Choose an MP4 video to send",
      "VALIDATION_ERROR",
      400,
    );
  }
  const mediaType = video.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (
    video.size <= 0 ||
    video.size > MAX_VIDEO_BYTES ||
    mediaType !== "video/mp4"
  ) {
    throw new SahelFlowError(
      "WhatsApp videos must be MP4, no larger than 64 MiB, with a verified duration",
      "VALIDATION_ERROR",
      400,
    );
  }

  const input = metaSchema.parse({
    clientMessageId: form.get("clientMessageId"),
    to: form.get("to"),
    caption: form.get("caption") ?? "",
    quotedMessageId: form.get("quotedMessageId") || undefined,
  });
  const jid = normalizeRecipient(input.to);

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
  const queued = await queueWhatsAppVideo(context, {
    ...input,
    to: jid,
    fileName: video.name,
    declaredMime: mediaType,
    declaredSize: video.size,
    source: video.stream(),
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
}, "POST /api/whatsapp/send-video");
