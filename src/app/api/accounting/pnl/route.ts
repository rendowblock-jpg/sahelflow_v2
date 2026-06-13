import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";

export const dynamic = "force-dynamic";

// GET /api/accounting/pnl — get P&L summary
export const GET = withAuthAndRateLimit(
  async (req, { supabase }) => {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "30d";

    const { data, error } = await supabase.rpc("get_pnl_summary", {
      p_period: period,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ summary: data });
  },
  { requireAuth: true }
);
