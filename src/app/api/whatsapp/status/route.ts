import { NextResponse } from "next/server";
import { sidecar, SidecarUnavailableError } from "@/lib/whatsapp/sidecar-client";

export const dynamic = "force-dynamic";

/** GET /api/whatsapp/status — sidecar connection status. */
export async function GET() {
  try {
    const status = await sidecar.status();
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof SidecarUnavailableError) {
      return NextResponse.json(
        { status: "disconnected", user: null, hasQr: false, sidecarReachable: false },
        { status: 503 },
      );
    }
    console.error("[GET /api/whatsapp/status]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
