import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";
import {
  projectConversationForTrustedActor,
  projectTrustedActorActions,
} from "@/lib/identity/conversation-projection";

export const dynamic = "force-dynamic";

/**
 * GET /api/conversations — exact-shop conversation workflow projection used as
 * the seeded/offline inbox fallback.
 */
export const GET = withErrorHandler(async () => {
  const actorContext = await requireTrustedAction("conversations.read");
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

  return NextResponse.json({
    conversations: conversations.map((conversation) =>
      projectConversationForTrustedActor(conversation, actorContext),
    ),
    authority: { allowedActions: projectTrustedActorActions(actorContext) },
    source: "seeded",
  });
}, "GET /api/conversations");
