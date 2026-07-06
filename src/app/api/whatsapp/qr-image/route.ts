import { env } from "@/lib/env";
import { NextResponse } from "next/server";
import { sidecar } from "@/lib/whatsapp/sidecar-client";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/qr-image — proxies the sidecar's QR PNG so the browser
 * can render it in an <img> without cross-origin issues.
 *
 * A-S1: this route was previously UNAUTHENTICATED (listed in
 * PUBLIC_API_ROUTES). The WhatsApp pairing QR grants full access to the
 * user's WhatsApp account — anyone hitting this URL during the pairing
 * window could scan it and hijack the account. Now requires auth
 * (defense-in-depth: proxy.ts middleware + per-route requireAuth()).
 *
 * Uses the sidecar-client's bearer token for auth (the sidecar rejects
 * unauthenticated requests since the AAA security audit fix).
 */
export async function GET() {
  await requireAuth();
  try {
    const token = sidecar.wsToken();
    const res = await fetch(
      `${env.whatsappSidecarUrl ?? "http://localhost:3001"}/qr.png`,
      {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: "No QR available. Connect a phone first or already connected." },
        { status: 404 },
      );
    }
    const png = await res.arrayBuffer();
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Sidecar not reachable." },
      { status: 503 },
    );
  }
}
