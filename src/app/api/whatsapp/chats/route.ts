import { NextRequest, NextResponse } from "next/server";
import { sidecar, SidecarUnavailableError } from "@/lib/whatsapp/sidecar-client";

export const dynamic = "force-dynamic";

/** GET /api/whatsapp/chats?limit=50 — recent chats from the sidecar store. */
export async function GET(req: NextRequest) {
  const limit = req.nextUrl.searchParams.get("limit") ?? "50";
  try {
    const result = await sidecar.chats(Number(limit));
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SidecarUnavailableError) {
      return NextResponse.json({ chats: [], sidecarReachable: false }, { status: 503 });
    }
    console.error("[GET /api/whatsapp/chats]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
