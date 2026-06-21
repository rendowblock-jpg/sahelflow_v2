import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/conversations/[id] — a seeded conversation + its messages (fallback
 * for the live inbox when the sidecar is down).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const conversation = await db.conversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { timestamp: "asc" } } },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Mark as read
  if (conversation.unreadCount > 0) {
    await db.conversation.update({
      where: { id },
      data: { unreadCount: 0 },
    });
  }
  return NextResponse.json({ conversation, source: "seeded" });
}
