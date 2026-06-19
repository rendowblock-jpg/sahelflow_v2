import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { updateExpenseSchema } from "@/lib/validation";

// PATCH /api/expenses/[id] — update an expense
export const PATCH = withAuthAndRateLimit(
  async (req, { user, supabase, body, params }) => {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "Expense ID is required" }, { status: 400 });
    }

    // Verify ownership first
    const { data: existing, error: checkError } = await supabase
      .from("expenses")
      .select("id")
      .eq("id", id)
      .eq("seller_id", user.id)
      .single();

    if (checkError || !existing) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const { data: expense, error } = await supabase
      .from("expenses")
      .update({
        ...body!,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ expense });
  },
  {
    requirePermission: "accounting:manage",
    schema: updateExpenseSchema,
    requireAuth: true,
  }
);

// DELETE /api/expenses/[id] — delete an expense
export const DELETE = withAuthAndRateLimit(
  async (req, { user, supabase, params }) => {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "Expense ID is required" }, { status: 400 });
    }

    // Verify ownership first
    const { data: existing, error: checkError } = await supabase
      .from("expenses")
      .select("id")
      .eq("id", id)
      .eq("seller_id", user.id)
      .single();

    if (checkError || !existing) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  },
  { requirePermission: "accounting:manage", requireAuth: true }
);
