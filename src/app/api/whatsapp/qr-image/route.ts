import { env } from "@/lib/env";
import { NextResponse } from "next/server";
import { sidecar } from "@/lib/whatsapp/sidecar-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/qr-image — proxies the sidecar's QR PNG so the browser
 * can render it in an <img> without cross-origin issues.
 *
 * Uses the sidecar-client's bearer token for auth (the sidecar rejects
 * unauthenticated requests since the AAA security audit fix).
 */
export async function GET() {
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
