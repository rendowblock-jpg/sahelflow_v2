import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { env } from "@/lib/env";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { sidecar } from "@/lib/whatsapp/sidecar-client";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  await requireTrustedAction("whatsapp.connection.manage");
  try {
    const token = sidecar.restToken();
    const response = await fetch(
      `${env.whatsappSidecarUrl ?? "http://localhost:3001"}/qr.png`,
      {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );
    if (!response.ok) {
      return NextResponse.json(
        { error: "No QR available" },
        { status: response.status === 401 ? 503 : 404 },
      );
    }
    return new NextResponse(await response.arrayBuffer(), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "WhatsApp sidecar not reachable" },
      { status: 503 },
    );
  }
}, "GET /api/whatsapp/qr-image");
