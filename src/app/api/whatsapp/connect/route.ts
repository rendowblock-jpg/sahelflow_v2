import { NextResponse } from "next/server";
import { sidecar, SidecarUnavailableError } from "@/lib/whatsapp/sidecar-client";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** POST /api/whatsapp/connect — start the sidecar's WhatsApp connection. */
export const POST = withErrorHandler(async () => {
  await requireAuth();
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
    throw err;
  }
}, "POST /api/whatsapp/connect");
