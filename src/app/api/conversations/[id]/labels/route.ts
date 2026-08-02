import { NextRequest, NextResponse } from "next/server";
import {
  ensureConversationForJid,
  resolveConversationIdForRead,
} from "@/lib/data/conversation-service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { projectConversationForTrustedActor } from "@/lib/identity/conversation-projection";
import {
  getConversationLabels,
  setConversationLabels,
} from "@/lib/data/conversation-service";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";

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
  await requireTrustedAction("conversations.read");
  const { id: rawId } = await params;
  const id = await resolveConversationIdForRead(
    { prisma: db, shop: shopContext },
    rawId,
  );
  if (!id) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }
  const labels = await getConversationLabels({ prisma: db, shop: shopContext }, id);
  return NextResponse.json({ labels });
}, "GET /api/conversations/[id]/labels");

/**
 * PUT /api/conversations/[id]/labels — replace the conversation's label set.
 * Body: { labels: string[] }. PUT (not PATCH) because the operation is a full
 * replacement of the labels array (idempotent), matching the Chatwoot pattern.
 */
export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const actorContext = await requireTrustedAction("conversations.update");
  // A-H2: resolve JID → cuid (live WhatsApp chats are referenced by JID in
  // the URL). Sibling GET + parallel /status, /priority, /assign routes all
  // do this; PUT was missed → 404 for live chats.
  const { id: rawId } = await params;
  const id = await ensureConversationForJid({ prisma: db, shop: shopContext }, rawId);
  const body = await req.json();
  const parsed = putSchema.parse(body);
  const conv = await setConversationLabels(
    { prisma: db, shop: shopContext },
    id,
    parsed.labels,
  );
  return NextResponse.json({
    conversation: projectConversationForTrustedActor(conv, actorContext),
    labels: parsed.labels,
  });
}, "PUT /api/conversations/[id]/labels");
