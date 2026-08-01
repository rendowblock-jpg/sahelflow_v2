import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { ensureConversationForJid } from "@/lib/data/conversation-service";
import { requireTrustedAction } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/conversations/[id] — exact-shop workflow and seeded message
 * projection. A live WhatsApp JID is normalized to its canonical Conversation
 * row after durable read authority is established.
 */
export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    await requireTrustedAction("conversations.read");
    const { id: rawId } = await params;
    const context = { prisma: db, shop: shopContext };
    const conversationId = await ensureConversationForJid(context, rawId);
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { timestamp: "asc" } } },
    });
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    if (conversation.unreadCount > 0) {
      await db.conversation.update({
        where: { id: conversation.id },
        data: { unreadCount: 0 },
      });
    }

    return NextResponse.json({
      conversation: {
        ...conversation,
        unreadCount: 0,
      },
      source: "seeded",
    });
  },
  "GET /api/conversations/[id]",
);
