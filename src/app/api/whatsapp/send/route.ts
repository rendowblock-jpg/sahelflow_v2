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
  conversationId: z.string().min(8).max(128).optional(),
  quotedMessageId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{6,96}$/)
    .optional(),
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
  // Accept as soon as the command is durable. Waiting here for the sidecar
  // made a connected inbox look broken: the client aborted at 30s, the
  // optimistic bubble failed, and no OutboxIntent was left when the
  // request died before commit. Dispatch continues in this process; the
  // 10s outbox worker is the crash-recovery path.
  void processWhatsAppEffect(context, queued.effectKey).catch(() => {
    // Queued/retrying/ambiguous state remains authoritative.
  });
  return NextResponse.json(
    {
      ok: false,
      accepted: true,
      replayed: queued.replayed,
      id: null,
      messageId: queued.messageId,
      effectKey: queued.effectKey,
      state: "queued",
      attemptCount: 0,
      nextAttemptAt: null,
      errorCode: null,
      requiresDuplicateConfirmation: false,
    },
    { status: 202 },
  );
}, "POST /api/whatsapp/send");
