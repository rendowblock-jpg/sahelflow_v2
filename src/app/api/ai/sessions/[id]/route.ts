import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const renameSchema = z.object({
  title: z.string().trim().min(1).max(160),
});

/**
 * PATCH /api/ai/sessions/[id] — rename a durable AI chat session.
 *
 * R4-e session management. Mirrors the established AI route pattern:
 * withErrorHandler (demo + license mutation gates included), requireAuth
 * scope `ai.use`, zod-validated input. Renaming is a pure data operation
 * on existing seller-owned history — no provider call, no license burn.
 */
export const PATCH = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    await requireAuth("ai.use");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const input = renameSchema.parse(body);

    const existing = await db.aiChatSession.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "AI_SESSION_NOT_FOUND" },
        { status: 404 },
      );
    }
    const session = await db.aiChatSession.update({
      where: { id },
      data: { title: input.title },
    });
    return NextResponse.json({ session });
  },
  "PATCH /api/ai/sessions/[id]",
);

/**
 * DELETE /api/ai/sessions/[id] — delete a session with its history.
 *
 * Prisma cascades remove the session's messages; the proposal-bound action
 * tables (AiActionProposal → AiActionApproval / AiActionExecution) cascade
 * off the session FK as well (migration 20260803164000).
 */
export const DELETE = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    await requireAuth("ai.use");
    const { id } = await params;

    const existing = await db.aiChatSession.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "AI_SESSION_NOT_FOUND" },
        { status: 404 },
      );
    }
    await db.aiChatSession.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  },
  "DELETE /api/ai/sessions/[id]",
);
