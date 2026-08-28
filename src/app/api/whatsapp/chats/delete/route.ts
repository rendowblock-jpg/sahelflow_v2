import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { deleteWhatsAppChats } from "@/lib/whatsapp/chat-delete";

export const dynamic = "force-dynamic";

const schema = z.object({
  // Canonical Conversation ids from the inbox projection, 1..100 per batch.
  ids: z.array(z.string().min(1).max(64)).min(1).max(100),
});

/**
 * Permanent multi-select chat deletion (founder-confirmed contract).
 * Removes the chats with their messages, durable provider effects, ingress
 * events and encrypted local media from this store. Provider-side copies on
 * WhatsApp remain, by design — SahelFlow never impersonates account-level
 * provider deletion.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("conversations.delete");
  const parsed = schema.parse(await req.json());
  const result = await deleteWhatsAppChats(
    { prisma: db, shop: actorContext.shop },
    parsed.ids,
  );
  return NextResponse.json({
    ok: true,
    deleted: result.deletedConversationIds.length,
    deletedMessages: result.deletedMessageCount,
    conversationIds: result.deletedConversationIds,
  });
}, "POST /api/whatsapp/chats/delete");
