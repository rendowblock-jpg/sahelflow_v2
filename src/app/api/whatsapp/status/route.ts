import { NextResponse } from "next/server";
import { sidecar, SidecarUnavailableError } from "@/lib/whatsapp/sidecar-client";
import { requireAuth } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

/** GET /api/whatsapp/status — sidecar connection status. */
export const GET = withErrorHandler(async () => {
  await requireAuth();
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
    throw err;
  }
}, "GET /api/whatsapp/status");
