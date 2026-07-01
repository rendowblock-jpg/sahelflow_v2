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
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
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
      if (conv.contactName?.toLowerCase().includes(q)) return true;
      // Search contact phone
      if (conv.contactPhone?.toLowerCase().includes(q)) return true;
      // Search message bodies (decrypted transparently by the PII extension)
      return conv.messages.some((m) => m.body?.toLowerCase().includes(q));
    })
    .map((conv) => ({
      id: conv.id,
      contactName: conv.contactName,
      contactPhone: conv.contactPhone,
      channel: conv.channel,
      lastMessageAt: conv.lastMessageAt,
      unreadCount: conv.unreadCount,
      matchType: conv.contactName?.toLowerCase().includes(q) ? "name" :
                  conv.contactPhone?.toLowerCase().includes(q) ? "phone" : "message",
    }));

  return NextResponse.json({ results });
}, "GET /api/conversations/search");
