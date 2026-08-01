import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { resolveConversationIdForRead } from "@/lib/data/conversation-service";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { projectConversationForTrustedActor } from "@/lib/identity/conversation-projection";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/conversations/[id] — exact-shop workflow and seeded message
 * projection. This read never creates a live-JID row or clears unread state;
 * those are explicit authorized mutations.
 */
export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("conversations.read");
    const { id: rawId } = await params;
    const context = { prisma: db, shop: shopContext };
    const conversationId = await resolveConversationIdForRead(context, rawId);
    if (!conversationId) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
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

    return NextResponse.json({
      conversation: projectConversationForTrustedActor(
        conversation,
        actorContext,
      ),
      source: "seeded",
    });
  },
  "GET /api/conversations/[id]",
);
