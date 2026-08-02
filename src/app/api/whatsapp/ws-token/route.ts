import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { sidecar } from "@/lib/whatsapp/sidecar-client";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  const actor = await requireTrustedAction("conversations.read");
  assertTrustedAction(actor, "customers.contact.read", {
    shopId: actor.shop.shopId,
  });
  const principal = businessPrincipalFromTrustedActor(actor);
  const grant = sidecar.wsGrantBundle(principal.subjectId);
  if (!grant) {
    return NextResponse.json(
      { error: "Sidecar WebSocket grant unavailable", token: null },
      { status: 503 },
    );
  }
  const sidecarUrl =
    process.env.WHATSAPP_SIDECAR_URL ?? "http://127.0.0.1:3001";
  const wsUrl = `${sidecarUrl.replace(/^http/, "ws")}/ws`;
  return NextResponse.json(
    { token: grant.token, expiresAt: grant.expiresAt, wsUrl },
    { headers: { "Cache-Control": "no-store" } },
  );
}, "GET /api/whatsapp/ws-token");
