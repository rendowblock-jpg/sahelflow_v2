import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { getConversationAssignmentVersions } from "@/lib/inbox/conversation-assignment";

export const dynamic = "force-dynamic";

/**
 * GET /api/conversations — exact-shop conversation workflow projection used as
 * the seeded/offline inbox fallback.
 */
export const GET = withErrorHandler(async () => {
  const actorContext = await requireTrustedAction("conversations.read");
  const context = { prisma: db, shop: shopContext };
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
  const versions = await getConversationAssignmentVersions(
    context,
    conversations.map((conversation) => conversation.id),
  );
  const personActor =
    actorContext.actor.kind === "person" ? actorContext.actor : null;

  return NextResponse.json({
    conversations: conversations.map((conversation) => ({
      ...conversation,
      assignmentVersion: versions.get(conversation.id) ?? 0,
    })),
    currentActor: {
      personId: personActor?.personId ?? null,
      memberId: personActor?.workspaceMemberId ?? null,
      role:
        actorContext.actor.kind === "system" ? null : actorContext.actor.role,
      permissions: personActor?.permissions ?? null,
    },
    source: "seeded",
  });
}, "GET /api/conversations");
