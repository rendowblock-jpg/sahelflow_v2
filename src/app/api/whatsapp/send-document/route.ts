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
import { queueWhatsAppDocument } from "@/lib/whatsapp/outbound-document-queue";
import { sidecar } from "@/lib/whatsapp/sidecar-client";
import { normalizeWhatsAppJid } from "@/lib/whatsapp/types";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
const MAX_DOCUMENT_FORM_BYTES = MAX_DOCUMENT_BYTES + 256 * 1024;
const SAFE_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/csv",
]);
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

function documentRequestTooLarge(): SahelFlowError {
  return new SahelFlowError(
    "WhatsApp document upload is larger than the accepted request boundary",
    "VALIDATION_ERROR",
    413,
  );
}

function invalidDocumentMultipart(): SahelFlowError {
  return new SahelFlowError(
    "WhatsApp document multipart body is invalid",
    "VALIDATION_ERROR",
    400,
  );
}

async function readBoundedDocumentForm(req: NextRequest): Promise<FormData> {
  const contentType = req.headers.get("content-type")?.trim() ?? "";
  if (!/^multipart\/form-data(?:;|$)/i.test(contentType)) {
    throw new SahelFlowError(
      "WhatsApp document send requires multipart form data",
      "VALIDATION_ERROR",
      400,
    );
  }
  if (!req.body) {
    throw new SahelFlowError(
      "Choose a document to send",
      "VALIDATION_ERROR",
      400,
    );
  }

  const reader = req.body.getReader();
  const bounded = new Uint8Array(MAX_DOCUMENT_FORM_BYTES);
  let offset = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (offset + next.value.byteLength > MAX_DOCUMENT_FORM_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw documentRequestTooLarge();
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
    throw invalidDocumentMultipart();
  }
}

/**
 * Stage one authenticated document into the shop-scoped encrypted media
 * authority, commit its canonical Message/outbox identity, then dispatch only
 * the staged bytes. Browser files, paths and object identifiers never become
 * authority; the encrypted storage layer classifies the bytes itself.
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
    declaredLength > MAX_DOCUMENT_FORM_BYTES
  ) {
    throw documentRequestTooLarge();
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

  const form = await readBoundedDocumentForm(req);
  const document = form.get("document");
  if (!(document instanceof File)) {
    throw new SahelFlowError(
      "Choose a document to send",
      "VALIDATION_ERROR",
      400,
    );
  }
  const mediaType = document.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (
    document.size <= 0 ||
    document.size > MAX_DOCUMENT_BYTES ||
    !SAFE_DOCUMENT_TYPES.has(mediaType)
  ) {
    throw new SahelFlowError(
      "WhatsApp documents must be PDF, Word, Excel, plain text or CSV, no larger than 64 MiB",
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
  const queued = await queueWhatsAppDocument(context, {
    ...input,
    to: jid,
    fileName: document.name,
    declaredMime: mediaType,
    declaredSize: document.size,
    source: document.stream(),
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
}, "POST /api/whatsapp/send-document");
