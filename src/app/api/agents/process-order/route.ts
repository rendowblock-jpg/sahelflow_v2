import { NextResponse } from "next/server";
import { processOrder } from "@/lib/agents/order-agent";
import { processOrderSchema } from "@/lib/validation";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";

/**
 * POST /api/agents/process-order
 * Triggers the Order Agent to assess risk on a specific order.
 * Can be called manually from the dashboard or automatically via webhook.
 */
export const POST = withAuthAndRateLimit(
  async (req, { user, supabase, body }) => {
    const { orderId } = body!;

    // Verify the order belongs to this seller via explicit RLS equivalent
    const { data: order } = await supabase
      .from("orders")
      .select("id, seller_id")
      .eq("id", orderId)
      .eq("seller_id", user.id)
      .single();

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Load seller's agent config
    const { data: seller } = await supabase
      .from("sellers")
      .select("settings")
      .eq("id", user.id)
      .single();

    const agentConfig = (seller?.settings as Record<string, unknown>)?.agent_config as Record<string, unknown> | undefined;

    const result = await processOrder(orderId, agentConfig?.order as Record<string, unknown> | undefined);

    return NextResponse.json(result);
  },
  {
    schema: processOrderSchema,
    rateLimitConfig: { maxRequests: 10, windowMs: 60000 },
  }
);
