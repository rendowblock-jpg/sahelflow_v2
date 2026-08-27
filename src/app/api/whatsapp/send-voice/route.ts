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
import { queueWhatsAppVoice } from "@/lib/whatsapp/outbound-voice-queue";
import { sidecar } from "@/lib/whatsapp/sidecar-client";
import { normalizeWhatsAppJid } from "@/lib/whatsapp/types";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

const MAX_VOICE_BYTES = 32 * 1024 * 1024;
const MAX_VOICE_FORM_BYTES = MAX_VOICE_BYTES + 256 * 1024;
// Browser audio declarations that the encrypted storage authority can sniff
// and authenticate from content. audio/opus and audio/x-wav are the common
// browser aliases for OGG/Opus and WAV.
const SAFE_VOICE_TYPES = new Set([
  "audio/ogg",
  "audio/opus",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
]);
const metaSchema = z.object({
  clientMessageId: z.string().uuid(),
  to: z.string().min(1).max(256),
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

function voiceRequestTooLarge(): SahelFlowError {
  return new SahelFlowError(
    "WhatsApp voice upload is larger than the accepted request boundary",
    "VALIDATION_ERROR",
    413,
  );
}

function invalidVoiceMultipart(): SahelFlowError {
  return new SahelFlowError(
    "WhatsApp voice multipart body is invalid",
    "VALIDATION_ERROR",
    400,
  );
}

async function readBoundedVoiceForm(req: NextRequest): Promise<FormData> {
  const contentType = req.headers.get("content-type")?.trim() ?? "";
  if (!/^multipart\/form-data(?:;|$)/i.test(contentType)) {
    throw new SahelFlowError(
      "WhatsApp voice send requires multipart form data",
      "VALIDATION_ERROR",
      400,
    );
  }
  if (!req.body) {
    throw new SahelFlowError(
      "Choose an audio file to send",
      "VALIDATION_ERROR",
      400,
    );
  }

  const reader = req.body.getReader();
  const bounded = new Uint8Array(MAX_VOICE_FORM_BYTES);
  let offset = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (offset + next.value.byteLength > MAX_VOICE_FORM_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw voiceRequestTooLarge();
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
    throw invalidVoiceMultipart();
  }
}

/**
 * Stage one authenticated audio into the shop-scoped encrypted media
 * authority, commit its canonical Message/outbox identity, then dispatch only
 * the staged bytes. The container and its voice-note eligibility are
 * authenticated from the bytes themselves; browser declarations never become
 * authority. WhatsApp audio carries no caption and no file name.
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
    declaredLength > MAX_VOICE_FORM_BYTES
  ) {
    throw voiceRequestTooLarge();
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

  const form = await readBoundedVoiceForm(req);
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    throw new SahelFlowError(
      "Choose an audio file to send",
      "VALIDATION_ERROR",
      400,
    );
  }
  const mediaType = audio.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (
    audio.size <= 0 ||
    audio.size > MAX_VOICE_BYTES ||
    !SAFE_VOICE_TYPES.has(mediaType)
  ) {
    throw new SahelFlowError(
      "WhatsApp audio must be OGG, MP3, M4A, AAC or WAV, no larger than 32 MiB",
      "VALIDATION_ERROR",
      400,
    );
  }

  const input = metaSchema.parse({
    clientMessageId: form.get("clientMessageId"),
    to: form.get("to"),
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
  const queued = await queueWhatsAppVoice(context, {
    ...input,
    to: jid,
    declaredMime: mediaType,
    declaredSize: audio.size,
    source: audio.stream(),
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
}, "POST /api/whatsapp/send-voice");
