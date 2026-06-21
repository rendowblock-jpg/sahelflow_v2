import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setActiveShopId } from "@/lib/shops";

export const dynamic = "force-dynamic";

const setActiveSchema = z.object({
  shopId: z.string().min(1),
});

/**
 * PUT /api/shops/active — set the active shop.
 * Body: { shopId: string }
 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const input = setActiveSchema.parse(body);
    setActiveShopId(input.shopId);
    return NextResponse.json({ ok: true, activeShopId: input.shopId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
