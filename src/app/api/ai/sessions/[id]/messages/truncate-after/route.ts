import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Ledger AI-07/AI-15: regenerate-in-place and edit-and-resend both need a
 * server-authoritative truncation of a durable conversation tail. The client
 * names one user message; everything strictly after it is deleted, and the
 * message itself is deleted too when `includeMessage` is set (the re-send
 * path recreates that user turn through the established stream route).
 *
 * Follows the sibling AI route pattern: withErrorHandler, requireAuth scope
 * `ai.use`, zod-validated input, per-shop SQLite DB (`db`) scopes the data.
 */
/**
 * S06a-11: proposals that can still be approved or executed. Final states
 * (succeeded, rejected, expired, conflict) never block a truncation.
 */
const LIVE_PROPOSAL_STATUSES = new Set([
  "pending",
  "approved",
  "executing",
  "failed",
]);

const truncateSchema = z.object({
  afterMessageId: z.string().trim().min(1).max(64),
  includeMessage: z.boolean().optional().default(true),
});

export const POST = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    await requireAuth("ai.use");
    const { id } = await params;
    const input = truncateSchema.parse(await request.json());

    const session = await db.aiChatSession.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json(
        { error: "AI_SESSION_NOT_FOUND" },
        { status: 404 },
      );
    }
    const anchor = await db.aiChatMessage.findFirst({
      where: { id: input.afterMessageId, sessionId: id },
      select: { id: true, createdAt: true },
    });
    if (!anchor) {
      return NextResponse.json(
        { error: "AI_MESSAGE_NOT_FOUND" },
        { status: 404 },
      );
    }

    // Conversation order is (createdAt, id) — the same composite the history
    // loader orders by. Bounded by the session's message count (local-first).
    const rows = await db.aiChatMessage.findMany({
      where: { sessionId: id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const anchorIndex = rows.findIndex((row) => row.id === anchor.id);
    if (anchorIndex < 0) {
      return NextResponse.json(
        { error: "AI_MESSAGE_NOT_FOUND" },
        { status: 404 },
      );
    }
    const doomed = rows
      .slice(input.includeMessage ? anchorIndex : anchorIndex + 1)
      .map((row) => row.id);
    if (doomed.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }
    // S06a-11: AiActionProposal.requestMessageId is a plain string (no relation,
    // no cascade). Deleting the user message a still-actionable proposal was
    // created for would leave the approval card without the request that
    // justified it, so refuse and delete nothing.
    const bound = await db.aiActionProposal.findMany({
      where: { sessionId: id, requestMessageId: { in: doomed } },
      select: { status: true, expiresAt: true },
    });
    const now = Date.now();
    const hasLiveProposal = bound.some(
      (proposal) =>
        LIVE_PROPOSAL_STATUSES.has(proposal.status) &&
        !(proposal.status === "pending" && proposal.expiresAt.getTime() <= now),
    );
    if (hasLiveProposal) {
      return NextResponse.json(
        { error: "AI_PROPOSAL_PENDING", code: "AI_PROPOSAL_PENDING" },
        { status: 409 },
      );
    }
    const result = await db.aiChatMessage.deleteMany({
      where: { id: { in: doomed } },
    });
    return NextResponse.json({ deleted: result.count });
  },
  "POST /api/ai/sessions/[id]/messages/truncate-after",
);
