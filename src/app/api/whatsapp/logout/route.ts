import { NextResponse } from "next/server";
import { sidecar, SidecarUnavailableError } from "@/lib/whatsapp/sidecar-client";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

/** DELETE /api/whatsapp/logout — clear auth + disconnect (next connect → fresh QR). */
export const DELETE = withErrorHandler(async () => {
  try {
    const result = await sidecar.logout();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SidecarUnavailableError) {
      return NextResponse.json(
        { ok: false, error: "WhatsApp sidecar not reachable." },
        { status: 503 },
      );
    }
    throw err;
  }
}, "DELETE /api/whatsapp/logout");
