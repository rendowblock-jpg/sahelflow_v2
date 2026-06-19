import { NextRequest, NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { z } from "zod";

// M3 fix: zod schema for PATCH body (was manually parsed without validation)
const notificationPatchSchema = z
  .object({
    markAllRead: z.boolean().optional(),
    id: z.string().uuid().optional(),
    read: z.boolean().optional(),
  })
  .refine((d) => d.markAllRead !== undefined || (d.id !== undefined && d.read !== undefined), {
    message: "Provide markAllRead, or both id and read",
  });

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
  async (req: NextRequest, { sellerId, supabase, body }) => {
    if (body!.markAllRead) {
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

    if (body!.id && body!.read !== undefined) {
      const { error } = await supabase
        .from("notifications")
        .update({ read: body!.read })
        .eq("id", body!.id)
        .eq("seller_id", sellerId);
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  },
  { requireAuth: true, schema: notificationPatchSchema }
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
