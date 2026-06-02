import { NextRequest, NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";

export const GET = withAuthAndRateLimit(
  async (req: NextRequest, { sellerId, supabase }) => {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("seller_id", sellerId)
      .eq("dismissed", false)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ notifications: data ?? [] });
  },
  { requireAuth: true }
);

export const PATCH = withAuthAndRateLimit(
  async (req: NextRequest, { sellerId, supabase }) => {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (body.markAllRead) {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("seller_id", sellerId)
        .eq("read", false)
        .eq("dismissed", false);
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (body.id && body.read !== undefined) {
      const { error } = await supabase
        .from("notifications")
        .update({ read: body.read })
        .eq("id", body.id)
        .eq("seller_id", sellerId);
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  },
  { requireAuth: true }
);

export const DELETE = withAuthAndRateLimit(
  async (req: NextRequest, { sellerId, supabase }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { error } = await supabase
      .from("notifications")
      .update({ dismissed: true })
      .eq("id", id)
      .eq("seller_id", sellerId);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  },
  { requireAuth: true }
);
