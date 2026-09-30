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

/** Pin/unpin is its own body so a rename can never clear a pin by omission. */
const pinSchema = z.object({ pinned: z.boolean() });

const patchSchema = z.union([renameSchema, pinSchema]);

/**
 * PATCH /api/ai/sessions/[id] — rename or pin a durable AI chat session.
 *
 * R4-e session management. Mirrors the established AI route pattern:
 * withErrorHandler (demo + license mutation gates included), requireAuth
 * scope `ai.use`, zod-validated input. Renaming and pinning are pure data
 * operations on existing seller-owned history — no provider call, no
 * license burn. A pin keeps the session's `updatedAt`: pinning is not
 * activity, so it must not reorder the recency groups in the rail.
 */
export const PATCH = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    await requireAuth("ai.use");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const input = patchSchema.parse(body);

    const existing = await db.aiChatSession.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "AI_SESSION_NOT_FOUND" },
        { status: 404 },
      );
    }
    const session = await db.aiChatSession.update({
      where: { id },
      data:
        "pinned" in input
          ? {
              pinnedAt: input.pinned ? new Date() : null,
              updatedAt: existing.updatedAt,
            }
          : { title: input.title },
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
