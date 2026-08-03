import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { persistWhatsAppInbound } from "@/lib/whatsapp/inbound-ingress";
import { processWhatsAppInbound } from "@/lib/whatsapp/inbound-processor";
import { authenticateWhatsAppSidecar } from "@/lib/whatsapp/sidecar-rest-auth";

export const dynamic = "force-dynamic";

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
