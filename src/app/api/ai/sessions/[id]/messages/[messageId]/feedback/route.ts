import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

const feedbackSchema = z.object({
  // "none" removes the feedback row (click the active thumb again).
  value: z.enum(["up", "down", "none"]),
});

/** POST /api/ai/sessions/[id]/messages/[messageId]/feedback — ledger AI-13.
 *  One durable quality row per assistant answer: the opposite thumb
 *  overwrites, the active thumb deletes. The quality loop reads the table;
 *  nothing here changes the conversation content. */
export const POST = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    await requireAuth("ai.use");
    const { id, messageId } = await params;
    const { value } = feedbackSchema.parse(await request.json());

    // Ownership truth: the message must belong to the addressed session —
    // a cross-session messageId is a 404, never a write.
    const message = await db.aiChatMessage.findFirst({
      where: { id: messageId, sessionId: id },
      select: { id: true },
    });
    if (!message) {
      return NextResponse.json(
        {
          error: "Feedback target not found",
          code: "AI_SESSION_NOT_FOUND",
        },
        { status: 404 },
      );
    }

    if (value === "none") {
      await db.aiMessageFeedback.deleteMany({ where: { messageId } });
      return NextResponse.json({ ok: true, value: null });
    }

    const saved = await db.aiMessageFeedback.upsert({
      where: { messageId },
      create: { messageId, value },
      update: { value },
    });
    return NextResponse.json({ ok: true, value: saved.value });
  },
  "POST /api/ai/sessions/[id]/messages/[messageId]/feedback",
);
