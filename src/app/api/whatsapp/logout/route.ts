import { NextResponse } from "next/server";
import { sidecar, SidecarUnavailableError } from "@/lib/whatsapp/sidecar-client";

export const dynamic = "force-dynamic";

/** DELETE /api/whatsapp/logout — clear auth + disconnect (next connect → fresh QR). */
export async function DELETE() {
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
    console.error("[DELETE /api/whatsapp/logout]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
