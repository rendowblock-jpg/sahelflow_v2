import { NextRequest, NextResponse } from "next/server";
import { ensureConversationForJid } from "@/lib/data/conversation-service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { assignConversation } from "@/lib/data/conversation-service";
import { z } from "zod";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// `assignee` may be a user id string or null (to clear assignment).
const schema = z.object({
  assignee: z.string().min(1).nullable(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  await requireAuth();
  const { id: rawId } = await params;
    // Session 30 (AUDIT-5 C1): if rawId is a JID (live WhatsApp chat), ensure
    // a Conversation row exists and use its cuid. Otherwise rawId is already a cuid.
    const id = await ensureConversationForJid(rawId);
  const body = await req.json();
  const parsed = schema.parse(body);
  const conv = await assignConversation(id, parsed.assignee);
  return NextResponse.json({ conversation: conv });
}, "PATCH /api/conversations/[id]/assign");
