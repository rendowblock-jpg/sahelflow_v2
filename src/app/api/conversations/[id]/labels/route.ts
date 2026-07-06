import { NextRequest, NextResponse } from "next/server";
import { ensureConversationForJid } from "@/lib/data/conversation-service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import {
  getConversationLabels,
  setConversationLabels,
} from "@/lib/data/conversation-service";
import { z } from "zod";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const putSchema = z.object({
  labels: z.array(z.string()).max(50),
});

/**
 * GET /api/conversations/[id]/labels — current label set for a conversation.
 */
export const GET = withErrorHandler(async (
  _req: NextRequest,
  { params }: Ctx,
) => {
  await requireAuth();
  const { id: rawId } = await params;
    // Session 30 (AUDIT-5 C1): if rawId is a JID (live WhatsApp chat), ensure
    // a Conversation row exists and use its cuid. Otherwise rawId is already a cuid.
    const id = await ensureConversationForJid(rawId);
  const labels = await getConversationLabels(id);
  return NextResponse.json({ labels });
}, "GET /api/conversations/[id]/labels");

/**
 * PUT /api/conversations/[id]/labels — replace the conversation's label set.
 * Body: { labels: string[] }. PUT (not PATCH) because the operation is a full
 * replacement of the labels array (idempotent), matching the Chatwoot pattern.
 */
export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  await requireAuth();
  // A-H2: resolve JID → cuid (live WhatsApp chats are referenced by JID in
  // the URL). Sibling GET + parallel /status, /priority, /assign routes all
  // do this; PUT was missed → 404 for live chats.
  const { id: rawId } = await params;
  const id = await ensureConversationForJid(rawId);
  const body = await req.json();
  const parsed = putSchema.parse(body);
  const conv = await setConversationLabels(id, parsed.labels);
  return NextResponse.json({ conversation: conv, labels: parsed.labels });
}, "PUT /api/conversations/[id]/labels");
