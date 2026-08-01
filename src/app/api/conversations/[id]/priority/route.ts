import { NextRequest, NextResponse } from "next/server";
import { ensureConversationForJid } from "@/lib/data/conversation-service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { projectConversationForTrustedActor } from "@/lib/identity/conversation-projection";
import { setConversationPriority } from "@/lib/data/conversation-service";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  priority: z.enum(["urgent", "high", "medium", "low"]).nullable(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const actorContext = await requireTrustedAction("conversations.update");
  const { id: rawId } = await params;
    // Session 30 (AUDIT-5 C1): if rawId is a JID (live WhatsApp chat), ensure
    // a Conversation row exists and use its cuid. Otherwise rawId is already a cuid.
    const id = await ensureConversationForJid({ prisma: db, shop: shopContext }, rawId);
  const body = await req.json();
  const parsed = schema.parse(body);
  const conv = await setConversationPriority(
    { prisma: db, shop: shopContext },
    id,
    parsed.priority,
  );
  return NextResponse.json({
    conversation: projectConversationForTrustedActor(conv, actorContext),
  });
}, "PATCH /api/conversations/[id]/priority");
