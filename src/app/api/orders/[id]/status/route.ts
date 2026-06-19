import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { updateOrderStatus } from "@/lib/data/order-service";
import { updateOrderStatusSchema } from "@/lib/validation";

export const PATCH = withAuthAndRateLimit(
  async (req, { user: _user, sellerId, supabase, body, params }) => {
    const orderId = params.id as string;
    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
    }

    const { status } = body!;

    // 1. Verify order ownership
    const { data: order, error: checkError } = await supabase
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .eq("seller_id", sellerId)
      .is("deleted_at", null)
      .single();

    if (checkError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // 2. Call service layer update
    try {
      const updatedOrder = await updateOrderStatus(orderId, status, supabase);
      return NextResponse.json({ success: true, order: updatedOrder });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update order status";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  },
  {
    requirePermission: "orders:manage",
    schema: updateOrderStatusSchema,
    requireAuth: true,
  }
);
