import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { ensureConversationForJid } from "@/lib/data/conversation-service";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { projectConversationForTrustedActor } from "@/lib/identity/conversation-projection";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

/** Explicitly mark a conversation read; GET endpoints remain mutation-free. */
export const PATCH = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("conversations.update");
    const { id: rawId } = await params;
    const id = await ensureConversationForJid(
      { prisma: db, shop: shopContext },
      rawId,
    );
    const conversation = await db.conversation.update({
      where: { id },
      data: { unreadCount: 0 },
    });
    return NextResponse.json({
      conversation: projectConversationForTrustedActor(
        conversation,
        actorContext,
      ),
    });
  },
  "PATCH /api/conversations/[id]/read",
);
