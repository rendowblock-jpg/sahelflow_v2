import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listShops, getActiveShopId, createShop } from "@/lib/shops";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/shops — list all shops + the active shop ID.
 */
export async function GET(): Promise<NextResponse> {
  const shops = listShops();
  const activeShopId = getActiveShopId();
  return NextResponse.json({ shops, activeShopId });
}

const createShopSchema = z.object({
  name: z.string().min(1).max(50),
  icon: z.string().max(10).optional().nullable(),
});

/**
 * POST /api/shops — create a new shop.
 * Body: { name: string, icon?: string | null }
 * Initializes the shop's SQLite file with the Prisma schema.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json();
  const input = createShopSchema.parse(body);
  const shop = createShop({ name: input.name, icon: input.icon ?? null });
  return NextResponse.json({ shop }, { status: 201 });
}, "POST /api/shops");
