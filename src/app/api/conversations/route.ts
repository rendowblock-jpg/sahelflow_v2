import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/conversations — list seeded/demo conversations (client-side fallback
 * when the WhatsApp sidecar is not running or not connected). Live WhatsApp
 * conversations come from /api/whatsapp/chats.
 */
export async function GET() {
  const conversations = await db.conversation.findMany({
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    select: {
      id: true,
      channel: true,
      contactName: true,
      contactPhone: true,
      lastMessageAt: true,
      unreadCount: true,
    },
  });
  return NextResponse.json({ conversations, source: "seeded" });
}
