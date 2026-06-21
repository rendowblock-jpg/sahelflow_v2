import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SIDECAR_URL =
  process.env.WHATSAPP_SIDECAR_URL ?? "http://localhost:3001";

/**
 * GET /api/whatsapp/qr-image — proxies the sidecar's QR PNG so the browser
 * can render it in an <img> without cross-origin issues.
 */
export async function GET() {
  try {
    const res = await fetch(`${SIDECAR_URL}/qr.png`, { cache: "no-store" });
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
