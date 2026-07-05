import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/conversations — list seeded/demo conversations (client-side fallback
 * when the WhatsApp sidecar is not running or not connected). Live WhatsApp
 * conversations come from /api/whatsapp/chats.
 */
export const GET = withErrorHandler(async () => {
  await requireAuth();
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
      status: true,
      assigneeId: true,
      priority: true,
      labels: true,
      snoozedUntil: true,
      waitingSince: true,
      firstReplyAt: true,
    },
  });
  return NextResponse.json({ conversations, source: "seeded" });
}, "GET /api/conversations");
