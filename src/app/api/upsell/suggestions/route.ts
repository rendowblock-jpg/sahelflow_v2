import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { generateUpsellSuggestions } from "@/lib/ai/upsell-engine";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  order_id: z.string().uuid(),
});

export const POST = withAuthAndRateLimit(
  async (_req, { sellerId, supabase, body }) => {
    const { order_id } = body!; // L10 fix: removed redundant cast (body already typed by wrapper)

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, items, seller_id")
      .eq("id", order_id)
      .eq("seller_id", sellerId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("id, name, price, cost_price, stock, category_id, image_url, active, categories(name)")
      .eq("seller_id", sellerId)
      .eq("active", true)
      .gt("stock", 0);

    if (prodErr) {
      return NextResponse.json({ error: prodErr.message }, { status: 500 });
    }

    const items = (order.items as Array<{ product_id?: string; product_name: string; quantity: number }>) || [];

    const suggestions = generateUpsellSuggestions(items, products || []);

    return NextResponse.json({ suggestions });
  },
  { requirePermission: "orders:view", schema, rateLimitConfig: { maxRequests: 30, windowMs: 60000 } }
);
