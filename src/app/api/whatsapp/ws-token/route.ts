import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import { sidecar } from "@/lib/whatsapp/sidecar-client";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  const actor = await requireTrustedActor();
  const principal = businessPrincipalFromTrustedActor(actor);
  const token = sidecar.wsGrant(principal.subjectId);
  if (!token) {
    return NextResponse.json(
      { error: "Sidecar WebSocket grant unavailable", token: null },
      { status: 503 },
    );
  }
  const sidecarUrl =
    process.env.WHATSAPP_SIDECAR_URL ?? "http://127.0.0.1:3001";
  const wsUrl = `${sidecarUrl.replace(/^http/, "ws")}/ws`;
  return NextResponse.json(
    { token, wsUrl },
    { headers: { "Cache-Control": "no-store" } },
  );
}, "GET /api/whatsapp/ws-token");
