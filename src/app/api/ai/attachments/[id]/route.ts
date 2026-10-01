import { NextRequest, NextResponse } from "next/server";

import { openAiChatAttachment } from "@/lib/ai/chat/attachments";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/attachments/[id] — one image a seller attached to an Agents
 * chat turn, opened from its sealed payload for the chat that shows it.
 * Same authority as reading the conversation (`ai.use`); never cached by
 * shared caches.
 */
export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireAuth("ai.use");
    const { id } = await params;
    const row = await db.aiChatAttachment.findUnique({
      where: { id },
      select: { id: true, mediaType: true, payload: true },
    });
    if (!row) {
      return NextResponse.json({ error: "AI_ATTACHMENT_NOT_FOUND" }, { status: 404 });
    }
    const bytes = await openAiChatAttachment({ prisma: db, shop: shopContext }, row);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": row.mediaType,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  },
  "GET /api/ai/attachments/[id]",
);
