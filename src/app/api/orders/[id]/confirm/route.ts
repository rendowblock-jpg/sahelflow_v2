import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { updateOrderStatus } from "@/lib/data/order-service";
import { updateOrderConfirmationSchema } from "@/lib/validation";

export const PATCH = withAuthAndRateLimit(
  async (req, { user: _user, sellerId, supabase, body, params }) => {
    const orderId = typeof params.id === "string" ? params.id : params.id?.[0];
    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
    }

    const {
      confirmation_status,
      confirmation_attempts,
      confirmation_notes,
      upsell_offered,
    } = body!;

    // 1. Verify order ownership
    const { data: order, error: checkError } = await supabase
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .eq("seller_id", sellerId)
      .is("deleted_at", null)
      .single();

    if (checkError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // 2. Perform database update for confirmation fields dynamically
    const updatePayload: Record<string, unknown> = {};
    if (confirmation_status !== undefined) updatePayload.confirmation_status = confirmation_status;
    if (confirmation_attempts !== undefined) updatePayload.confirmation_attempts = confirmation_attempts;
    if (confirmation_notes !== undefined) updatePayload.confirmation_notes = confirmation_notes;
    if (upsell_offered !== undefined) updatePayload.upsell_offered = upsell_offered;

    const { error: updateError } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId)
      .eq("seller_id", sellerId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 3. Trigger state machine status changes if applicable
    try {
      let finalOrder;
      if (confirmation_status === "annule") {
        finalOrder = await updateOrderStatus(orderId, "cancelled");
      } else if (confirmation_status === "confirmed") {
        finalOrder = await updateOrderStatus(orderId, "confirmed");
      } else {
        // Just fetch the order with customer details to return standard format
        const { data: fetchedOrder, error: fetchError } = await supabase
          .from("orders")
          .select("*, customer:customers(id, name, phone, wilaya, commune)")
          .eq("id", orderId)
          .is("deleted_at", null)
          .single();

        if (fetchError) throw fetchError;
        finalOrder = fetchedOrder;
      }

      return NextResponse.json({ success: true, order: finalOrder });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to process order confirmation transition";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  },
  {
    schema: updateOrderConfirmationSchema,
    requireAuth: true,
  }
);
