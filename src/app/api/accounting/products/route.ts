import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";

export const dynamic = "force-dynamic";

// GET /api/accounting/products — get per-product profitability ranking
export const GET = withAuthAndRateLimit(
  async (req, { supabase }) => {
    const { data, error } = await supabase.rpc("get_product_profitability");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ products: data || [] });
  },
  { requireAuth: true }
);
