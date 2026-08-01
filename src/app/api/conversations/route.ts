import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

/**
 * GET /api/conversations — exact-shop conversation workflow projection used as
 * the seeded/offline inbox fallback.
 */
export const GET = withErrorHandler(async () => {
  await requireTrustedAction("conversations.read");
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
    conversations,
    source: "seeded",
  });
}, "GET /api/conversations");
