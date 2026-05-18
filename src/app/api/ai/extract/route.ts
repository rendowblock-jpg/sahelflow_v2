import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { z } from "zod";

const extractSchema = z.object({
  messages: z.array(z.string()).min(1, "messages array must contain at least one message"),
});

/**
 * POST /api/ai/extract
 * Extract order data from a message using the AI extraction engine
 */
export const POST = withAuthAndRateLimit(
  async (req, { body, supabase, user }) => {
    const { messages } = body!;

    const { data: dbProducts } = await supabase
      .from('products')
      .select('id, name, price, variants')
      .eq('seller_id', user.id)
      .eq('active', true)
      .limit(100);

    // Use the extraction engine with catalog context
    const { extractOrderWithCatalog } = await import("@/lib/ai/extraction");
    const extraction = await extractOrderWithCatalog(messages, dbProducts || []);

    return NextResponse.json(extraction);
  },
  {
    schema: extractSchema,
    rateLimitConfig: { maxRequests: 10, windowMs: 60000 },
  }
);
