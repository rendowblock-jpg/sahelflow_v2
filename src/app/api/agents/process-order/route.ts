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
  async (req, { sellerId, supabase, body }) => {
    const { orderId } = body!;

    // Verify the order belongs to this seller via explicit RLS equivalent
    const { data: order } = await supabase
      .from("orders")
      .select("id, seller_id")
      .eq("id", orderId)
      .eq("seller_id", sellerId)
      .single();

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Load seller's agent config
    const { data: seller } = await supabase
      .from("sellers")
      .select("settings")
      .eq("id", sellerId)
      .single();

    const agentConfig = (seller?.settings as Record<string, unknown>)?.agent_config as Record<string, unknown> | undefined;

    const result = await processOrder(orderId, agentConfig?.order as Record<string, unknown> | undefined);

    return NextResponse.json(result);
  },
  {
    requirePermission: "orders:manage",
    schema: processOrderSchema,
    rateLimitConfig: { maxRequests: 10, windowMs: 60000 },
  }
);
