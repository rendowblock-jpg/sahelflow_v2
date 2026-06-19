import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/accounting/products — get per-product profitability ranking
export const GET = withAuthAndRateLimit(
  async (_req, _ctx) => {
    // get_product_profitability is SECURITY DEFINER, GRANTed only to service_role.
    const adminClient = createAdminClient();
    const { data, error } = await adminClient.rpc("get_product_profitability");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ products: data || [] });
  },
  { requirePermission: "accounting:view", requireAuth: true }
);
