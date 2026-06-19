import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { createExpenseSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

// GET /api/expenses — list expenses for authenticated seller
export const GET = withAuthAndRateLimit(
  async (req, { user: _user, sellerId, supabase }) => {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    // L9 fix: bounds-check limit/offset
    const rawLimit = parseInt(searchParams.get("limit") || "50", 10);
    const rawOffset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = Number.isNaN(rawLimit) ? 50 : Math.min(Math.max(rawLimit, 1), 100);
    const offset = Number.isNaN(rawOffset) ? 0 : Math.max(rawOffset, 0);

    let query = supabase
      .from("expenses")
      .select("*", { count: "exact" })
      .eq("seller_id", sellerId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (category && category !== "all") {
      query = query.eq("category", category);
    }

    if (startDate) {
      query = query.gte("expense_date", startDate);
    }

    if (endDate) {
      query = query.lte("expense_date", endDate);
    }

    const { data: expenses, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ expenses: expenses || [], total: count ?? 0 });
  },
  { requirePermission: "accounting:view", requireAuth: true }
);

// POST /api/expenses — create an expense
export const POST = withAuthAndRateLimit(
  async (req, { user: _user, sellerId, supabase, body }) => {
    const { category, amount, description, receipt_url, expense_date } = body!;

    const { data: expense, error } = await supabase
      .from("expenses")
      .insert({
        seller_id: sellerId,
        category,
        amount,
        description: description || null,
        receipt_url: receipt_url || null,
        expense_date: expense_date || new Date().toISOString().split("T")[0],
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ expense }, { status: 201 });
  },
  {
    requirePermission: "accounting:manage",
    schema: createExpenseSchema,
    requireAuth: true,
  }
);
