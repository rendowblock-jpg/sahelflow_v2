import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { createReturnSchema } from "@/lib/validation";

// GET /api/returns — list returns for authenticated seller
export const GET = withAuthAndRateLimit(
  async (req, { sellerId, supabase }) => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    let query = supabase
      .from("returns")
      .select("*, order:orders!inner(id, order_number, customer:customers(id, name, phone))", {
        count: "exact",
      })
      .eq("seller_id", sellerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: returns, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ returns: returns || [], total: count ?? 0 });
  },
  { requireAuth: true }
);

// POST /api/returns — create a return request
export const POST = withAuthAndRateLimit(
  async (req, { user, sellerId, supabase, body }) => {
    const {
      orderId,
      type,
      reason,
      reason_details,
      resolution_type,
      refund_amount,
      items,
      photos,
      return_tracking_id,
      return_delivery_company,
    } = body!;

    // 1. Verify original order belongs to seller
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, customer_id")
      .eq("id", orderId)
      .eq("seller_id", sellerId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Original order not found" }, { status: 404 });
    }

    // 2. Insert return request
    const { data: retObj, error: insertError } = await supabase
      .from("returns")
      .insert({
        seller_id: sellerId,
        order_id: orderId,
        customer_id: order.customer_id,
        reason,
        reason_details: reason_details || null,
        resolution_type,
        refund_amount: refund_amount || 0,
        items,
        photos: photos || [],
        return_tracking_id: return_tracking_id || null,
        return_delivery_company: return_delivery_company || null,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // 3. Insert system log in return_notes
    await supabase.from("return_notes").insert({
      return_id: retObj.id,
      author_id: user.id,
      type: "system",
      content: `Return request created of type: ${type}. Resolution: ${resolution_type}.`,
    });

    return NextResponse.json({ return: retObj }, { status: 201 });
  },
  {
    schema: createReturnSchema,
    requireAuth: true,
  }
);
