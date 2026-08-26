import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { resolveConversationIdForRead } from "@/lib/data/conversation-service";
import { db, shopContext } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

const draftSchema = z.object({
  body: z.string().max(10_000),
});

async function conversationId(rawId: string): Promise<string | null> {
  return resolveConversationIdForRead(
    { prisma: db, shop: shopContext },
    rawId,
  );
}

/** Read the protected persisted draft without creating provider state. */
export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    await requireTrustedAction("conversations.reply");
    const { id: rawId } = await params;
    const id = await conversationId(rawId);
    if (!id) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    const conversation = await db.conversation.findUnique({
      where: { id },
      select: { draftBody: true },
    });
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    return NextResponse.json({ body: conversation.draftBody ?? "" });
  },
  "GET /api/conversations/[id]/draft",
);

/** Idempotent last-write-wins draft replacement; an empty body clears it. */
export const PUT = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    await requireTrustedAction("conversations.reply");
    const { id: rawId } = await params;
    const id = await conversationId(rawId);
    if (!id) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    const { body } = draftSchema.parse(await request.json());
    const normalized = body.replaceAll("\u0000", "");
    await db.conversation.update({
      where: { id },
      data: { draftBody: normalized || null },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, body: normalized });
  },
  "PUT /api/conversations/[id]/draft",
);
