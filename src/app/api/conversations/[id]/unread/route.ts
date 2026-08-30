import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { ensureConversationForJid } from "@/lib/data/conversation-service";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { projectConversationForTrustedActor } from "@/lib/identity/conversation-projection";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

/** Mark unread without reducing a larger inbound unread count. */
export const PATCH = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("conversations.update");
    const { id: rawId } = await params;
    const id = await ensureConversationForJid(
      { prisma: db, shop: shopContext },
      rawId,
    );
    await db.conversation.updateMany({
      where: { id, unreadCount: 0 },
      data: { unreadCount: { increment: 1 } },
    });
    // Explicit coded 404 instead of findUniqueOrThrow: the missing row must be
    // an addressed outcome, and the protected-data read path stays canonical.
    const conversation = await db.conversation.findUnique({ where: { id } });
    if (!conversation) {
      throw new SahelFlowError(
        "Conversation not found",
        "CONVERSATION_NOT_FOUND",
        404,
      );
    }
    return NextResponse.json({
      conversation: projectConversationForTrustedActor(
        conversation,
        actorContext,
      ),
    });
  },
  "PATCH /api/conversations/[id]/unread",
);
