import { NextRequest, NextResponse } from "next/server";
import { sidecar, SidecarUnavailableError } from "@/lib/whatsapp/sidecar-client";
import { requireAuth } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ jid: string }> };

/** GET /api/whatsapp/chats/[jid]/messages?limit=100 — messages for a chat. */
export const GET = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
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
    throw err;
  }
}, "GET /api/whatsapp/chats/[jid]/messages");
