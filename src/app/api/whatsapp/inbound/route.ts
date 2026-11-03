import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import {
  asDatabaseBusyError,
  DATABASE_BUSY_RETRY_AFTER_SECONDS,
} from "@/lib/whatsapp/database-busy";
import { persistWhatsAppInbound } from "@/lib/whatsapp/inbound-ingress";
import { parseIngressStatusFilter } from "@/lib/whatsapp/ingress-status-filter";
import { processWhatsAppInbound } from "@/lib/whatsapp/inbound-processor";
import { ingressErrorCode } from "@/lib/whatsapp/ingress-error-code";
import {
  isWhatsAppPhoneOutboundEnvelope,
  persistWhatsAppPhoneOutbound,
} from "@/lib/whatsapp/phone-outbound";
import { authenticateWhatsAppSidecar } from "@/lib/whatsapp/sidecar-rest-auth";

export const dynamic = "force-dynamic";

/** Operator-visible ingress history. Encrypted raw payloads are never returned. */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireTrustedAction("conversations.read");
  assertTrustedAction(actorContext, "customers.contact.read", {
    shopId: actorContext.shop.shopId,
  });
  const requested = Number.parseInt(
    request.nextUrl.searchParams.get("limit") ?? "50",
    10,
  );
  const limit = Number.isFinite(requested)
    ? Math.max(1, Math.min(requested, 200))
    : 50;
  // One state or a comma list: the recovery dock asks for the problem states only.
  const status = parseIngressStatusFilter(request.nextUrl.searchParams.get("status"));

  const events = await db.providerIngressEvent.findMany({
    where: { provider: "whatsapp", ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      sourceId: true,
      providerEventId: true,
      providerTimestamp: true,
      attemptCount: true,
      lastErrorCode: true,
      conversationId: true,
      messageId: true,
      appliedAt: true,
      quarantinedAt: true,
      deadLetteredAt: true,
      createdAt: true,
      updatedAt: true,
      attempts: {
        orderBy: { attemptNumber: "desc" },
        take: 10,
        select: {
          id: true,
          attemptNumber: true,
          state: true,
          errorCode: true,
          startedAt: true,
          completedAt: true,
        },
      },
    },
  });

  return NextResponse.json({ events });
}, "GET /api/whatsapp/inbound");

/**
 * Spool removal is an acknowledgement that the provider event is durable.
 * Applied rows are durable. A chat-delete tombstone is durable only because
 * the row exists with status `chat_deleted`. Quarantine and dead-letter are
 * not: acknowledging them would drop the only copy WhatsApp will not resend.
 */
export function acknowledgeWhatsAppSpoolRemoval(state: string): boolean {
  return state === "applied" || state === "chat_deleted";
}

/**
 * Private sidecar commit-before-acknowledgement boundary.
 *
 * A busy local database (a Prisma timeout, a locked SQLite file) is answered as
 * 503 DATABASE_BUSY with a Retry-After hint instead of the anonymous 500 the
 * generic error wrapper would give it (F-0031). Nothing is acknowledged, so the
 * sidecar keeps the message and tries again. Every other error is left to the
 * wrapper exactly as before.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  try {
    return await receiveSidecarDelivery(request);
  } catch (error) {
    const busy = asDatabaseBusyError(error);
    if (!busy) throw error;
    // The cause stays in the app log as a content-free code (never the message).
    logger.warn("api.POST /api/whatsapp/inbound", {
      code: busy.code,
      statusCode: busy.statusCode,
      cause: ingressErrorCode(error),
    });
    return NextResponse.json(
      {
        ok: false,
        acknowledged: false,
        publish: false,
        error: busy.message,
        code: busy.code,
      },
      {
        status: busy.statusCode,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(DATABASE_BUSY_RETRY_AFTER_SECONDS),
        },
      },
    );
  }
}, "POST /api/whatsapp/inbound");

async function receiveSidecarDelivery(request: NextRequest): Promise<NextResponse> {
  if (!authenticateWhatsAppSidecar(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = { prisma: db, shop: shopContext };
  const raw = await request.json();
  if (isWhatsAppPhoneOutboundEnvelope(raw)) {
    // Phone echoes are outbound rows, never a second inbound. Ack only after
    // that row is durable.
    const stored = await persistWhatsAppPhoneOutbound(context, raw);
    return NextResponse.json(
      {
        ok: true,
        acknowledged: true,
        publish: true,
        ingressEventId: stored.messageId,
        messageId: stored.messageId,
        status: "stored",
        replayed: stored.replayed,
      },
      {
        status: stored.replayed ? 200 : 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const persisted = await persistWhatsAppInbound(context, raw);
  const processed = await processWhatsAppInbound(
    context,
    persisted.ingressEventId,
  );

  if (!acknowledgeWhatsAppSpoolRemoval(processed.state)) {
    return NextResponse.json(
      {
        ok: false,
        acknowledged: false,
        publish: false,
        ingressEventId: persisted.ingressEventId,
        status: processed.state,
        replayed: persisted.replayed,
        code: processed.errorCode ?? "INGRESS_PROCESSING_PENDING",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "5" },
      },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      acknowledged: true,
      publish: processed.publish,
      ingressEventId: persisted.ingressEventId,
      conversationId: processed.conversationId,
      messageId: processed.messageId,
      status: processed.state,
      replayed: persisted.replayed,
      errorCode: processed.errorCode,
    },
    {
      status: persisted.replayed ? 200 : 201,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
