import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { updateConversationStatus, type ConversationStatus } from "@/lib/data/conversation-service";
import { z } from "zod";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  status: z.enum(["open", "pending", "resolved", "snoozed"]),
  snoozedUntil: z.string().datetime().optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  await requireAuth();
  const { id } = await params;
  const body = await req.json();
  const parsed = schema.parse(body);
  const conv = await updateConversationStatus(
    id,
    parsed.status as ConversationStatus,
    parsed.snoozedUntil ? new Date(parsed.snoozedUntil) : undefined,
  );
  return NextResponse.json({ conversation: conv });
}, "PATCH /api/conversations/[id]/status");
