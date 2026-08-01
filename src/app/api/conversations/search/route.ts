/**
 * GET /api/conversations/search?q=<query>
 *
 * Searches conversations + messages by content. Message.body is PII-encrypted
 * (AES-256-GCM), so search is done in-memory: load conversations + their
 * recent messages, decrypt, filter by query. Practical for local-first shops
 * (typically <10K messages).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("conversations.read");
  const canReadContact = trustedActionAllowed(
    actorContext,
    "customers.contact.read",
    { shopId: actorContext.shop.shopId },
  );
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase();
  if (!q) return NextResponse.json({ results: [] });

  // Load all conversations with recent messages
  const conversations = await db.conversation.findMany({
    include: {
      messages: {
        orderBy: { timestamp: "desc" },
        take: 50, // last 50 messages per conversation
      },
    },
    take: 100, // limit to 100 conversations
  });

  // Decrypt + search in-memory (body is PII-encrypted, transparently decrypted by the extension)
  const results = conversations
    .filter((conv) => {
      // Search contact name
      if (canReadContact && conv.contactName?.toLowerCase().includes(q)) return true;
      // Search contact phone
      if (canReadContact && conv.contactPhone?.toLowerCase().includes(q)) return true;
      // Search message bodies (decrypted transparently by the PII extension)
      return conv.messages.some((m) => m.body?.toLowerCase().includes(q));
    })
    .map((conv) => ({
      id: conv.id,
      contactName: canReadContact ? conv.contactName : null,
      contactPhone: canReadContact ? conv.contactPhone : null,
      channel: conv.channel,
      lastMessageAt: conv.lastMessageAt,
      unreadCount: conv.unreadCount,
      matchType: canReadContact && conv.contactName?.toLowerCase().includes(q) ? "name" :
                  canReadContact && conv.contactPhone?.toLowerCase().includes(q) ? "phone" : "message",
      fieldAccess: { contact: canReadContact },
    }));

  return NextResponse.json({ results });
}, "GET /api/conversations/search");
