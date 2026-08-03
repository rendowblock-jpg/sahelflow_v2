import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { persistWhatsAppInbound } from "@/lib/whatsapp/inbound-ingress";
import { authenticateWhatsAppSidecar } from "@/lib/whatsapp/sidecar-rest-auth";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!authenticateWhatsAppSidecar(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await persistWhatsAppInbound(
    { prisma: db, shop: shopContext },
    await request.json(),
  );

  return NextResponse.json(
    {
      ok: true,
      acknowledged: true,
      ingressEventId: result.ingressEventId,
      status: result.status,
      replayed: result.replayed,
    },
    {
      status: result.replayed ? 200 : 201,
      headers: { "Cache-Control": "no-store" },
    },
  );
}, "POST /api/whatsapp/inbound");
