import { NextRequest, NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { addReturnNoteSchema } from "@/lib/validation";

// POST /api/returns/[id]/notes — add a comment or timeline note to a return request
export const POST = withAuthAndRateLimit(
  async (req: NextRequest, { user, sellerId, supabase, body, params }) => {
    const { id } = params;
    const { content, type = "note" } = body!;

    // 1. Verify seller owns this return request
    const { data: returnObj, error: fetchError } = await supabase
      .from("returns")
      .select("id")
      .eq("id", id)
      .eq("seller_id", sellerId)
      .single();

    if (fetchError || !returnObj) {
      return NextResponse.json({ error: "Return request not found" }, { status: 404 });
    }

    // 2. Insert return note
    const { data: note, error: insertError } = await supabase
      .from("return_notes")
      .insert({
        return_id: id,
        author_id: user.id,
        type,
        content,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ note }, { status: 201 });
  },
  {
    schema: addReturnNoteSchema,
    requireAuth: true,
  }
);
