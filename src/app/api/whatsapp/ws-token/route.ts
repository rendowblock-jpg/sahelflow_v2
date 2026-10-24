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
    // No helper credential yet (nothing linked, or the helper is starting) is a
    // normal state, not a fault. A 200 keeps the browser console quiet on every
    // page; the only caller treats a missing token as "not connected".
    return NextResponse.json(
      { token: null, connected: false },
      { headers: { "Cache-Control": "no-store" } },
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
