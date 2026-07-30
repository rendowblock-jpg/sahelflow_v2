import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import { sidecar } from "@/lib/whatsapp/sidecar-client";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  await requireTrustedActor();
  const token = sidecar.wsToken();
  if (!token) {
    return NextResponse.json(
      { error: "Sidecar WebSocket token unavailable", token: null },
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