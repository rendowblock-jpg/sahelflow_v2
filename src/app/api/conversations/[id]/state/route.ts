import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// Ledger INB-12: pin / mute / archive conversation states. Partial patch —
// only the provided fields change; everything else stays untouched.
const stateSchema = z.object({
  pinned: z.boolean().optional(),
  muted: z.boolean().optional(),
  archived: z.boolean().optional(),
});

const MUTE_HORIZON_MS = 100 * 365 * 24 * 60 * 60 * 1000; // "forever" horizon

/** PATCH /api/conversations/[id]/state — WhatsApp conversation states.
 *  The row stays the authority; the queue projects the states on next read. */
export const PATCH = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    await requireTrustedAction("conversations.update");
    const { id } = await params;
    const patch = stateSchema.parse(await request.json());

    const data: {
      pinnedAt?: Date | null;
      mutedUntil?: Date | null;
      archivedAt?: Date | null;
    } = {};
    if (patch.pinned !== undefined) {
      data.pinnedAt = patch.pinned ? new Date() : null;
    }
    if (patch.muted !== undefined) {
      data.mutedUntil = patch.muted
        ? new Date(Date.now() + MUTE_HORIZON_MS)
        : null;
    }
    if (patch.archived !== undefined) {
      data.archivedAt = patch.archived ? new Date() : null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No state change requested", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const existing = await db.conversation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Conversation not found", code: "CONVERSATION_NOT_FOUND" },
        { status: 404 },
      );
    }

    await db.conversation.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  },
  "PATCH /api/conversations/[id]/state",
);
