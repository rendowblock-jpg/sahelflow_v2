import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/conversations/[id] — a seeded conversation + its messages (fallback
 * for the live inbox when the sidecar is down).
 */
export const GET = withErrorHandler(async (
  _req: NextRequest,
  { params }: RouteContext,
) => {
  await requireAuth();
  const { id } = await params;
  const conversation = await db.conversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { timestamp: "asc" } } },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  // Mark as read
  if (conversation.unreadCount > 0) {
    await db.conversation.update({
      where: { id },
      data: { unreadCount: 0 },
    });
  }
  return NextResponse.json({ conversation, source: "seeded" });
}, "GET /api/conversations/[id]");
