import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { getDeliveryAdapter } from "@/lib/delivery/adapters";
import { z } from "zod";
import { tApi } from "@/lib/i18n/server";

const schema = z.object({
  orderId: z.string().uuid(),
  provider: z.string().min(1),
});

export const POST = withAuthAndRateLimit(
  async (req, { user: _user, sellerId, supabase, body }) => {
    const { orderId, provider } = body!;

    const adapter = getDeliveryAdapter(provider);
    if (!adapter) {
      return NextResponse.json(
        { error: tApi("unknownProvider", req) },
        { status: 400 },
      );
    }

    const { data: order } = await supabase
      .from("orders")
      .select("id, wilaya")
      .eq("id", orderId)
      .eq("seller_id", sellerId)
      .single();

    if (!order) {
      return NextResponse.json(
        { error: tApi("orderNotFound", req) },
        { status: 404 },
      );
    }

    const { data: integration } = await supabase
      .from("integrations")
      .select("credentials")
      .eq("seller_id", sellerId)
      .eq("platform", provider)
      .eq("is_active", true)
      .single();

    const { data: seller } = await supabase
      .from("sellers")
      .select("wilaya")
      .eq("id", sellerId)
      .single();

    const fromWilaya = seller?.wilaya || "Alger";
    const toWilaya = order.wilaya || "Alger";

    try {
      const cost = await adapter.getDeliveryCost(
        fromWilaya,
        toWilaya,
        0.5,
        integration?.credentials as Record<string, unknown> | undefined,
      );
      return NextResponse.json({ cost });
    } catch {
      return NextResponse.json({ cost: null });
    }
  },
  { requirePermission: "orders:view", schema, rateLimitConfig: { maxRequests: 30, windowMs: 60000 } },
);
