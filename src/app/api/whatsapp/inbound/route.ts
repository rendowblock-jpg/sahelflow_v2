import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { persistWhatsAppInbound } from "@/lib/whatsapp/inbound-ingress";
import { processWhatsAppInbound } from "@/lib/whatsapp/inbound-processor";
import { authenticateWhatsAppSidecar } from "@/lib/whatsapp/sidecar-rest-auth";

export const dynamic = "force-dynamic";

const ingressStatusSchema = z.enum([
  "received",
  "processing",
  "retrying",
  "applied",
  "quarantined",
  "dead_letter",
]);

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
  const statusParameter = request.nextUrl.searchParams.get("status");
  const status = statusParameter
    ? ingressStatusSchema.parse(statusParameter)
    : undefined;

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

/** Private sidecar commit-before-acknowledgement boundary. */
export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!authenticateWhatsAppSidecar(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = { prisma: db, shop: shopContext };
  const persisted = await persistWhatsAppInbound(context, await request.json());
  const processed = await processWhatsAppInbound(
    context,
    persisted.ingressEventId,
  );

  if (["received", "processing", "retrying"].includes(processed.state)) {
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
}, "POST /api/whatsapp/inbound");
