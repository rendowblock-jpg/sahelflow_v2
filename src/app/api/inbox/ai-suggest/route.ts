import { NextResponse } from "next/server";
import { processIncomingMessage } from "@/lib/agents/communication-agent";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { z } from "zod";

const aiSuggestSchema = z.object({
  conversationId: z.string().uuid("Invalid conversation ID format"),
});

/**
 * POST /api/inbox/ai-suggest
 * Triggers the Communication Agent to classify, extract, and suggest replies
 * for a given conversation. Called when the seller clicks the ✨ button.
 */
export const POST = withAuthAndRateLimit(
  async (req, { user: _user, sellerId, supabase, body }) => {
    const { conversationId } = body!;

    // Verify the conversation belongs to this seller
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, seller_id")
      .eq("id", conversationId)
      .eq("seller_id", sellerId)
      .single();

    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Run the Communication Agent
    const result = await processIncomingMessage(conversationId, sellerId);

    return NextResponse.json({
      classification: result.classification,
      extractedOrder: result.extractedOrder || null,
      suggestedReplies: result.suggestedReplies,
    });
  },
  {
    requirePermission: "inbox:view",
    schema: aiSuggestSchema,
    rateLimitConfig: { maxRequests: 15, windowMs: 60000 },
  }
);
