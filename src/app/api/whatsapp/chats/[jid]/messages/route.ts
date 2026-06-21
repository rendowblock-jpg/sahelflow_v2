import { NextRequest, NextResponse } from "next/server";
import { sidecar, SidecarUnavailableError } from "@/lib/whatsapp/sidecar-client";

export const dynamic = "force-dynamic";

/** GET /api/whatsapp/chats/[jid]/messages?limit=100 — messages for a chat. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jid: string }> },
) {
  const { jid: rawJid } = await params;
  const jid = decodeURIComponent(rawJid);
  const limit = req.nextUrl.searchParams.get("limit") ?? "100";
  try {
    const result = await sidecar.messages(jid, Number(limit));
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SidecarUnavailableError) {
      return NextResponse.json({ jid, messages: [], sidecarReachable: false }, { status: 503 });
    }
    console.error("[GET /api/whatsapp/chats/[jid]/messages]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
