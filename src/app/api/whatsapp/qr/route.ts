import { NextResponse } from "next/server";
import { sidecar, SidecarUnavailableError } from "@/lib/whatsapp/sidecar-client";
import { requireAuth } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/qr — the raw QR string (for client-side rendering) + a
 * direct PNG URL (for `<img src="/api/whatsapp/qr.png">`).
 *
 * Returns { qr: null } when no QR is available (already connected, or
 * sidecar down). The client uses status() to decide whether to poll.
 */
export const GET = withErrorHandler(async () => {
  await requireAuth();
  try {
    const { qr } = await sidecar.qr();
    return NextResponse.json({ qr, qrPngUrl: qr ? "/api/whatsapp/qr-image" : null });
  } catch (err) {
    if (err instanceof SidecarUnavailableError) {
      return NextResponse.json({ qr: null, qrPngUrl: null, sidecarReachable: false }, { status: 503 });
    }
    throw err;
  }
}, "GET /api/whatsapp/qr");
