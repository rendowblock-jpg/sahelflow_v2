import { NextResponse } from "next/server";
import { sidecar, SidecarUnavailableError } from "@/lib/whatsapp/sidecar-client";

export const dynamic = "force-dynamic";

/** POST /api/whatsapp/connect — start the sidecar's WhatsApp connection. */
export async function POST() {
  try {
    const result = await sidecar.connect();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SidecarUnavailableError) {
      return NextResponse.json(
        { ok: false, error: "WhatsApp sidecar not reachable." },
        { status: 503 },
      );
    }
    console.error("[POST /api/whatsapp/connect]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
