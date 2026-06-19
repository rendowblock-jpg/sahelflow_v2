import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/accounting/pnl — get P&L summary
export const GET = withAuthAndRateLimit(
  async (req, _ctx) => {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "30d";

    // get_pnl_summary is SECURITY DEFINER, GRANTed only to service_role.
    // Use admin client to bypass RLS + permission checks.
    const adminClient = createAdminClient();
    const { data, error } = await adminClient.rpc("get_pnl_summary", {
      p_period: period,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ summary: data });
  },
  { requireAuth: true }
);
